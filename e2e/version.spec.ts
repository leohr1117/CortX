import { expect, FESTE_UHR, test, type Page } from './ruhe.ts';
import { letzteNotizZeile } from '../shared/features/library/ansicht.ts';
import { HINWEIS_TEXT } from '../shared/features/version/index.ts';
import { TEXTE } from '../shared/kern/texte.ts';
import { AKTUELLE_VERSION } from '../shared/versionen.ts';
import { KARTE_TEXT } from '../client/src/ui/kartenregister.ts';
import { meldeAn } from './anmelden.ts';
import {
  entferneFremdeNotiz,
  entferneVersionsstand,
  erstellteFremdeNotiz,
  legeFremdeNotiz,
  merkeNotizZeiten,
  setzeNotizZeiten,
  sichereBestand,
  versionsNotizZeit,
  type FremdBesitz,
  type NotizZeit,
} from './schau.ts';

const BILDER = 'tmp-test/screens';

async function stand(page: Page): Promise<{ notified: string | null; seen: string | null; fresh: boolean }> {
  const antwort = await page.request.get('/api/version');
  expect(antwort.ok()).toBeTruthy();
  return (await antwort.json()) as { notified: string | null; seen: string | null; fresh: boolean };
}

async function ohneSeitlichenUeberlauf(page: Page): Promise<void> {
  const passt = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(passt).toBe(true);
}

function allesAuf(zeiten: readonly NotizZeit[], created: string): boolean {
  return zeiten.length > 0 && zeiten.every((zeile) => zeile.created === created);
}

function erwarteteAufnahme(zeiten: readonly NotizZeit[]): NotizZeit[] {
  const created = versionsNotizZeit();
  return zeiten.map((zeile) => ({ id: zeile.id, created }));
}

function versucheSchritt(folge: unknown[], schritt: () => void): void {
  try {
    schritt();
  } catch (fehler) {
    folge.push(fehler);
  }
}

function wirfGesammelt(ursachen: readonly unknown[], folge: readonly unknown[]): void {
  const alle = [...ursachen, ...folge];
  if (alle.length === 0) return;
  if (alle.length === 1) throw alle[0];
  throw new AggregateError(alle, 'Several errors');
}

