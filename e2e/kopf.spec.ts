import fs from 'node:fs';
import { AKTUELLE_VERSION } from '../shared/versionen.ts';
import { meldeAn } from './anmelden.ts';
import { leereLokal } from './lokal.ts';
import { expect, festeZeit, test, type Page, type TestInfo } from './ruhe.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand, type Bestand } from './schau.ts';

const BILDER = 'tmp-test/screens';
const THEMA = 'Quiet';
const TEXT = 'Quiet note';
const SCHMAL = 900;
const RAND_SCHMAL = 4;
const RAND_BREIT = 20;
const SPALTE_HALB = 360;
const SPALTE_VERS = 12;
const KOPF_SCHMAL = 56;
const KOPF_BREIT = 64;
const KONTUR = 4;
const RAND_LINIE = 1;
const NOTCH = 47;
const TOLERANZ = 0.51;

const AUFNAHME: Record<string, string> = {
  desktop: 'desktop-win-kopf.png',
  'desktop-mac-webkit': 'desktop-mac-kopf.png',
  'ipad-hoch': 'ipad-hoch-kopf.png',
  'ipad-quer': 'ipad-quer-kopf.png',
  'android-pixel': 'android-pixel-kopf.png',
};

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

let bestand: Bestand | null = null;
let themenVorher = '';

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
  bestand = sichereBestand();
  if (!themenVorher) themenVorher = bestand.topics.map((t) => t.name).sort().join(',');
});

test.afterEach(async ({ page }) => {
  await page.goto('about:blank').catch(() => undefined);
  if (bestand) stelleBestand(bestand);
  bestand = null;
});

function nah(ist: number, soll: number): void {
  expect(ist).toBeGreaterThanOrEqual(soll - TOLERANZ);
  expect(ist).toBeLessThanOrEqual(soll + TOLERANZ);
}

function normalRand(breite: number): number {
  return breite >= SCHMAL ? RAND_BREIT : RAND_SCHMAL;
}

function knopfX(breite: number, links: number, rechts: number): number {
  if (breite < SCHMAL) return links;
  return links + (breite - links - rechts) / 2 - SPALTE_HALB - SPALTE_VERS;
}

function istWebkit(testInfo: TestInfo): boolean {
  const use = testInfo.project.use as { browserName?: string; defaultBrowserType?: string };
  return use.browserName === 'webkit' || use.defaultBrowserType === 'webkit';
}

async function oeffneLesen(page: Page): Promise<void> {
  expect((await page.request.patch('/api/version', {
    data: { notified: AKTUELLE_VERSION, seen: AKTUELLE_VERSION },
  })).ok()).toBeTruthy();
  setzeSchauspiel([{ name: THEMA, notizen: [{ text: TEXT, created: festeZeit(0, 9, 0) }] }]);
  await page.goto(`/library/topic?name=${encodeURIComponent(THEMA)}`);
  await page.locator('.notiz', { hasText: TEXT }).locator('a.tx').click();
  await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
  await expect(page.locator('.lesetext')).toContainText(TEXT);
  await expect(page.locator('.kopf h1')).toHaveText(THEMA);
}

