import fs from 'node:fs';
import { expect, festeZeit, test, type Locator, type Page } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { liesQuelle, richteSicht, setzeQuelle, setzeSicht, tippe, wische } from './feld.ts';
import { leereLokal } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand, type SaatNotiz, type SaatThema } from './schau.ts';

const BILDER = 'tmp-test/screens';
const SEITEN = 30;
const THEMEN = 30;
const TASTATUR = 420;
const LETZTES = 'Topic30';
const LETZTE_SEITE = 'Alpha30';

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await richteSicht(page);
  await meldeAn(page);
  await leereLokal(page);
});

function heute(minute: number): string {
  return festeZeit(0, 8, minute);
}

function bestand(): SaatThema[] {
  const seiten: SaatNotiz[] = [];
  for (let index = 1; index <= SEITEN; index += 1) {
    seiten.push({ text: `Alpha${String(index).padStart(2, '0')}`, created: heute(index % 60) });
  }
  const themen: SaatThema[] = [];
  for (let index = 1; index <= THEMEN; index += 1) {
    themen.push({ name: `Topic${String(index).padStart(2, '0')}`, notizen: index === 1 ? seiten : [] });
  }
  return themen;
}

async function kannScrollen(liste: Locator): Promise<void> {
  const stand = await liste.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight, top: el.scrollTop }));
  expect(stand.scroll).toBeGreaterThan(stand.client + 80);
  expect(stand.top).toBe(0);
}

async function still(liste: Locator): Promise<void> {
  let vorher = -1;
  for (let versuch = 0; versuch < 8; versuch += 1) {
    const top = await liste.evaluate((el) => el.scrollTop);
    if (versuch > 0 && Math.abs(top - vorher) < 1) return;
    vorher = top;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

async function finger(page: Page, liste: Locator, richtung: 'hoch' | 'runter' = 'runter'): Promise<void> {
  const box = await liste.boundingBox();
  if (!box) throw new Error('List is not visible.');
  const x = box.x + Math.min(48, box.width / 2);
  const oben = box.y + box.height * 0.28;
  const unten = box.y + box.height * 0.82;
  if (richtung === 'runter') await wische(page, x, unten, oben);
  else await wische(page, x, oben, unten);
}

async function festUnten(neu: Locator): Promise<void> {
  const paar = await neu.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const box = el.closest('.mit-neu')?.getBoundingClientRect();
    const rolle = el.closest('.mit-neu')?.querySelector('.rolle')?.getBoundingClientRect();
    if (!box || rect.height < 24) return null;
    return {
      abstand: box.bottom - rect.bottom,
      ueberListe: rolle ? rect.top - rolle.bottom : 1,
      hoehe: rect.height,
    };
  });
  expect(paar, 'pinned row').not.toBeNull();
  expect(paar!.hoehe).toBeGreaterThan(24);
  expect(paar!.abstand).toBeGreaterThanOrEqual(-1);
  expect(paar!.abstand).toBeLessThanOrEqual(16);
  expect(paar!.ueberListe).toBeGreaterThanOrEqual(-1);
  await expect(neu).toBeVisible();
}

async function liegtFrei(ziel: Locator, neu: Locator): Promise<void> {
  const [zeile, fuss] = await Promise.all([
    ziel.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const rolle = el.closest('.rolle')?.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height, rolleOben: rolle?.top ?? 0, rolleUnten: rolle?.bottom ?? -1 };
    }),
    neu.evaluate((el) => el.getBoundingClientRect().top),
  ]);
  expect(zeile.height).toBeGreaterThan(24);
  expect(zeile.top).toBeGreaterThanOrEqual(zeile.rolleOben - 1);
  expect(zeile.bottom).toBeLessThanOrEqual(zeile.rolleUnten + 1);
  expect(zeile.bottom).toBeLessThanOrEqual(fuss + 1);
}

function wirfGesammelt(ursachen: readonly unknown[], folge: readonly unknown[]): void {
  const alle = [...ursachen, ...folge];
  if (alle.length === 0) return;
  if (alle.length === 1) throw alle[0];
  throw new AggregateError(alle, 'Several errors');
}

