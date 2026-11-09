import fs from 'node:fs';
import { expect, festeZeit, test, type Locator, type Page } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { liesQuelle, richteSicht, setzeQuelle, setzeSicht, tippe, wische } from './feld.ts';
import { leereLokal } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand, type SaatNotiz, type SaatThema } from './schau.ts';

const BILDER = 'tmp-test/screens';
const SEITEN = 32;
const THEMEN = 32;
const TASTATUR = 420;
// Topic pages are newest first, so the earliest title is the last row.
const LETZTE_SEITE = 'Alpha01';
const LETZTES_THEMA = 'Topic32';
const LETZTER_VORSCHLAG = 'Alpha32';

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

function seiten(anzahl: number): SaatNotiz[] {
  const liste: SaatNotiz[] = [];
  for (let index = 1; index <= anzahl; index += 1) {
    const name = `Alpha${String(index).padStart(2, '0')}`;
    liste.push({ text: name, created: heute(index % 60) });
  }
  return liste;
}

function bestand(): SaatThema[] {
  const themen: SaatThema[] = [];
  for (let index = 1; index <= THEMEN; index += 1) {
    const name = `Topic${String(index).padStart(2, '0')}`;
    themen.push({ name, notizen: index === 1 ? seiten(SEITEN) : [] });
  }
  return themen;
}

async function kannScrollen(liste: Locator): Promise<void> {
  const masse = await liste.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight, top: el.scrollTop }));
  expect(masse.scroll).toBeGreaterThan(masse.client + 80);
  expect(masse.top).toBe(0);
}

type Lage = 'drin' | 'hoch' | 'runter';

async function lageVon(ziel: Locator): Promise<Lage> {
  return ziel.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const rahmen = el.closest('.rolle');
    if (!(rahmen instanceof HTMLElement) || rect.height <= 0) return 'runter';
    const kante = rahmen.getBoundingClientRect();
    if (rect.top >= kante.top - 1 && rect.bottom <= kante.bottom + 1) return 'drin';
    const mitte = (rect.top + rect.bottom) / 2;
    const rahmenMitte = (kante.top + kante.bottom) / 2;
    return mitte < rahmenMitte ? 'hoch' : 'runter';
  });
}

async function finger(page: Page, liste: Locator, richtung: 'hoch' | 'runter'): Promise<void> {
  const box = await liste.boundingBox();
  if (!box) throw new Error('List is not visible.');
  const x = box.x + Math.min(48, box.width / 2);
  const oben = box.y + box.height * 0.28;
  const unten = box.y + box.height * 0.82;
  if (richtung === 'runter') await wische(page, x, unten, oben);
  else await wische(page, x, oben, unten);
}

async function touchScroll(page: Page, liste: Locator): Promise<void> {
  const vorher = await liste.evaluate((el) => el.scrollTop);
  await finger(page, liste, 'runter');
  const nachher = await liste.evaluate((el) => el.scrollTop);
  expect(nachher).toBeGreaterThan(vorher + 20);
}

async function bisSichtbar(page: Page, liste: Locator, ziel: Locator): Promise<void> {
  for (let versuch = 0; versuch < 24; versuch += 1) {
    const lage = await lageVon(ziel);
    if (lage === 'drin') return;
    const stand = await liste.evaluate((el) => el.scrollTop);
    await finger(page, liste, lage);
    const neu = await liste.evaluate((el) => el.scrollTop);
    if (Math.abs(neu - stand) < 1) break;
  }
  expect(await lageVon(ziel), 'last row inside the list').toBe('drin');
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

async function sichtPunkt(ziel: Locator): Promise<{ x: number; y: number }> {
  const punkt = await ziel.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const rahmen = el.closest('.rolle')?.getBoundingClientRect();
    const sicht = window.visualViewport;
    const boden = (sicht?.offsetTop ?? 0) + (sicht?.height ?? window.innerHeight);
    if (!rahmen) return null;
    const top = Math.max(rect.top, rahmen.top);
    const bottom = Math.min(rect.bottom, rahmen.bottom, boden);
    const left = Math.max(rect.left, rahmen.left);
    const right = Math.min(rect.right, rahmen.right);
    if (bottom - top < 12 || right - left < 12) return null;
    return { x: left + Math.min(48, (right - left) / 2), y: top + (bottom - top) / 2 };
  });
  if (!punkt) throw new Error('Last row is not tappable.');
  return punkt;
}

async function tippeZeile(page: Page, liste: Locator, ziel: Locator): Promise<void> {
  await still(liste);
  const punkt = await sichtPunkt(ziel);
  await tippe(page, punkt.x, punkt.y);
}

async function seiteScrollt(page: Page): Promise<void> {
  await page.goto('/library/topic?name=Topic01');
  await expect(page.getByRole('heading', { name: 'Topic01', level: 1 })).toBeVisible();
  const liste = page.locator('main.rolle');
  await kannScrollen(liste);
  await touchScroll(page, liste);
  const letzte = page.getByRole('link', { name: LETZTE_SEITE, exact: false });
  await bisSichtbar(page, liste, letzte);
  await expect(letzte).toBeInViewport({ ratio: 0.8 });
  await page.screenshot({ path: `${BILDER}/handy-seiten-scroll.png` });
  await tippeZeile(page, liste, letzte);
  await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
  await expect(page.locator('.kopf').getByRole('heading', { level: 1, name: 'Topic01', exact: true })).toBeVisible();
  const blatt = await page.locator('main.notizblatt').innerText();
  expect(blatt.split(LETZTE_SEITE).length - 1).toBe(1);
}

