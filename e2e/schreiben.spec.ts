import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { absatzHoehe, erwarteQuelle, hakenKante, liesQuelle, listenKanten, setzeAuswahl, setzeCursor, setzeQuelle } from './feld.ts';
import { leereLokal, warteBereit } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand } from './schau.ts';

const BILDER = 'tmp-test/screens';

const BEISPIEL = '**a**\n**b**\n**c** d **e**';
const BEISPIEL_FETT = '**a**\n**b**\n**c d e**';
const ZWEI = '__alpha__\n__beta__\ngamma';
const KASTEN = '- [ ] a\nkeep';

function versatz(stunde: number, minute: number): string {
  const jetzt = new Date();
  return new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), stunde, minute, 0, 0).toISOString();
}

async function imEditor(page: Page, text: string): Promise<void> {
  setzeSchauspiel([{ name: 'Work', notizen: [{ text, created: versatz(9, 12) }] }]);
  await page.goto('/library/topic?name=Work');
  await page.locator('.notiz').first().locator('a.tx').click();
  await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
  await page.getByRole('button', { name: 'Edit' }).click();
  await erwarteQuelle(page, text);
}

async function stand(page: Page): Promise<{ version: number; text: string }> {
  const id = new URL(page.url()).searchParams.get('id');
  const antwort = await page.request.get(`/api/notes/${id}`);
  expect(antwort.ok()).toBeTruthy();
  return (await antwort.json()) as { version: number; text: string };
}

async function vorher(page: Page, inputType: string, data: string | null = null): Promise<void> {
  const feld = page.getByRole('textbox', { name: 'Note' });
  await feld.focus();
  await feld.evaluate((el, angabe: { inputType: string; data: string | null }) => {
    el.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: angabe.inputType,
        data: angabe.data,
      }),
    );
  }, { inputType, data });
}

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

test('the format bar bolds a mixed note without showing marker characters', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  const handy = testInfo.project.name === 'handy';
  try {
    await imEditor(page, BEISPIEL);
    const leiste = page.getByRole('toolbar', { name: 'Format' });
    const fett = leiste.getByRole('button', { name: 'Bold' });
    if (!handy) await expect(leiste).toHaveCount(0);
    await setzeAuswahl(page, 0, BEISPIEL.length);
    await expect(leiste).toBeVisible();
    await expect(fett).toHaveAttribute('aria-pressed', 'false');
    await fett.click();
    await erwarteQuelle(page, BEISPIEL_FETT);
    await expect(fett).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.schreib.modell-host')).not.toContainText('*');
    await expect(page.locator('.schreib strong', { hasText: 'c d e' })).toBeVisible();
    await expect.poll(() => sichereBestand().notes.some((eintrag) => eintrag.text === BEISPIEL_FETT)).toBe(true);
    if (handy) await page.screenshot({ path: `${BILDER}/handy-schreiben-fett.png`, fullPage: true });
  } finally {
    stelleBestand(bestand);
  }
});

test('opening and closing a note without typing does not save', async ({ page }) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  const saves: string[] = [];
  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    if (!/\/api\/notes\/\d+$/.test(new URL(req.url()).pathname)) return;
    saves.push(req.postData() ?? '');
  });
  try {
    await imEditor(page, ZWEI);
    const anfang = await stand(page);
    expect(anfang.text).toBe(ZWEI);
    await expect.poll(async () => (await stand(page)).version, { timeout: 1200 }).toBe(anfang.version);
    await page.getByRole('button', { name: 'Read' }).click();
    await expect(page.getByRole('textbox', { name: 'Note' })).toHaveCount(0);
    await expect.poll(async () => (await stand(page)).version, { timeout: 1200 }).toBe(anfang.version);
    expect((await stand(page)).text).toBe(ZWEI);
    expect(saves).toEqual([]);
  } finally {
    stelleBestand(bestand);
  }
});

test('editing the second line leaves the other lines unchanged', async ({ page }) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  try {
    await imEditor(page, ZWEI);
    await setzeCursor(page, ZWEI.indexOf('beta'));
    await page.keyboard.type('X');
    await expect.poll(async () => {
      const zeilen = (await liesQuelle(page)).split('\n');
      return zeilen[0] === '__alpha__' && zeilen[2] === 'gamma' && zeilen[1]?.includes('X') === true;
    }).toBe(true);
    const zeilen = (await liesQuelle(page)).split('\n');
    expect(zeilen[0]).toBe('__alpha__');
    expect(zeilen[2]).toBe('gamma');
    expect(zeilen[1]).toContain('beta');
    expect(zeilen[1]).toContain('X');
    await expect.poll(() => {
      const gespeichert = sichereBestand().notes.find((eintrag) => eintrag.text.includes('X'));
      return gespeichert?.text.split('\n') ?? [];
    }).toEqual(zeilen);
  } finally {
    stelleBestand(bestand);
  }
});