test('a fresh account gets no update snackbar', async ({ page }) => {
  await meldeAn(page);
  entferneVersionsstand();
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  await expect(page.locator('[data-update-hinweis]')).toHaveCount(0);
  await expect
    .poll(async () => stand(page))
    .toEqual({ notified: AKTUELLE_VERSION, seen: AKTUELLE_VERSION, fresh: false });
  await expect(page.locator('[data-update-hinweis]')).toHaveCount(0);
  await expect(page.locator('[data-neu-punkt]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  await expect(page.locator('[data-update-hinweis]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});

test('an update shows one snackbar, and the dot stays until What\'s new was seen', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await meldeAn(page);
  const vorHinweis = merkeNotizZeiten();
  expect(vorHinweis.length).toBeGreaterThan(0);
  expect(allesAuf(vorHinweis, versionsNotizZeit())).toBe(false);
  expect(allesAuf(vorHinweis, FESTE_UHR.toISOString())).toBe(false);
  const gesetzt = await page.request.patch('/api/version', {
    data: { notified: '1.0.0', seen: '1.0.0' },
  });
  expect(gesetzt.ok()).toBeTruthy();
  try {
    await page.goto('/library');
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    const hinweis = page.locator('[data-update-hinweis]');
    await expect(hinweis).toHaveCount(1);
    await expect(hinweis.locator('.t')).toHaveText(HINWEIS_TEXT.aktualisiert);
    await expect(hinweis).not.toContainText(/\d+\.\d+\.\d+/);
    await expect(hinweis).toHaveAttribute('data-dauer', '10000');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.locator('[data-neu-punkt]')).toBeVisible();
    await ohneSeitlichenUeberlauf(page);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-update-snackbar.png` });

    await hinweis.hover();
    await page.waitForTimeout(11_000);
    await expect(hinweis).toBeVisible();
    await page.mouse.move(2, 2);
    await hinweis.getByRole('button', { name: HINWEIS_TEXT.neuigkeiten }).focus();
    await page.waitForTimeout(11_000);
    await expect(hinweis).toBeVisible();

    await hinweis.getByRole('button', { name: HINWEIS_TEXT.neuigkeiten }).click();
    await expect(page).toHaveURL(/\/library\/whats-new$/);
    await expect(page.getByRole('heading', { name: HINWEIS_TEXT.neuigkeiten, level: 1 })).toBeVisible();
    await expect(page.locator('[data-update-hinweis]')).toHaveCount(0);
    const text = await page.locator('[data-versionen]').innerText();
    expect(text.indexOf(AKTUELLE_VERSION)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(AKTUELLE_VERSION)).toBeLessThan(text.indexOf('1.5.2'));
    expect(text.indexOf('1.5.2')).toBeLessThan(text.indexOf('0.1.0'));
    expect(text.indexOf('November 2, 2026')).toBeLessThan(text.indexOf('November 1, 2026'));
    await expect(page.getByRole('region', { name: `Version ${AKTUELLE_VERSION}` })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Version 0.1.0' })).toHaveCount(1);
    await expect.poll(async () => (await stand(page)).seen).toBe(AKTUELLE_VERSION);
    await ohneSeitlichenUeberlauf(page);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-whats-new.png` });

    await page.getByRole('link', { name: 'Back to Library' }).click();
    await expect(page).toHaveURL(/\/library$/);
    const vorher = merkeNotizZeiten();
    const ziel = letzteNotizZeile(versionsNotizZeit(), FESTE_UHR);
    try {
      setzeNotizZeiten(erwarteteAufnahme(vorher));
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
      await expect(page.locator('[data-update-hinweis]')).toHaveCount(0);
      await expect(page.locator('[data-neu-punkt]')).toHaveCount(0);
      await page.getByRole('button', { name: 'Library menu' }).click();
      await expect(page.locator('[data-version]')).toHaveText(`Version ${AKTUELLE_VERSION}`);
      await expect(page.getByRole('menuitem', { name: HINWEIS_TEXT.neuigkeiten })).toBeVisible();
      await ohneSeitlichenUeberlauf(page);
      const unterzeilen = await page.locator('.zeile .ne').allInnerTexts();
      const daten = unterzeilen.filter((text) => text.startsWith(TEXTE.letzteNotiz));
      expect(daten.length).toBeGreaterThan(0);
      expect(daten.every((text) => text === ziel)).toBe(true);
      await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-version-menu.png` });
    } finally {
      setzeNotizZeiten(vorher);
    }
    expect(merkeNotizZeiten()).toEqual(vorher);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await expect(page.locator('[data-update-hinweis]')).toHaveCount(0);
    await expect(page.locator('[data-neu-punkt]')).toHaveCount(0);
  } finally {
    await page.request.patch('/api/version', {
      data: { notified: AKTUELLE_VERSION, seen: AKTUELLE_VERSION },
    });
  }
});

test('closing the update banner keeps it hidden after reload', async ({ page }) => {
  await meldeAn(page);
  const gesetzt = await page.request.patch('/api/version', {
    data: { notified: '1.0.0', seen: '1.0.0' },
  });
  expect(gesetzt.ok()).toBeTruthy();
  try {
    await page.goto('/library');
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    const hinweis = page.locator('[data-update-hinweis]');
    await expect(hinweis).toHaveCount(1);
    const kreuz = hinweis.getByRole('button', { name: KARTE_TEXT.schliessen });
    const flaeche = await kreuz.boundingBox();
    expect(flaeche?.width ?? 0).toBeGreaterThanOrEqual(48);
    expect(flaeche?.height ?? 0).toBeGreaterThanOrEqual(48);
    await ohneSeitlichenUeberlauf(page);
    await kreuz.click();
    await expect(hinweis).toHaveCount(0);
    await expect.poll(async () => stand(page)).toMatchObject({ notified: AKTUELLE_VERSION, seen: '1.0.0' });
    await expect(page.locator('[data-neu-punkt]')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await expect(page.locator('[data-update-hinweis]')).toHaveCount(0);
    await expect(page.locator('[data-neu-punkt]')).toBeVisible();
  } finally {
    await page.request.patch('/api/version', {
      data: { notified: AKTUELLE_VERSION, seen: AKTUELLE_VERSION },
    });
  }
});

test('a failed version shot restores note times', async ({ page }) => {
  await meldeAn(page);
  const vorher = merkeNotizZeiten();
  expect(vorher.length).toBeGreaterThan(0);
  const probe = 'foreign clock probe';
  const bestandVorher = sichereBestand();
  let alt: FremdBesitz | undefined;
  let beleg: FremdBesitz | undefined;
  let art = '';
  let ursache: unknown[] = [];
  try {
    alt = legeFremdeNotiz(probe);
    let innen: unknown[] = [];
    try {
      beleg = legeFremdeNotiz(probe);
      const fremdVorher = erstellteFremdeNotiz(probe);
      expect(fremdVorher).toBeTruthy();
      setzeNotizZeiten(erwarteteAufnahme(vorher));
      expect(merkeNotizZeiten()).toEqual(erwarteteAufnahme(vorher));
      expect(erstellteFremdeNotiz(probe)).toBe(fremdVorher);
      await expect(page.getByText('version-shot-break')).toHaveCount(1, { timeout: 1_000 });
    } catch (fehler) {
      const meldung = fehler instanceof Error ? fehler.message : String(fehler);
      if (meldung.includes('version-shot-break')) art = 'shot';
      else innen.push(fehler);
    } finally {
      const folge: unknown[] = [];
      if (beleg) {
        const entfernbarerBeleg = beleg;
        versucheSchritt(folge, () => entferneFremdeNotiz(entfernbarerBeleg));
      }
      versucheSchritt(folge, () => setzeNotizZeiten(vorher));
      wirfGesammelt(innen, folge);
    }
    expect(art).toBe('shot');
    expect(beleg).toBeTruthy();
    expect(alt).toBeTruthy();
    const eigene = beleg as FremdBesitz;
    const vorbestand = alt as FremdBesitz;
    expect(eigene.konto).toBe(vorbestand.konto);
    expect(eigene.themaId).toBe(vorbestand.themaId);
    expect(eigene.themaAngelegt).toBe(false);
    expect(eigene.notizId).not.toBe(vorbestand.notizId);
    expect(merkeNotizZeiten()).toEqual(vorher);
    const zwischen = sichereBestand();
    expect(zwischen.notes.some((zeile) => zeile.id === eigene.notizId)).toBe(false);
    expect(
      zwischen.notes.some(
        (zeile) => zeile.id === vorbestand.notizId && zeile.text === probe && zeile.account_id === vorbestand.konto,
      ),
    ).toBe(true);
    expect(zwischen.topics.some((zeile) => zeile.id === vorbestand.themaId && zeile.account_id === vorbestand.konto)).toBe(
      true,
    );
    for (const zeile of bestandVorher.topics) expect(zwischen.topics).toContainEqual(zeile);
    for (const zeile of bestandVorher.notes) expect(zwischen.notes).toContainEqual(zeile);
    for (const zeile of bestandVorher.corrections) expect(zwischen.corrections).toContainEqual(zeile);
  } catch (fehler) {
    ursache.push(fehler);
  } finally {
    const folge: unknown[] = [];
    if (alt) {
      const entfernbarerAltbestand = alt;
      versucheSchritt(folge, () => entferneFremdeNotiz(entfernbarerAltbestand));
    }
    wirfGesammelt(ursache, folge);
  }
  expect(art).toBe('shot');
  expect(merkeNotizZeiten()).toEqual(vorher);
  const nachher = sichereBestand();
  expect(nachher.topics).toEqual(bestandVorher.topics);
  expect(nachher.notes).toEqual(bestandVorher.notes);
  expect(nachher.corrections).toEqual(bestandVorher.corrections);
  const gleicherAlttext = bestandVorher.notes.filter((zeile) => zeile.text === probe);
  if (gleicherAlttext.length === 0) expect(erstellteFremdeNotiz(probe)).toBeNull();
  else for (const zeile of gleicherAlttext) expect(nachher.notes).toContainEqual(zeile);
});
