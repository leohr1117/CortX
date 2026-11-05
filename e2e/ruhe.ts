import { test as basis, expect, type Locator, type Page, type TestInfo } from '@playwright/test';

const JAHR = 2026;
const MONAT = 10;
const TAG = 15;

export const FESTE_UHR = new Date(JAHR, MONAT, TAG, 10, 0, 0);

export function festeZeit(tage: number, stunde: number, minute: number): string {
  return new Date(JAHR, MONAT, TAG + tage, stunde, minute, 0, 0).toISOString();
}

export function festesDatum(monat: number, tag: number, stunde: number, minute: number): string {
  return new Date(JAHR, monat - 1, tag, stunde, minute, 0, 0).toISOString();
}

function masken(page: Page): Locator[] {
  return [
    page.locator('.karte'),
    page.locator('[data-update-hinweis]'),
    page.locator('.termin'),
    page.locator('p.ablage'),
  ];
}

export const test = basis.extend({
  page: async ({ page }, nutzen) => {
    await page.clock.install({ time: FESTE_UHR });
    await page.clock.resume();
    const roh = page.screenshot.bind(page);
    page.screenshot = (async (optionen) => {
      const bisher = optionen?.mask ?? [];
      return roh({ ...optionen, mask: [...bisher, ...masken(page)] });
    }) as typeof page.screenshot;
    await nutzen(page);
  },
});

export { expect, type Locator, type Page, type TestInfo };