async function oeffneSchreiben(page: Page): Promise<void> {
  await oeffneLesen(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const feld = page.getByRole('textbox', { name: 'Note' });
  await expect(feld).toBeVisible();
  await expect(feld).toContainText(TEXT);
  await expect(page.locator('.lesetext')).toHaveCount(0);
}

async function erwarteFormelText(page: Page): Promise<void> {
  const text = await page.evaluate(() => {
    const teile: string[] = [];
    const lauf = (liste: CSSRuleList, tiefe: number) => {
      if (tiefe > 8) return;
      for (let i = 0; i < liste.length; i += 1) {
        const regel = liste[i];
        if (!regel) continue;
        const selektor = regel instanceof CSSStyleRule ? regel.selectorText : '';
        const kopf = selektor.split(',').some((teil) => teil.trim() === '.kopf' || teil.trim().includes('fenster-ipad'));
        if (kopf || regel.cssText.includes('fenster-ipad')) teile.push(regel.cssText);
        if (!('cssRules' in regel)) continue;
        try {
          const kinder = (regel as CSSGroupingRule).cssRules;
          if (kinder && kinder.length > 0) lauf(kinder, tiefe + 1);
        } catch {
          // This rule does not group other rules.
        }
      }
    };
    const blaetter = [...document.styleSheets, ...document.adoptedStyleSheets];
    for (const blatt of blaetter) {
      try {
        lauf(blatt.cssRules, 0);
      } catch {
        // A foreign sheet has no readable rules.
      }
    }
    return teile.join('\n');
  });
  expect(text).toContain('safe-area-inset-left');
  expect(text).toContain('safe-area-inset-right');
  expect(text).toContain('safe-area-inset-top');
  expect(text).toContain('max(');
  expect(text).not.toContain('fenster-ipad');
}

async function erwarteLage(page: Page): Promise<void> {
  const knopf = page.getByRole('button', { name: 'Back', exact: true });
  const titel = page.locator('.kopf h1');
  const menue = page.getByRole('button', { name: 'Note actions', exact: true });
  const knopfBox = await knopf.boundingBox();
  const titelBox = await titel.boundingBox();
  const menueBox = await menue.boundingBox();
  expect(knopfBox).not.toBeNull();
  expect(titelBox).not.toBeNull();
  expect(menueBox).not.toBeNull();
  const masse = await page.evaluate(() => {
    const kante = (groesse: string, achse: 'b' | 'h') => {
      const probe = document.createElement('div');
      probe.style.position = 'fixed';
      probe.style.left = '0';
      probe.style.top = '0';
      probe.style.visibility = 'hidden';
      probe.style.pointerEvents = 'none';
      probe.style.width = achse === 'b' ? groesse : '0';
      probe.style.height = achse === 'h' ? groesse : '0';
      document.documentElement.appendChild(probe);
      const box = probe.getBoundingClientRect();
      probe.remove();
      return achse === 'b' ? box.width : box.height;
    };
    const kopf = document.querySelector('header.kopf');
    if (!(kopf instanceof HTMLElement)) return null;
    const stil = getComputedStyle(kopf);
    return {
      klasse: kopf.className,
      links: parseFloat(stil.paddingLeft),
      rechts: parseFloat(stil.paddingRight),
      oben: parseFloat(stil.paddingTop),
      unten: parseFloat(stil.paddingBottom),
      hoehe: kopf.getBoundingClientRect().height,
      breite: window.innerWidth,
      insetLinks: kante('env(safe-area-inset-left, 0px)', 'b'),
      insetRechts: kante('env(safe-area-inset-right, 0px)', 'b'),
      insetOben: kante('env(safe-area-inset-top, 0px)', 'h'),
    };
  });
  expect(masse).not.toBeNull();
  const stand = masse!;
  const normal = normalRand(stand.breite);
  expect(stand.klasse).toBe('kopf');
  nah(stand.links, Math.max(normal, stand.insetLinks + KONTUR));
  nah(stand.rechts, Math.max(normal, stand.insetRechts + KONTUR));
  nah(stand.oben, stand.insetOben);
  const basis = stand.breite >= SCHMAL ? KOPF_BREIT : KOPF_SCHMAL;
  nah(stand.hoehe, basis + stand.insetOben);
  expect(knopfBox!.width).toBeGreaterThanOrEqual(44);
  expect(knopfBox!.height).toBeGreaterThanOrEqual(44);
  nah(knopfBox!.width, 48);
  nah(knopfBox!.height, 48);
  if (stand.breite < SCHMAL && stand.insetLinks === 0) expect(knopfBox!.x).toBeLessThanOrEqual(8);
  nah(knopfBox!.x, knopfX(stand.breite, stand.links, stand.rechts));
  const inhalt = stand.hoehe - stand.oben - stand.unten - RAND_LINIE;
  nah(knopfBox!.y, stand.oben + (inhalt - knopfBox!.height) / 2);
  const luecke = titelBox!.x - (knopfBox!.x + knopfBox!.width);
  expect(luecke).toBeLessThanOrEqual(8);
  expect(luecke).toBeGreaterThanOrEqual(-1);
  expect(knopfBox!.x - KONTUR).toBeGreaterThanOrEqual(stand.insetLinks - TOLERANZ);
  expect(menueBox!.x).toBeGreaterThan(titelBox!.x);
  expect(menueBox!.x + menueBox!.width + KONTUR).toBeLessThanOrEqual(stand.breite - stand.insetRechts + TOLERANZ);
}

async function fokusUndKontur(page: Page): Promise<void> {
  const knopf = page.getByRole('button', { name: 'Back', exact: true });
  await page.evaluate(() => {
    const aktiv = document.activeElement;
    if (aktiv instanceof HTMLElement) aktiv.blur();
    const kopf = document.querySelector('header.kopf');
    if (kopf instanceof HTMLElement) {
      kopf.setAttribute('tabindex', '-1');
      kopf.focus();
    }
  });
  await page.keyboard.press('Tab');
  await page.evaluate(() => document.querySelector('header.kopf')?.removeAttribute('tabindex'));
  await expect(knopf).toBeFocused();
  const rand = await knopf.evaluate((el) => {
    const stil = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const breite = parseFloat(stil.outlineWidth) || 0;
    const versatz = parseFloat(stil.outlineOffset) || 0;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:env(safe-area-inset-left, 0px);height:0;visibility:hidden;pointer-events:none';
    document.documentElement.appendChild(probe);
    const inset = probe.getBoundingClientRect().width;
    probe.remove();
    return {
      stil: stil.outlineStyle,
      breite,
      versatz,
      links: box.left - breite - versatz,
      rechts: box.right + breite + versatz,
      oben: box.top - breite - versatz,
      inset,
      sicht: window.innerWidth,
    };
  });
  expect(rand.stil).not.toBe('none');
  expect(rand.breite).toBeGreaterThanOrEqual(2);
  expect(rand.versatz).toBeGreaterThanOrEqual(2);
  expect(rand.links).toBeGreaterThanOrEqual(rand.inset - TOLERANZ);
  expect(rand.oben).toBeGreaterThanOrEqual(-1);
  expect(rand.rechts).toBeLessThanOrEqual(rand.sicht + TOLERANZ);
}

test('the back arrow sits at the start of the note header', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await oeffneLesen(page);
  await erwarteFormelText(page);
  await erwarteLage(page);
  const datei = AUFNAHME[testInfo.project.name];
  if (datei) await page.screenshot({ path: `${BILDER}/${datei}` });
  if (testInfo.project.name !== 'handy') return;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 760,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    await expect.poll(() => page.evaluate(() => window.innerHeight)).toBe(760);
    await expect(page.locator('.lesetext')).toContainText(TEXT);
    const fenster = await page.evaluate(() => ({
      w: window.innerWidth,
      h: window.innerHeight,
      sw: window.screen.width,
      sh: window.screen.height,
    }));
    expect(fenster).toEqual({ w: 390, h: 760, sw: 390, sh: 844 });
    await erwarteLage(page);
  } finally {
    await session.detach();
  }
});

