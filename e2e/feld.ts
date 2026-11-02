import { expect, type Page } from '@playwright/test';

interface Sicht {
  cm?: {
    focus: () => void;
    dispatch: (spec: object) => void;
    state: {
      doc: { length: number; toString: () => string };
      selection: { main: { head: number; anchor: number } };
    };
  };
}

function sicht(page: Page) {
  return page.locator('.schreib .cm-editor');
}

export async function liesQuelle(page: Page): Promise<string> {
  return sicht(page).evaluate((el) => (el as unknown as Sicht).cm?.state.doc.toString() ?? '');
}

export async function erwarteQuelle(page: Page, text: string): Promise<void> {
  await expect.poll(() => liesQuelle(page)).toBe(text);
}

export async function cursorKopf(page: Page): Promise<number> {
  return sicht(page).evaluate((el) => (el as unknown as Sicht).cm?.state.selection.main.head ?? -1);
}

export async function setzeQuelle(page: Page, text: string): Promise<void> {
  await sicht(page).evaluate((el, wert: string) => {
    const cm = (el as unknown as Sicht).cm;
    if (!cm) return;
    cm.focus();
    cm.dispatch({
      changes: { from: 0, to: cm.state.doc.length, insert: wert },
      selection: { anchor: wert.length },
    });
  }, text);
  await erwarteQuelle(page, text);
}

export async function setzeAuswahl(page: Page, anchor: number, head: number): Promise<void> {
  await sicht(page).evaluate((el, wahl: { anchor: number; head: number }) => {
    const cm = (el as unknown as Sicht).cm;
    if (!cm) return;
    cm.focus();
    cm.dispatch({ selection: { anchor: wahl.anchor, head: wahl.head } });
  }, { anchor, head });
}

export async function setzeCursor(page: Page, index: number): Promise<void> {
  await setzeAuswahl(page, index, index);
}
