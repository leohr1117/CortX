import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeAuswahl, setzeQuelle } from './feld.ts';
import { leereLokal, warteBereit } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand } from './schau.ts';

const BILDER = 'tmp-test/screens';

const KOMBI = ['***Test***', '**_x_**', '_**y**_', '~~**z**~~', '**!!w!!**', '!!**v**!!', '!!!! **fett**'].join('\n');

function versatz(stunde: number, minute: number): string {
  const jetzt = new Date();
  return new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), stunde, minute, 0, 0).toISOString();
}

interface Kante {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

async function oeffne(page: Page): Promise<void> {
  await page.goto('/library/topic?name=Work');
  await page.locator('.notiz', { hasText: 'Test' }).locator('a.tx').click();
  await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
}

test('combined formatting shows together on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'handy', 'phone width');
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  try {
    setzeSchauspiel([{ name: 'Work', notizen: [{ text: KOMBI, created: versatz(9, 12) }] }]);
    await oeffne(page);
    await expect(page.locator('.lesetext strong em')).toHaveText(['Test', 'x']);
    await expect(page.locator('.lesetext em strong')).toHaveText('y');
    await expect(page.locator('.lesetext s strong')).toHaveText('z');
    const markiert = page.locator('.lesetext strong mark');
    await expect(markiert.locator('.sr-nur')).toHaveText('Wichtig');
    const wort = await markiert.evaluate((el) =>
      [...el.childNodes]
        .filter((knoten) => knoten.nodeType === Node.TEXT_NODE)
        .map((knoten) => knoten.textContent ?? '')
        .join(''),
    );
    expect(wort).toBe('w');
    await expect(page.locator('.lesetext mark strong')).toHaveText(['v', 'fett']);
    await expect(page.locator('.wichtigzeile strong')).toHaveText('fett');

    await page.getByRole('button', { name: 'Edit' }).click();
    const leiste = page.getByRole('toolbar', { name: 'Format' });
    await expect(leiste.getByRole('button', { name: 'Important' })).toHaveAttribute('title', 'Important');
    await expect(leiste.getByRole('button', { name: 'Checklist' })).toHaveAttribute('title', 'Checklist');
    await expect(leiste.getByRole('button', { name: 'Bulleted list' })).toHaveAttribute('title', 'Bulleted list');
    await expect(leiste.getByRole('button', { name: 'Bold' })).toHaveAttribute('title', 'Bold');
    await expect(leiste.getByRole('button', { name: 'Link' })).toHaveAttribute('title', 'Link');
    await expect(page.locator('.schreib .cm-fett.cm-kursiv', { hasText: 'Test' })).toBeVisible();
    await expect(page.locator('.schreib .cm-strich.cm-fett', { hasText: 'z' })).toBeVisible();
    await expect(page.locator('.schreib .cm-wichtig.cm-fett', { hasText: 'fett' })).toBeVisible();
    await page.screenshot({ path: `${BILDER}/handy-format-icons.png`, fullPage: true });
  } finally {
    stelleBestand(bestand);
  }
});

test('a space after formatting survives typing and reload on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'handy', 'phone width');
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  try {
    setzeSchauspiel([{ name: 'Work', notizen: [{ text: '**Hello**', created: versatz(10, 5) }] }]);
    await page.goto('/library/topic?name=Work');
    await page.locator('.notiz', { hasText: 'Hello' }).locator('a.tx').click();
    await page.getByRole('button', { name: 'Edit' }).click();
    await setzeQuelle(page, '**Hello**');
    await page.locator('.schreib .cm-content').press('End');
    await page.keyboard.press(' ');
    await erwarteQuelle(page, '**Hello** ');
    await expect.poll(() => sichereBestand().notes.find((eintrag) => eintrag.text.includes('Hello'))?.text ?? '').toBe('**Hello** ');
    await page.reload();
    await warteBereit(page);
    await page.getByRole('button', { name: 'Edit' }).click();
    await erwarteQuelle(page, '**Hello** ');
  } finally {
    stelleBestand(bestand);
  }
});

test('a phone selection sits on the formatted text', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'handy', 'phone width');
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  try {
    await page.addInitScript(() => {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        if (query.includes('pointer') && query.includes('coarse')) {
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() {
              return false;
            },
          } as MediaQueryList;
        }
        return orig(query);
      };
    });
    setzeSchauspiel([{ name: 'Work', notizen: [{ text: '***Test***', created: versatz(11, 0) }] }]);
    await oeffne(page);
    await page.getByRole('button', { name: 'Edit' }).click();
    const quelle = '***Test***';
    const start = quelle.indexOf('Test');
    await setzeQuelle(page, quelle);
    await setzeAuswahl(page, start, start + 'Test'.length);
    const lage = await page.evaluate(() => {
      const span = document.querySelector('.schreib .cm-fett.cm-kursiv');
      const bereich = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0).getBoundingClientRect() : null;
      const text = span?.getBoundingClientRect();
      const kante = (rect: DOMRect | null | undefined): Kante => ({
        left: rect?.left ?? 0,
        right: rect?.right ?? 0,
        top: rect?.top ?? 0,
        bottom: rect?.bottom ?? 0,
      });
      return { text: kante(text), auswahl: kante(bereich) };
    });
    expect(lage.text.right).toBeGreaterThan(lage.text.left);
    expect(Math.abs(lage.auswahl.left - lage.text.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(lage.auswahl.right - lage.text.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(lage.auswahl.top - lage.text.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(lage.auswahl.bottom - lage.text.bottom)).toBeLessThanOrEqual(1);
  } finally {
    stelleBestand(bestand);
  }
});