test('a long page list scrolls by touch on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'handy', 'phone width');
  test.setTimeout(60_000);
  const vorher = sichereBestand();
  try {
    setzeSchauspiel(bestand());
    await seiteScrollt(page);
  } finally {
    stelleBestand(vorher);
  }
});

test('a long topic list scrolls by touch on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'handy', 'phone width');
  test.setTimeout(60_000);
  const vorher = sichereBestand();
  try {
    setzeSchauspiel(bestand());
    await page.goto('/library');
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    const liste = page.locator('main.rolle');
    await kannScrollen(liste);
    await touchScroll(page, liste);
    const letzte = page.getByRole('link', { name: LETZTES_THEMA, exact: false });
    await bisSichtbar(page, liste, letzte);
    await expect(letzte).toBeInViewport({ ratio: 0.8 });
    await page.screenshot({ path: `${BILDER}/handy-themen-scroll.png` });
    await tippeZeile(page, liste, letzte);
    await expect(page).toHaveURL(/\/library\/topic\?name=Topic32/);
  } finally {
    stelleBestand(vorher);
  }
});

test('suggestion lists scroll by touch, including while the keyboard is open', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'handy', 'phone width');
  test.setTimeout(60_000);
  const vorher = sichereBestand();
  try {
    setzeSchauspiel(bestand());
    await page.goto('/');
    await setzeQuelle(page, '#Topic01/');
    const menuBox = page.locator('#vorschlaege');
    const liste = menuBox.locator('.rolle');
    await expect(menuBox).toBeVisible();
    await kannScrollen(liste);
    await touchScroll(page, liste);
    await expect.poll(() => liesQuelle(page)).toBe('#Topic01/');
    const letzte = page.getByRole('option', { name: LETZTER_VORSCHLAG });
    await bisSichtbar(page, liste, letzte);
    await expect(letzte).toBeInViewport({ ratio: 0.8 });
    await page.screenshot({ path: `${BILDER}/handy-vorschlaege-scroll.png` });

    await setzeSicht(page, TASTATUR);
    await expect.poll(async () => {
      const menu = await menuBox.boundingBox();
      const bar = await page.getByRole('toolbar', { name: 'Format' }).boundingBox();
      if (!menu || !bar) return false;
      return menu.y + menu.height <= bar.y + 2 && menu.height >= 48;
    }).toBe(true);
    await liste.evaluate((el) => {
      el.scrollTop = 0;
    });
    await touchScroll(page, liste);
    await expect.poll(() => liesQuelle(page)).toBe('#Topic01/');
    await bisSichtbar(page, liste, letzte);
    await tippeZeile(page, liste, letzte);
    await expect.poll(() => liesQuelle(page)).toContain(LETZTER_VORSCHLAG);
    await page.screenshot({ path: `${BILDER}/handy-vorschlaege-tastatur.png` });
  } finally {
    stelleBestand(vorher);
  }
});

async function radScroll(page: Page, liste: Locator, ziel: Locator): Promise<void> {
  const box = await liste.boundingBox();
  if (!box) throw new Error('List is not visible.');
  const vorher = await liste.evaluate((el) => el.scrollTop);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => liste.evaluate((el) => el.scrollTop)).toBeGreaterThan(vorher + 20);
  for (let versuch = 0; versuch < 24; versuch += 1) {
    const lage = await lageVon(ziel);
    if (lage === 'drin') return;
    await page.mouse.wheel(0, lage === 'hoch' ? -500 : 500);
  }
  expect(await lageVon(ziel), 'last row inside the list').toBe('drin');
}

test('long lists scroll with the mouse wheel on a wide screen', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'wide screen');
  test.setTimeout(60_000);
  const vorher = sichereBestand();
  try {
    setzeSchauspiel(bestand());
    await page.goto('/library/topic?name=Topic01');
    const seitenListe = page.locator('main.rolle');
    await kannScrollen(seitenListe);
    const letzteSeite = page.getByRole('link', { name: LETZTE_SEITE, exact: false });
    await radScroll(page, seitenListe, letzteSeite);
    await expect(letzteSeite).toBeInViewport({ ratio: 0.8 });
    await page.screenshot({ path: `${BILDER}/desktop-seiten-rad.png` });
    await letzteSeite.click();
    await expect(page).toHaveURL(/\/library\/note\?id=\d+/);

    await page.goto('/library');
    const themenListe = page.locator('main.rolle');
    await kannScrollen(themenListe);
    const letztesThema = page.getByRole('link', { name: LETZTES_THEMA, exact: false });
    await radScroll(page, themenListe, letztesThema);
    await expect(letztesThema).toBeInViewport({ ratio: 0.8 });

    await page.goto('/');
    await setzeQuelle(page, '#Topic01/');
    const vorschlaege = page.locator('#vorschlaege .rolle');
    await expect(vorschlaege).toBeVisible();
    await kannScrollen(vorschlaege);
    const letzter = page.getByRole('option', { name: LETZTER_VORSCHLAG });
    await radScroll(page, vorschlaege, letzter);
    await expect(letzter).toBeInViewport({ ratio: 0.8 });
    await page.screenshot({ path: `${BILDER}/desktop-vorschlaege-rad.png` });
    await letzter.click();
    await expect.poll(() => liesQuelle(page)).toContain(LETZTER_VORSCHLAG);
  } finally {
    stelleBestand(vorher);
  }
});
