import { expect, test } from '@playwright/test';
import { meldeAn } from '../anmelden.ts';
import { warteBereit } from '../lokal.ts';
import {
  FELD,
  type Feld,
  gboard,
  invarianten,
  knopf,
  leereAuswahl,
  modellText,
  sichtbar,
  stil,
  tippeAn,
  waehleSichtbar,
} from './hilfen.ts';

test('Feld oeffnet, Haken liefert Klartext', async ({ page }) => {
  await meldeAn(page);
  await page.goto('/');
  await warteBereit(page);
  await expect(page.locator(FELD)).toBeVisible();
  const leer = await modellText(page);
  expect(leer.trim()).toBe('');
  await tippeAn(page, FELD);
  const cdp = await page.context().newCDPSession(page);
  await gboard({ page, cdp }, 'Milch');
  await expect.poll(async () => (await modellText(page)).trim()).toBe('Milch');
  const json = await page.evaluate(() => {
    const haken = (window as Window & { __cortxModell?: { json: () => unknown } }).__cortxModell;
    return haken?.json() ?? null;
  });
  expect(json).toMatchObject({ type: 'doc' });
});

const KNOEPFE = [
  ['Bold', 'fett'],
  ['Italic', 'kursiv'],
  ['Strikethrough', 'strich'],
  ['Code', 'mono'],
] as const;

const KUERZEL = [
  ['**fett** x', 'fett', 'fett'],
  ['*kursiv* x', 'kursiv', 'kursiv'],
  ['~~weg~~ x', 'weg', 'strich'],
  ['`code` x', 'code', 'mono'],
] as const;

for (const feld of ['erfassen', 'notiz'] as const) {
  test.describe(`${feld} – Handy-Abnahme`, { tag: '@F1' }, () => {
    let f!: Feld;

    test.beforeEach(async ({ page }) => {
      await meldeAn(page);
      if (feld === 'erfassen') {
        await page.goto('/');
      } else {
        const antwort = await page.request.post('/api/notes', { data: { text: 'Seite' } });
        expect(antwort.ok()).toBe(true);
        const id = ((await antwort.json()) as { id: number }).id;
        await page.goto(`/library/note?id=${id}`);
        await warteBereit(page);
        await tippeAn(page, 'header button[aria-label="Edit"]');
      }
      await warteBereit(page);
      await expect(page.locator(FELD)).toBeVisible();
      await tippeAn(page, FELD);
      if (feld === 'notiz') {
        await leereAuswahl(page);
        await expect.poll(async () => (await modellText(page)).trim()).toBe('');
      }
      f = { page, cdp: await page.context().newCDPSession(page) };
    });

    test.afterEach(async ({ page }) => {
      await invarianten(page);
    });

    test('leeres Feld: Cursor in der Platzhalterzeile', async ({ page }) => {
      const platz = page.locator('.cm-placeholder, [data-placeholder]').first();
      const p = await platz.boundingBox({ timeout: 1_000 }).catch(() => null);
      expect(p, 'Platzhalterzeile').not.toBeNull();
      const hoehe = await page.locator(`${FELD} > *`).first().evaluate((el) => el.getBoundingClientRect().height);
      expect(hoehe).toBeLessThanOrEqual((p?.height ?? 0) * 1.6);
      await gboard(f, 'Hallo');
      const text = await page.locator(FELD).getByText('Hallo').boundingBox();
      expect(text).not.toBeNull();
      expect(Math.abs((text?.y ?? 0) - (p?.y ?? 0))).toBeLessThan(4);
      await expect(page.locator(FELD)).toHaveScreenshot(`${feld}-leer-getippt.png`, { maxDiffPixelRatio: 0.01 });
    });

    for (const [knopfName, art] of KNOEPFE) {
      test(`${knopfName}: ohne Markierung an, tippen, aus, weitertippen`, async ({ page }) => {
        await gboard(f, 'eins ');
        await knopf(page, knopfName);
        await gboard(f, 'zwei');
        expect(await sichtbar(page)).toBe('eins zwei');
        await knopf(page, knopfName);
        await gboard(f, ' drei');
        expect((await stil(page, 'zwei'))[art]).toBe(true);
        expect((await stil(page, 'drei'))[art]).toBe(false);
      });

      test(`${knopfName}: auf Markierung, mehrzeilig, erneut aus`, async ({ page }) => {
        await gboard(f, 'aa\nbb\ncc dd');
        await waehleSichtbar(page, 0, 99);
        await knopf(page, knopfName);
        for (const wort of ['aa', 'bb', 'cc dd']) expect((await stil(page, wort))[art]).toBe(true);
        await knopf(page, knopfName);
        for (const wort of ['aa', 'bb', 'cc dd']) expect((await stil(page, wort))[art]).toBe(false);
      });
    }

    for (const [eingabe, wort, art] of KUERZEL) {
      test(`Kuerzel per Gboard: ${eingabe}`, async ({ page }) => {
        await gboard(f, eingabe);
        expect(await sichtbar(page)).toBe(eingabe.replace(/[*~`]/g, ''));
        expect((await stil(page, wort))[art]).toBe(true);
        expect((await stil(page, 'x'))[art]).toBe(false);
      });
    }

    test('Weitertippen nach Format verfaelscht nichts', async ({ page }) => {
      await gboard(f, 'eins ');
      await knopf(page, 'Bold');
      await gboard(f, 'zwei');
      await knopf(page, 'Bold');
      await gboard(f, ' drei vier');
      expect(await sichtbar(page)).toBe('eins zwei drei vier');
    });

    test('Pfeiltasten: jeder Druck ein sichtbares Zeichen', async ({ page }) => {
      await gboard(f, '**fett** x');
      for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowLeft');
      await gboard(f, 'Y');
      expect(await sichtbar(page)).toBe('feYtt x');
    });
  });
}
