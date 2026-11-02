import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { leistenAbstand, leistenKante, richteSicht, setzeAuswahl, setzeQuelle, setzeSicht, type LeistenKante } from './feld.ts';
import { leereLokal } from './lokal.ts';
import { sichereBestand, stelleBestand } from './schau.ts';

const BILDER = 'tmp-test/screens';
const TASTATUR = 520;

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await richteSicht(page);
  await meldeAn(page);
  await leereLokal(page);
});

async function warteBuendig(page: Page): Promise<LeistenKante> {
  await expect.poll(() => leistenAbstand(page)).toBeLessThanOrEqual(1);
  return leistenKante(page);
}

async function fileUeberLeiste(page: Page): Promise<number> {
  const bar = await page.getByRole('toolbar', { name: 'Format' }).boundingBox();
  const knopf = await page.getByRole('button', { name: 'File' }).boundingBox();
  if (!bar || !knopf) return 999;
  return bar.y - (knopf.y + knopf.height);
}

test('the format bar stays on the bottom edge and the File button stays above it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'handy', 'phone width');
  test.setTimeout(60_000);
  const bestand = sichereBestand();
  try {
    const leiste = page.getByRole('toolbar', { name: 'Format' });
    await expect(leiste).toBeVisible();
    await expect(leiste.getByRole('button', { name: 'Bold' })).toBeVisible();
    await expect(leiste.getByRole('button', { name: 'Link' })).toBeVisible();

    await warteBuendig(page);
    expect(await fileUeberLeiste(page)).toBeGreaterThanOrEqual(-1);
    expect(await fileUeberLeiste(page)).toBeLessThanOrEqual(16);
    await page.screenshot({ path: `${BILDER}/handy-leiste-zu.png` });

    await setzeSicht(page, TASTATUR);
    const offen = await warteBuendig(page);
    expect(offen.sichtHoehe).toBe(TASTATUR);
    expect(await fileUeberLeiste(page)).toBeGreaterThanOrEqual(-1);
    expect(await fileUeberLeiste(page)).toBeLessThanOrEqual(16);
    await page.screenshot({ path: `${BILDER}/handy-leiste-tastatur.png` });

    await setzeSicht(page, 500, 30);
    await expect.poll(async () => {
      return page.getByRole('toolbar', { name: 'Format' }).evaluate((el) => {
        const unten = Number.parseFloat(getComputedStyle(el).bottom);
        const sicht = window.visualViewport;
        const soll = window.innerHeight - (sicht?.offsetTop ?? 0) - (sicht?.height ?? window.innerHeight);
        return Math.abs(unten - Math.round(soll));
      });
    }).toBeLessThanOrEqual(1);

    await setzeSicht(page, null);
    await warteBuendig(page);
    expect(await fileUeberLeiste(page)).toBeGreaterThanOrEqual(-1);
    expect(await fileUeberLeiste(page)).toBeLessThanOrEqual(16);
    await page.screenshot({ path: `${BILDER}/handy-leiste-wieder-zu.png` });

    await setzeQuelle(page, '#Workout\nPing');
    await page.getByRole('button', { name: 'File' }).click();
    const toast = page.getByRole('status');
    await expect(toast).toContainText('Added to');
    await expect.poll(async () => {
      const meldung = await toast.boundingBox();
      const bar = await leiste.boundingBox();
      const knopf = await page.getByRole('button', { name: 'File' }).boundingBox();
      if (!meldung || !bar || !knopf) return false;
      const ueberLeiste = meldung.y + meldung.height <= bar.y + 2;
      const ueberKnopf = meldung.y + meldung.height <= knopf.y + 1;
      const nah = knopf.y - (meldung.y + meldung.height) <= 24;
      return ueberLeiste && ueberKnopf && nah;
    }).toBe(true);
    await page.screenshot({ path: `${BILDER}/handy-leiste-toast.png` });

    await setzeSicht(page, TASTATUR);
    await warteBuendig(page);
    await expect.poll(async () => {
      const meldung = await toast.boundingBox();
      const bar = await leiste.boundingBox();
      const knopf = await page.getByRole('button', { name: 'File' }).boundingBox();
      if (!meldung || !bar || !knopf) return false;
      const ueberLeiste = meldung.y + meldung.height <= bar.y + 2;
      const ueberKnopf = meldung.y + meldung.height <= knopf.y + 1;
      const nah = knopf.y - (meldung.y + meldung.height) <= 24;
      return ueberLeiste && ueberKnopf && nah;
    }).toBe(true);
    await page.screenshot({ path: `${BILDER}/handy-leiste-toast-tastatur.png` });
  } finally {
    stelleBestand(bestand);
  }
});

test('the format bar on a note sits on the keyboard and returns to the bottom edge', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'handy', 'phone width');
  test.setTimeout(60_000);
  const bestand = sichereBestand();
  try {
    const antwort = await page.request.post('/api/notes', { data: { text: 'A short note' } });
    expect(antwort.ok()).toBeTruthy();
    const id = ((await antwort.json()) as { id: number }).id;
    await page.goto(`/library/note?id=${id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('toolbar', { name: 'Format' })).toBeVisible();
    await expect(page.locator('footer.fuss')).toHaveCount(0);

    await warteBuendig(page);
    await page.screenshot({ path: `${BILDER}/handy-notiz-leiste-zu.png` });

    await setzeSicht(page, TASTATUR);
    const offen = await warteBuendig(page);
    expect(offen.sichtHoehe).toBe(TASTATUR);
    expect(offen.fussOben).toBeNull();
    await page.screenshot({ path: `${BILDER}/handy-notiz-leiste-tastatur.png` });

    await setzeSicht(page, null);
    const zu = await warteBuendig(page);
    expect(zu.sichtHoehe).toBeGreaterThan(800);
    await page.screenshot({ path: `${BILDER}/handy-notiz-leiste-wieder-zu.png` });
  } finally {
    stelleBestand(bestand);
  }
});

test('the format bar on a wide screen stays with the selection', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'wide screen');
  const leiste = page.getByRole('toolbar', { name: 'Format' });
  await expect(leiste).toHaveCount(0);
  await setzeQuelle(page, 'Hello');
  await setzeAuswahl(page, 0, 5);
  await expect(leiste).toBeVisible();
  const kasten = await leiste.boundingBox();
  expect(kasten).not.toBeNull();
  expect(kasten!.width).toBeLessThan(520);
  expect(kasten!.y + kasten!.height).toBeLessThan(700);
  await page.screenshot({ path: `${BILDER}/desktop-leiste-auswahl.png` });
});