async function bisSichtbar(page: Page, liste: Locator, ziel: Locator): Promise<void> {
  for (let versuch = 0; versuch < 24; versuch += 1) {
    const lage = await ziel.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const rahmen = el.closest('.rolle');
      if (!(rahmen instanceof HTMLElement) || rect.height <= 0) return 'runter';
      const kante = rahmen.getBoundingClientRect();
      if (rect.top >= kante.top - 1 && rect.bottom <= kante.bottom + 1) return 'drin';
      return rect.top < kante.top ? 'hoch' : 'runter';
    });
    if (lage === 'drin') return;
    await finger(page, liste, lage);
  }
  throw new Error('Last row stayed outside the list.');
}

function nameZeile(wurzel: Locator, name: string): Locator {
  return wurzel.getByRole('option', { name: new RegExp(`^${name}\\b`) });
}

async function tippeMitte(page: Page, ziel: Locator): Promise<void> {
  const box = await ziel.boundingBox();
  if (!box || box.height < 12) throw new Error('Row is not tappable.');
  await tippe(page, box.x + Math.min(48, box.width / 2), box.y + box.height / 2);
}

async function vorschlag(page: Page, text: string): Promise<{ rahmen: Locator; liste: Locator; neu: Locator }> {
  await page.goto('/');
  await setzeQuelle(page, text);
  const rahmen = page.locator('#vorschlaege');
  const liste = rahmen.locator('.rolle');
  const neu = rahmen.locator('.neu-fest [role="option"]');
  await expect(rahmen).toBeVisible();
  await expect(neu).toBeVisible();
  await kannScrollen(liste);
  return { rahmen, liste, neu };
}

test('the new row stays pinned on a long suggestion list', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'handy', 'phone width');
  test.setTimeout(90_000);
  const vorher = sichereBestand();
  let kern: unknown[] = [];
  try {
    setzeSchauspiel(bestand());
    const thema = await vorschlag(page, '#To');
    await expect(thema.neu).toContainText('New topic');
    await festUnten(thema.neu);
    await expect(nameZeile(thema.rahmen, 'Topic01')).toBeVisible();
    await page.screenshot({ path: `${BILDER}/handy-neu-thema-oben.png` });
    const abstand = await thema.neu.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const box = el.closest('.mit-neu')?.getBoundingClientRect();
      return box ? box.bottom - rect.bottom : -1;
    });
    await finger(page, thema.liste);
    await still(thema.liste);
    expect(await thema.liste.evaluate((el) => el.scrollTop)).toBeGreaterThan(20);
    await festUnten(thema.neu);
    const spaeter = await thema.neu.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const box = el.closest('.mit-neu')?.getBoundingClientRect();
      return box ? box.bottom - rect.bottom : -1;
    });
    expect(Math.abs(spaeter - abstand)).toBeLessThan(2);
    const letzteThema = nameZeile(thema.rahmen, LETZTES);
    await bisSichtbar(page, thema.liste, letzteThema);
    await still(thema.liste);
    await liegtFrei(letzteThema, thema.neu);
    await festUnten(thema.neu);
    await page.screenshot({ path: `${BILDER}/handy-neu-thema-unten.png` });
    await tippeMitte(page, letzteThema);
    await expect.poll(() => liesQuelle(page)).toBe(`#${LETZTES}`);

    const seite = await vorschlag(page, '#Topic01/A');
    await expect(seite.neu).toContainText('New page');
    await festUnten(seite.neu);
    await finger(page, seite.liste);
    await still(seite.liste);
    expect(await seite.liste.evaluate((el) => el.scrollTop)).toBeGreaterThan(20);
    await festUnten(seite.neu);
    const letzteSeite = nameZeile(seite.rahmen, LETZTE_SEITE);
    await bisSichtbar(page, seite.liste, letzteSeite);
    await still(seite.liste);
    await liegtFrei(letzteSeite, seite.neu);
    await page.screenshot({ path: `${BILDER}/handy-neu-seite-unten.png` });
    await tippeMitte(page, letzteSeite);
    await expect.poll(() => liesQuelle(page)).toBe(`#Topic01/${LETZTE_SEITE}`);

    const tastatur = await vorschlag(page, '#To');
    await setzeSicht(page, TASTATUR);
    await expect.poll(async () => {
      const menu = await tastatur.rahmen.boundingBox();
      const bar = await page.getByRole('toolbar', { name: 'Format' }).boundingBox();
      if (!menu || !bar) return false;
      return menu.y + menu.height <= bar.y + 2 && menu.height >= 48;
    }).toBe(true);
    await tastatur.liste.evaluate((el) => {
      el.scrollTop = 0;
    });
    await festUnten(tastatur.neu);
    await finger(page, tastatur.liste);
    await still(tastatur.liste);
    expect(await tastatur.liste.evaluate((el) => el.scrollTop)).toBeGreaterThan(20);
    await festUnten(tastatur.neu);
    await expect.poll(() => liesQuelle(page)).toBe('#To');
    await page.screenshot({ path: `${BILDER}/handy-neu-tastatur.png` });
  } catch (fehler) {
    kern.push(fehler);
  } finally {
    const folge: unknown[] = [];
    try {
      stelleBestand(vorher);
    } catch (fehler) {
      folge.push(fehler);
    }
    wirfGesammelt(kern, folge);
  }
});

