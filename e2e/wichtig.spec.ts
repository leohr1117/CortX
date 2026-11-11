import fs from 'node:fs';
import { expect, festeZeit, test, type Page } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeAuswahl, setzeCursor, setzeQuelle } from './feld.ts';
import { leereLokal } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand } from './schau.ts';

const BILDER = 'tmp-test/screens';

const TEXT = [
  'See !!Anna!! today.',
  '!!!! Bring milk',
  'Wow!!',
  'Hallo!! Wie gehts!!',
  'Super!! Und dann toll!!',
  'Code `!!not!!` stays.',
  '!![Bild](https://example.com/a.png)',
].join('\n');

function versatz(stunde: number, minute: number): string {
  return festeZeit(0, stunde, minute);
}

async function oeffne(page: Page): Promise<void> {
  await page.goto('/library/topic?name=Work');
  await page.locator('.notiz', { hasText: 'Anna' }).locator('a.tx').click();
}

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

test('the Wichtig button marks words and a line on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'handy', 'phone width');
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  try {
    setzeSchauspiel([{ name: 'Work', notizen: [{ text: TEXT, created: versatz(9, 20) }] }]);
    await oeffne(page);
    await expect(page.locator('mark', { hasText: 'Anna' })).toBeVisible();
    expect(await page.locator('mark', { hasText: 'Anna' }).evaluate((el) => getComputedStyle(el).color)).toBe(
      'rgb(20, 20, 20)',
    );
    await expect(page.locator('.wichtigzeile')).toContainText('Bring milk');
    await expect(page.locator('.sr-nur').first()).toHaveText('Wichtig');
    await expect(page.locator('.lauf', { hasText: 'Wow!!' }).locator('mark')).toHaveCount(0);
    await page.screenshot({ path: `${BILDER}/handy-wichtig-read.png`, fullPage: true });

    await page.getByRole('button', { name: 'Edit' }).click();
    const leiste = page.getByRole('toolbar', { name: 'Format' });
    const knopf = leiste.getByRole('button', { name: 'Important' });
    await expect(knopf).toBeVisible();
    await expect(knopf).toHaveText('');
    await expect(knopf.locator('svg')).toBeVisible();
    await expect(page.locator('.schreib .cm-wichtig').first()).toBeVisible();
    await expect(page.locator('.schreib .cm-wichtig-zeile')).toBeVisible();
    await page.screenshot({ path: `${BILDER}/handy-wichtig-edit.png`, fullPage: true });

    await expect(page.locator('.schreib .cm-wichtig', { hasText: 'Anna' })).toBeVisible();
    expect(
      await page.locator('.schreib .cm-wichtig', { hasText: 'Anna' }).evaluate((el) => getComputedStyle(el).color),
    ).toBe('rgb(20, 20, 20)');
    await expect(page.locator('.schreib .cm-wichtig', { hasText: 'Anna' })).not.toContainText('!!');
    await expect(page.locator('.schreib .cm-wichtig-zeile')).not.toContainText('!!');
    await expect(page.locator('.schreib')).toContainText('!!not!!');

    await setzeQuelle(page, 'Hello');
    await setzeAuswahl(page, 0, 5);
    await knopf.click();
    await erwarteQuelle(page, '!!Hello!!');
    await expect(knopf).toHaveAttribute('aria-pressed', 'true');
    await knopf.click();
    await erwarteQuelle(page, 'Hello');

    await setzeQuelle(page, 'Milk');
    await setzeCursor(page, 0);
    await knopf.click();
    await erwarteQuelle(page, '!!!! Milk');
    await knopf.click();
    await erwarteQuelle(page, 'Milk');
  } finally {
    stelleBestand(bestand);
  }
});

test('Wichtig shows inline and as a line on a wide screen', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop width');
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  try {
    setzeSchauspiel([{ name: 'Work', notizen: [{ text: TEXT, created: versatz(9, 20) }] }]);
    await oeffne(page);
    const anna = page.locator('mark', { hasText: 'Anna' });
    await expect(anna).toBeVisible();
    await expect(anna.locator('.sr-nur')).toHaveText('Wichtig');
    const zeile = page.locator('.wichtigzeile');
    await expect(zeile).toContainText('Bring milk');
    await expect(zeile.locator('mark')).toBeVisible();
    await expect(page.locator('.lauf', { hasText: 'Wow!!' }).locator('mark')).toHaveCount(0);
    await expect(page.locator('.lauf', { hasText: 'Hallo!! Wie gehts!!' }).locator('mark')).toHaveCount(0);
    await expect(page.locator('.lauf', { hasText: 'Super!! Und dann toll!!' }).locator('mark')).toHaveCount(0);
    await expect(page.locator('code')).toHaveText('!!not!!');
    await expect(page.locator('.lauf', { hasText: '!![Bild]' }).locator('mark')).toHaveCount(0);
    const farben = await anna.evaluate((el) => {
      const stil = getComputedStyle(el);
      return { hintergrund: stil.backgroundColor, schrift: stil.color };
    });
    expect(farben.hintergrund).toBe('rgb(243, 226, 168)');
    expect(farben.schrift).toBe('rgb(20, 20, 20)');
    const balken = await zeile.evaluate((el) => getComputedStyle(el).borderLeftWidth);
    expect(balken).toBe('3px');
    await page.screenshot({ path: `${BILDER}/desktop-wichtig-read.png`, fullPage: true });
  } finally {
    stelleBestand(bestand);
  }
});