test('a checklist stays one block and replaces another list', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  const handy = testInfo.project.name === 'handy';
  try {
    await imEditor(page, 'a\nb');
    const leiste = page.getByRole('toolbar', { name: 'Format' });
    const haken = leiste.getByRole('button', { name: 'Checklist' });
    const liste = leiste.getByRole('button', { name: 'Bulleted list' });
    await setzeAuswahl(page, 0, 3);
    await haken.click();
    await erwarteQuelle(page, '[] a\n[] b');
    await expect(haken).toHaveAttribute('aria-pressed', 'true');
    await expect(liste).toHaveAttribute('aria-pressed', 'false');
    await haken.click();
    await erwarteQuelle(page, 'a\nb');
    await expect(haken).toHaveAttribute('aria-pressed', 'false');
    await haken.click();
    await erwarteQuelle(page, '[] a\n[] b');
    await expect(page.locator('.schreib .cm-haken')).toHaveCount(2);
    if (handy) await page.screenshot({ path: `${BILDER}/handy-schreiben-checkliste.png`, fullPage: true });

    await setzeQuelle(page, '- a\n- b');
    await setzeAuswahl(page, 0, 7);
    await expect(liste).toHaveAttribute('aria-pressed', 'true');
    await haken.click();
    await erwarteQuelle(page, '[] a\n[] b');
    await expect(haken).toHaveAttribute('aria-pressed', 'true');
    await expect(liste).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => sichereBestand().notes.some((eintrag) => eintrag.text === '[] a\n[] b')).toBe(true);
    await liste.click();
    await erwarteQuelle(page, '- a\n- b');
    await expect.poll(() => sichereBestand().notes.some((eintrag) => eintrag.text === '- a\n- b')).toBe(true);
  } finally {
    stelleBestand(bestand);
  }
});

test('enter, shift enter, and backspace edit a list in a note', async ({ page }) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  try {
    await imEditor(page, '- milk');
    await page.keyboard.press('Enter');
    await erwarteQuelle(page, '- milk\n- ');

    await setzeQuelle(page, '* milk');
    await page.keyboard.press('Enter');
    await erwarteQuelle(page, '* milk\n* ');

    await setzeQuelle(page, '[] call');
    await page.keyboard.press('Enter');
    await erwarteQuelle(page, '[] call\n[] ');

    await setzeQuelle(page, '[x] done');
    await page.keyboard.press('Enter');
    await erwarteQuelle(page, '[x] done\n[] ');

    await setzeQuelle(page, '- [x] done');
    await page.keyboard.press('Enter');
    await erwarteQuelle(page, '- [x] done\n- [ ] ');

    await setzeQuelle(page, '- ');
    await page.keyboard.press('Enter');
    await erwarteQuelle(page, '');

    await setzeQuelle(page, '- hello');
    await page.keyboard.press('Shift+Enter');
    await erwarteQuelle(page, '- hello\n  ');

    await setzeQuelle(page, '- ');
    await page.keyboard.press('Backspace');
    await erwarteQuelle(page, '');

    await setzeQuelle(page, 'hello');
    await page.keyboard.press('Enter');
    await erwarteQuelle(page, 'hello\n');
    await expect(page.getByRole('status')).toHaveCount(0);

    await setzeQuelle(page, '1. milk');
    await page.keyboard.press('Enter');
    await erwarteQuelle(page, '1. milk\n2. ');
  } finally {
    stelleBestand(bestand);
  }
});

