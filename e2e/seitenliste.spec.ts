import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { tagesLabel } from '../shared/features/library/index.ts';
import { meldeAn } from './anmelden.ts';
import { leereLokal, warteBereit } from './lokal.ts';

const BILDER = 'tmp-test/screens';

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

test('a long page title stays on one line and the date stays visible', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const thema = `Liste${testInfo.project.name}`;
  const titel = `Fresh bread from the corner market ${'before the Saturday rush '.repeat(8)}`.trim();
  const ruhe = 'Milk and tea stay on the page';
  const antwort = await page.request.post('/api/notes', {
    data: { text: `#${thema}\n${titel}\n${ruhe}` },
  });
  expect(antwort.ok()).toBeTruthy();

  await page.goto(`/library/topic?name=${encodeURIComponent(thema)}`);
  await warteBereit(page);
  await expect(page.getByRole('heading', { name: thema, level: 1 })).toBeVisible();
  const zeile = page.locator('.notiz');
  await expect(zeile).toHaveCount(1);
  await expect(zeile.locator('.ti')).toHaveText(titel);
  await expect(zeile).not.toContainText(ruhe);
  await expect(zeile.locator('.lesetext, h2, li, .termin')).toHaveCount(0);

  const gelesen = await page.request.get(`/api/library/notes?topic=${encodeURIComponent(thema)}`);
  expect(gelesen.ok()).toBeTruthy();
  const created = ((await gelesen.json()) as { notes: Array<{ created: string }> }).notes[0]?.created ?? '';
  const datum = zeile.locator('.zeit');
  await expect(datum).toHaveText(tagesLabel(created, new Date()));
  await expect(datum).toBeVisible();

  const breite = page.viewportSize()?.width ?? 0;
  const schnitt = await zeile.locator('.ti').evaluate((el) => {
    const stil = getComputedStyle(el);
    const kasten = el.getBoundingClientRect();
    return {
      overflow: stil.textOverflow,
      umbruch: stil.whiteSpace,
      hoehe: kasten.height,
      abgeschnitten: el.scrollWidth > el.clientWidth + 1,
    };
  });
  expect(schnitt.overflow).toBe('ellipsis');
  expect(schnitt.umbruch).toBe('nowrap');
  expect(schnitt.abgeschnitten).toBe(true);
  expect(schnitt.hoehe).toBeLessThanOrEqual(24);

  const zeilenHoehe = await zeile.evaluate((el) => el.getBoundingClientRect().height);
  expect(zeilenHoehe).toBeLessThanOrEqual(64);

  const datumKasten = await datum.boundingBox();
  const titelKasten = await zeile.locator('.ti').boundingBox();
  const knopf = await zeile.getByRole('button', { name: 'Note actions' }).boundingBox();
  expect(datumKasten).not.toBeNull();
  expect(titelKasten).not.toBeNull();
  expect(knopf).not.toBeNull();
  expect(titelKasten!.x + titelKasten!.width).toBeLessThanOrEqual(datumKasten!.x + 1);
  expect(datumKasten!.x + datumKasten!.width).toBeLessThanOrEqual(knopf!.x + 1);
  expect(knopf!.x + knopf!.width).toBeLessThanOrEqual(breite + 1);
  expect(datumKasten!.y).toBeGreaterThanOrEqual(0);
  expect(datumKasten!.y + datumKasten!.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) + 1);

  const farbe = await datum.evaluate((el) => getComputedStyle(el).color);
  expect(farbe).toBe('rgb(148, 148, 148)');

  const passt = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(passt).toBe(true);
  if (testInfo.project.name === 'handy') {
    expect(breite).toBe(390);
  }
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-seitenliste.png` });
});
