import { expect, test } from '@playwright/test';
import { meldeAn } from '../anmelden.ts';
import { warteBereit } from '../lokal.ts';
import { FELD, gboard, modellText, tippeAn } from './hilfen.ts';

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
