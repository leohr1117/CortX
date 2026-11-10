import { tagesLabel } from '../shared/features/library/index.ts';
import { expect, FESTE_UHR, test, type Page } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand } from './schau.ts';

const THEMA = 'Clock';

async function zeige(page: Page, uhr: Date, erste: boolean): Promise<void> {
  const stand = page.waitForResponse(
    (antwort) => antwort.request().method() === 'GET' && new URL(antwort.url()).pathname === '/api/version',
  );
  if (erste) await page.goto(`/library/topic?name=${encodeURIComponent(THEMA)}`);
  else await page.reload();
  await stand;
  const label = tagesLabel(FESTE_UHR.toISOString(), uhr);
  await expect(page.getByRole('heading', { name: THEMA, level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(label);
  await expect(page.locator('.zeit')).toHaveText(label);
}

test('a dated list matches after the clock leaves and returns', async ({ page }) => {
  test.setTimeout(60_000);
  await meldeAn(page);
  const bestand = sichereBestand();
  const spaeter = new Date(FESTE_UHR.getTime() + 2 * 24 * 60 * 60 * 1000);
  try {
    setzeSchauspiel([
      { name: THEMA, notizen: [{ text: 'Fixed page', created: FESTE_UHR.toISOString() }] },
    ]);
    await zeige(page, FESTE_UHR, true);
    const erste = await page.screenshot();

    await page.clock.setSystemTime(spaeter);
    await zeige(page, spaeter, false);

    await page.clock.setSystemTime(FESTE_UHR);
    await zeige(page, FESTE_UHR, false);
    const zweite = await page.screenshot();
    expect(erste.equals(zweite)).toBe(true);
  } finally {
    stelleBestand(bestand);
  }
});