test('the same header rule holds while the note is edited', async ({ page }) => {
  test.setTimeout(60_000);
  await oeffneSchreiben(page);
  await erwarteLage(page);
});

test('a click or tap on the back arrow leaves the note', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await oeffneLesen(page);
  const knopf = page.getByRole('button', { name: 'Back', exact: true });
  if (testInfo.project.use.hasTouch) await knopf.tap();
  else await knopf.click();
  await expect(page).toHaveURL(/\/library\/topic\?name=Quiet/);
  await expect(page.getByRole('heading', { level: 1, name: THEMA, exact: true })).toBeVisible();
});

test('the keyboard reaches the back arrow and activates it', async ({ page }) => {
  test.setTimeout(60_000);
  await oeffneLesen(page);
  await page.locator('.lesetext').click();
  await fokusUndKontur(page);
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/\/library\/topic\?name=Quiet/);
  await expect(page.getByRole('heading', { level: 1, name: THEMA, exact: true })).toBeVisible();

  await oeffneSchreiben(page);
  await fokusUndKontur(page);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/library\/topic\?name=Quiet/);
  await expect(page.getByRole('heading', { level: 1, name: THEMA, exact: true })).toBeVisible();
});

async function insetLinks(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:env(safe-area-inset-left, 0px);height:0;visibility:hidden;pointer-events:none';
    document.documentElement.appendChild(probe);
    const breite = probe.getBoundingClientRect().width;
    probe.remove();
    return breite;
  });
}

async function ohneGeraet(page: Page, testInfo: TestInfo): Promise<void> {
  expect(istWebkit(testInfo)).toBe(true);
  await erwarteFormelText(page);
  await erwarteLage(page);
}

test('a left safe-area inset uses the same header formula', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await oeffneLesen(page);
  const session = await page.context().newCDPSession(page).catch(() => null);
  if (!session) {
    await ohneGeraet(page, testInfo);
    return;
  }
  try {
    try {
      await session.send('Emulation.setSafeAreaInsetsOverride', {
        insets: { top: 0, left: NOTCH, right: 0, bottom: 0 },
      });
    } catch (fehler) {
      if (!istWebkit(testInfo)) throw fehler;
      await ohneGeraet(page, testInfo);
      return;
    }
    if (istWebkit(testInfo) && (await insetLinks(page)) !== NOTCH) {
      await ohneGeraet(page, testInfo);
      return;
    }
    await expect.poll(() => insetLinks(page)).toBe(NOTCH);
    await expect(page.locator('.lesetext')).toContainText(TEXT);
    await erwarteLage(page);
    if (testInfo.project.name === 'handy') {
      await page.screenshot({ path: `${BILDER}/handy-notch-kopf.png` });
    }
  } finally {
    await session.detach();
  }
});

test('the seeded topics are back after the header tests', async ({ page }) => {
  void page;
  const jetzt = sichereBestand().topics.map((t) => t.name).sort().join(',');
  expect(jetzt).toBe(themenVorher);
  expect(jetzt).toContain('Work');
  expect(jetzt).toContain('Workout');
});
