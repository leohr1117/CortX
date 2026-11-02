import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { leistenKante, richteSicht, setzeAuswahl, setzeQuelle, setzeSicht, type LeistenKante } from './feld.ts';
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

function abstand(kante: LeistenKante, ziel: number | null): number {
  if (ziel === null) return 999;
  return Math.abs(kante.unten - ziel);
}

async function warteBuendig(page: Page, art: 'fuss' | 'sicht'): Promise<LeistenKante> {
  let letzte: LeistenKante | null = null;
  await expect.poll(async () => {
    letzte = await leistenKante(page);
    return abstand(letzte, art === 'fuss' ? letzte.fussOben : letzte.sichtHoehe);
  }).toBeLessThanOrEqual(2);
  if (!letzte) throw new Error('Format bar was not measured.');
  return letzte;
}

test('the format bar sits on the keyboard and returns above File', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'handy', 'phone width');
  test.setTimeout(60_000);
  const bestand = sichereBestand();
  try {
    const leiste = page.getByRole('toolbar', { name: 'Format' });
    await expect(leiste).toBeVisible();
    await expect(leiste.getByRole('button', { name: 'Bold' })).toBeVisible();
    await expect(leiste.getByRole('button', { name: 'Link' })).toBeVisible();

    const zu = await warteBuendig(page, 'fuss');
    expect(zu.fileOben).not.toBeNull();
    expect(Math.abs((zu.fileOben ?? 0) - zu.unten)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `${BILDER}/handy-leiste-zu.png` });

    await setzeSicht(page, TASTATUR);
    const offen = await warteBuendig(page, 'sicht');
    expect(offen.sichtHoehe).toBe(TASTATUR);
    expect(offen.fileOben).not.toBeNull();
    expect((offen.fileOben ?? 0) - offen.unten).toBeGreaterThan(40);
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
    const zurueck = await warteBuendig(page, 'fuss');
    expect(Math.abs((zurueck.fileOben ?? 0) - zurueck.unten)).toBeLessThanOrEqual(2);
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
      const nah = bar.y - (meldung.y + meldung.height) <= 24;
      return ueberLeiste && ueberKnopf && nah;
    }).toBe(true);
    await page.screenshot({ path: `${BILDER}/handy-leiste-toast.png` });

    await setzeSicht(page, TASTATUR);
    await warteBuendig(page, 'sicht');
    await expect.poll(async () => {
      const meldung = await toast.boundingBox();
      const bar = await leiste.boundingBox();
      if (!meldung || !bar) return false;
      return meldung.y + meldung.height <= bar.y + 2 && bar.y - (meldung.y + meldung.height) <= 24;
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

    await warteBuendig(page, 'sicht');
    await page.screenshot({ path: `${BILDER}/handy-notiz-leiste-zu.png` });

    await setzeSicht(page, TASTATUR);
    const offen = await warteBuendig(page, 'sicht');
    expect(offen.sichtHoehe).toBe(TASTATUR);
    expect(offen.fussOben).toBeNull();
    await page.screenshot({ path: `${BILDER}/handy-notiz-leiste-tastatur.png` });

    await setzeSicht(page, null);
    const zu = await warteBuendig(page, 'sicht');
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