test('the new topic row stays pinned in the topic picker', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'handy', 'phone width');
  test.setTimeout(90_000);
  const vorher = sichereBestand();
  try {
    setzeSchauspiel(bestand());
    const antwort = await page.request.get('/api/library/notes?topic=Topic01');
    expect(antwort.ok()).toBeTruthy();
    const daten = (await antwort.json()) as { notes: Array<{ id: number }> };
    const id = daten.notes[0]?.id ?? 0;
    expect(id).toBeGreaterThan(0);
    await page.goto(`/library/note?id=${id}`);
    await page.getByRole('button', { name: 'Note actions' }).click();
    await page.getByRole('menuitem', { name: 'Change', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Move note to' });
    await dialog.getByLabel('Search topics').fill('To');
    const rahmen = dialog.locator('#wechsel-liste');
    const liste = rahmen.locator('.rolle');
    const neu = rahmen.locator('.neu-fest [role="option"]');
    await expect(neu).toContainText('New topic');
    await kannScrollen(liste);
    await festUnten(neu);
    await page.screenshot({ path: `${BILDER}/handy-neu-wechsel-oben.png` });
    await finger(page, liste);
    await still(liste);
    expect(await liste.evaluate((el) => el.scrollTop)).toBeGreaterThan(20);
    await festUnten(neu);
    const letzte = nameZeile(rahmen, LETZTES);
    await bisSichtbar(page, liste, letzte);
    await still(liste);
    await liegtFrei(letzte, neu);
    await page.screenshot({ path: `${BILDER}/handy-neu-wechsel-unten.png` });
    await tippeMitte(page, letzte);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(LETZTES);
  } finally {
    stelleBestand(vorher);
  }
});

test('the new row stays pinned when the suggestion list is wheeled', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'wide screen');
  test.setTimeout(60_000);
  const vorher = sichereBestand();
  try {
    setzeSchauspiel(bestand());
    const thema = await vorschlag(page, '#To');
    await festUnten(thema.neu);
    const box = await thema.liste.boundingBox();
    if (!box) throw new Error('List is not visible.');
    const vorherScroll = await thema.liste.evaluate((el) => el.scrollTop);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => thema.liste.evaluate((el) => el.scrollTop)).toBeGreaterThan(vorherScroll + 20);
    await festUnten(thema.neu);
    const letzte = nameZeile(thema.rahmen, LETZTES);
    for (let versuch = 0; versuch < 24; versuch += 1) {
      const lage = await letzte.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const rahmen = el.closest('.rolle')?.getBoundingClientRect();
        if (!rahmen || rect.height <= 0) return 'runter';
        if (rect.top >= rahmen.top - 1 && rect.bottom <= rahmen.bottom + 1) return 'drin';
        return rect.top < rahmen.top ? 'hoch' : 'runter';
      });
      if (lage === 'drin') break;
      await page.mouse.wheel(0, lage === 'hoch' ? -500 : 500);
    }
    await liegtFrei(letzte, thema.neu);
    await page.screenshot({ path: `${BILDER}/desktop-neu-thema-rad.png` });
    await letzte.click();
    await expect.poll(() => liesQuelle(page)).toBe(`#${LETZTES}`);
  } finally {
    stelleBestand(vorher);
  }
});