test('a phone insert event edits a list in a note before the editor does', async ({ page }) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  try {
    await imEditor(page, '- milk');
    await vorher(page, 'insertParagraph');
    await erwarteQuelle(page, '- milk\n- ');

    await setzeQuelle(page, '- milk');
    await vorher(page, 'insertLineBreak');
    await erwarteQuelle(page, '- milk\n  ');

    await setzeQuelle(page, '[] call');
    await vorher(page, 'insertText', '\n');
    await erwarteQuelle(page, '[] call\n[] ');

    await setzeQuelle(page, '- ');
    await vorher(page, 'deleteContentBackward');
    await erwarteQuelle(page, '');

    await setzeQuelle(page, 'hello');
    const feld = page.getByRole('textbox', { name: 'Note' });
    const verhindert = await feld.evaluate((el) => {
      let gehalten = false;
      const horch = (event: Event) => {
        gehalten = event.defaultPrevented;
      };
      el.addEventListener('beforeinput', horch, true);
      el.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertParagraph',
          data: null,
        }),
      );
      el.removeEventListener('beforeinput', horch, true);
      return gehalten;
    });
    expect(verhindert).toBe(false);
    await erwarteQuelle(page, 'hello');
    await expect(page.getByRole('status')).toHaveCount(0);
  } finally {
    stelleBestand(bestand);
  }
});

test('pasted markdown is formatted and stored in canonical text', async ({ page }) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  try {
    await imEditor(page, 'Start');
    await setzeQuelle(page, '');
    await page.getByRole('textbox', { name: 'Note' }).evaluate((el) => {
      const data = new DataTransfer();
      data.setData('text/plain', '**a** *b* - c');
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: data });
      el.dispatchEvent(event);
    });
    await erwarteQuelle(page, '**a** *b* - c');
    await expect(page.locator('.schreib strong')).toHaveText('a');
    await expect(page.locator('.schreib em')).toHaveText('b');
    await expect(page.locator('.schreib.modell-host')).not.toContainText('*');
    await expect.poll(() => sichereBestand().notes.some((eintrag) => eintrag.text === '**a** *b* - c')).toBe(true);
  } finally {
    stelleBestand(bestand);
  }
});

test('a checkbox toggles in the editor, survives reload, and undoes', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  const handy = testInfo.project.name === 'handy';
  try {
    await imEditor(page, KASTEN);
    const haken = page.locator('.schreib .cm-haken');
    await expect(haken).toHaveCount(1);
    const feld = page.getByRole('textbox', { name: 'Note' });
    await feld.blur();
    if (handy) await haken.tap();
    else await haken.click();
    if (handy) await expect(feld).not.toBeFocused();
    await expect.poll(async () => (await liesQuelle(page)).includes('[x]')).toBe(true);
    expect((await liesQuelle(page)).split('\n')[1]).toBe('keep');
    await feld.focus();
    await page.keyboard.press('Control+z');
    await erwarteQuelle(page, KASTEN);

    if (handy) {
      await feld.blur();
      await haken.tap();
      await expect(feld).not.toBeFocused();
    } else {
      await haken.click();
    }
    await expect.poll(async () => (await liesQuelle(page)).includes('[x]')).toBe(true);
    expect((await liesQuelle(page)).split('\n')[1]).toBe('keep');
    await expect.poll(() => {
      const text = sichereBestand().notes.find((eintrag) => eintrag.text.includes('[x]'))?.text ?? '';
      return text.endsWith('keep') && text.includes('[x]');
    }).toBe(true);
    await page.reload();
    await warteBereit(page);
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect.poll(async () => (await liesQuelle(page)).includes('[x]')).toBe(true);
    expect((await liesQuelle(page)).split('\n')[1]).toBe('keep');

    const nochmal = page.locator('.schreib .cm-haken');
    if (handy) await nochmal.tap();
    else await nochmal.click();
    await erwarteQuelle(page, '[] a\nkeep');
  } finally {
    stelleBestand(bestand);
  }
});

test('a bullet keeps a gap and the line spacing stays', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const bestand = sichereBestand();
  const handy = testInfo.project.name === 'handy';
  try {
    await imEditor(page, 'plain\n- three\n[] task');
    const editor = await listenKanten(page);
    const plain = await absatzHoehe(page);
    const haken = await hakenKante(page);
    expect(editor).toHaveLength(1);
    expect(editor[0]?.einzug).toBe(16);
    expect(editor[0]?.luecke).toBeGreaterThan(8);
    expect(editor[0]?.luecke).toBeLessThan(10);
    expect(Math.abs((editor[0]?.hoehe ?? 0) - plain)).toBeLessThan(1.5);
    expect(haken.einzug).toBe(0);
    expect(haken.abstand).toBe(8);
    expect(Math.abs(haken.hoehe - plain)).toBeLessThan(1.5);
    await erwarteQuelle(page, 'plain\n- three\n[] task');
    if (handy) await page.screenshot({ path: `${BILDER}/handy-schreiben-liste.png`, fullPage: true });
  } finally {
    stelleBestand(bestand);
  }
});
