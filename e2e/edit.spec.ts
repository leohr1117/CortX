import fs from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { cursorKopf, erwarteQuelle, setzeQuelle } from './feld.ts';
import { leereLokal, liesEntwurf, liesNotizEntwurf, warteBereit, warteschlangeLaenge } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand, type SaatNotiz } from './schau.ts';

const BILDER = 'tmp-test/screens';
const VORSCHAU = ['= Sprint summary', '- three **bullets**', '[] share the template', 'Start with the next round.'].join('\n');
const EINGANG = ['Bring the spare key.', 'It hangs by the door.'].join('\n');
const KLAR = 'Friday summary, three bullets, sent at 4 pm.';
const AUTOMATISCH = 'Autosave marker for the sprint note.';
const ZURUECK = 'Back marker for the sprint note.';
const ENTWURF = 'Draft marker that stays on the device.';
const LISTE = 'Move from the list.';
const SEITE = 'Move from the page.';
const SEITE_WEG = 'Delete from the page.';
const LISTE_WEG = 'Delete from the list.';
const SCHROTT = 'Loose scrap about the hallway.';
const DAHEIM = 'Already at home.';

function versatz(tage: number, stunde: number, minute: number): string {
  const jetzt = new Date();
  return new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + tage, stunde, minute, 0, 0).toISOString();
}

async function vollstaendig(ziel: Locator): Promise<void> {
  const masse = await ziel.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
  expect(masse.scroll).toBeLessThanOrEqual(masse.client + 1);
}

async function oeffne(page: Page, text: string): Promise<void> {
  await page.locator('.notiz', { hasText: text }).locator('a.tx').click();
  await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
}

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
  await page.evaluate(() => sessionStorage.removeItem('cortex.note-undo'));
});

test('a note opens for reading and continues as a writing surface', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const bestand = sichereBestand();
  const erstellt = versatz(0, 9, 12);
  try {
    setzeSchauspiel([
      { name: 'Inbox', notizen: [{ text: EINGANG, created: versatz(0, 8, 0) }] },
      { name: 'Work', notizen: [{ text: VORSCHAU, created: erstellt, source: 'tag' }] },
    ]);

    await page.goto('/library/topic?name=Work');
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    const zeile = page.locator('.notiz', { hasText: 'Sprint summary' });
    await expect(zeile.getByRole('heading', { level: 3 })).toHaveText('Sprint summary');
    await expect(zeile.locator('li')).toHaveText('three bullets');
    await expect(zeile.locator('strong')).toHaveText('bullets');
    await expect(zeile.locator('.hakenlabel')).toHaveText('share the template');
    await expect(zeile).toContainText('Start with the next round.');
    await expect(zeile).not.toContainText('= Sprint');
    await vollstaendig(zeile.locator('.lesetext'));
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-note-list.png` });

    await page.goto('/library/topic?name=Inbox');
    const eingang = page.locator('.notiz', { hasText: 'spare key' });
    await expect(eingang).toContainText('Bring the spare key.');
    await expect(eingang).toContainText('It hangs by the door.');
    await vollstaendig(eingang.locator('.lesetext'));

    await page.goto('/library');
    await page.getByRole('textbox', { name: 'Search notes' }).fill('template');
    const treffer = page.locator('.zeile', { hasText: 'Sprint summary' });
    await expect(treffer.getByRole('heading', { level: 3 })).toHaveText('Sprint summary');
    await expect(treffer.locator('li')).toHaveText('three bullets');
    await expect(treffer.locator('strong')).toHaveText('bullets');
    await expect(treffer.locator('.hakenlabel')).toHaveText('share the template');
    await expect(treffer).toContainText('Start with the next round.');
    await expect(treffer.locator('.ne')).toHaveText('Work');
    await vollstaendig(treffer.locator('.lesetext'));
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-note-search.png` });
    await treffer.click();
    await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
    await expect(page.getByRole('heading', { level: 3, name: 'Sprint summary' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();

    await oeffne(page, 'Sprint summary');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    await expect(page.locator('label')).toHaveCount(0);
    await expect(page.getByText('Topic', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Heading' })).toHaveCount(0);
    await expect(page.locator('.ablage')).toHaveText(/^Filed today at 09:12 via #work$/);
    await expect(page.locator('.ablage')).toHaveCSS('font-size', '13px');
    await expect(page.locator('.lesetext h3')).toHaveText('Sprint summary');
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-note-read.png` });

    await page.getByRole('button', { name: 'Edit' }).click();
    const feld = page.getByRole('textbox', { name: 'Note' });
    await expect(feld).toBeFocused();
    await erwarteQuelle(page, VORSCHAU);
    await expect.poll(() => cursorKopf(page)).toBe(VORSCHAU.length);
    await expect(feld).toHaveCSS('border-top-width', '0px');
    await expect(feld).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(feld).toHaveCSS('color', 'rgb(242, 242, 242)');
    await expect(page.locator('.lesetext')).toHaveCount(0);
    if (testInfo.project.name === 'handy') {
      await expect(page.getByRole('button', { name: 'Heading' })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Heading' })).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    await expect(page.locator('label')).toHaveCount(0);
    await expect(page.locator('.ablage')).toHaveText(/^Filed today at 09:12 via #work$/);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-note-edit.png` });

    await setzeQuelle(page, KLAR);
    await page.getByRole('button', { name: 'Read' }).click();
    await expect(page.locator('.lesetext')).toHaveText(KLAR);
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(feld).toHaveCount(0);
    const klar = sichereBestand().notes.find((eintrag) => eintrag.text === KLAR);
    expect(klar?.pinned).toBe(0);
    expect(klar?.created).toBe(erstellt);
    expect(sichereBestand().corrections).toHaveLength(0);

    await page.getByRole('button', { name: 'Edit' }).click();
    await setzeQuelle(page, '   ');
    await page.getByRole('button', { name: 'Read' }).click();
    await expect(page.getByRole('alert')).toHaveText('Write something to save.');
    await expect(feld).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
    await expect(page.getByRole('alert')).toHaveText('Write something to save.');

    await setzeQuelle(page, AUTOMATISCH);
    await expect.poll(() => sichereBestand().notes.some((eintrag) => eintrag.text === AUTOMATISCH)).toBe(true);
    await expect(feld).toBeVisible();
    const automatisch = sichereBestand().notes.find((eintrag) => eintrag.text === AUTOMATISCH);
    expect(automatisch?.pinned).toBe(0);
    expect(automatisch?.created).toBe(erstellt);

    await setzeQuelle(page, ZURUECK);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    await expect(page.getByText(ZURUECK)).toBeVisible();

    await oeffne(page, ZURUECK);
    const id = Number(new URL(page.url()).searchParams.get('id'));
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.route('**/api/notes/**', (route) => {
      const url = route.request().url();
      if (route.request().method() === 'POST' && /\/api\/notes\/\d+$/.test(url)) return route.abort();
      return route.continue();
    });
    await page.context().setOffline(true);
    await setzeQuelle(page, ENTWURF);
    await expect.poll(() => liesNotizEntwurf(page, id)).toBe(ENTWURF);
    expect(await liesEntwurf(page)).toBe('');
    expect(await warteschlangeLaenge(page)).toBe(0);
    await page.context().setOffline(false);
    await page.reload();
    await warteBereit(page);
    await expect(page.locator('.lesetext')).toContainText(ENTWURF);
    await expect(page.getByRole('textbox', { name: 'Note' })).toHaveCount(0);
    await page.unroute('**/api/notes/**');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => sichereBestand().notes.some((eintrag) => eintrag.text === ENTWURF)).toBe(true);
    const entwurf = sichereBestand().notes.find((eintrag) => eintrag.text === ENTWURF);
    expect(entwurf?.pinned).toBe(0);
    expect(entwurf?.created).toBe(erstellt);
    expect(sichereBestand().corrections).toHaveLength(0);
  } finally {
    stelleBestand(bestand);
  }
});

test('change and delete stay on the note menu and on the note page', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const bestand = sichereBestand();
  const arbeit: SaatNotiz[] = [
    { text: LISTE, created: versatz(0, 11, 0), source: 'tag' },
    { text: SEITE, created: versatz(0, 10, 0), source: 'tag' },
    { text: SEITE_WEG, created: versatz(0, 9, 0) },
    { text: LISTE_WEG, created: versatz(0, 8, 30) },
  ];
  try {
    setzeSchauspiel([
      { name: 'Inbox', notizen: [{ text: SCHROTT, created: versatz(0, 8, 0) }] },
      { name: 'Work', notizen: arbeit },
      { name: 'Home', notizen: [{ text: DAHEIM, created: versatz(0, 7, 0) }] },
    ]);

    await page.goto('/library/topic?name=Work');
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    const liste = page.locator('.notiz', { hasText: LISTE });
    await liste.getByRole('button', { name: 'Note actions' }).click();
    await expect(page.getByRole('menuitem')).toHaveText([/^Change$/, /^Delete$/]);
    await expect(page.getByRole('menuitem', { name: 'Edit', exact: true })).toHaveCount(0);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-note-menu.png` });
    await page.getByRole('menuitem', { name: 'Change', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Move note to' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('option', { name: /^Inbox\b/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(LISTE)).toHaveCount(0);
    const nachListe = sichereBestand();
    expect(nachListe.notes.find((eintrag) => eintrag.text === LISTE)?.pinned).toBe(1);
    expect(nachListe.corrections).toHaveLength(1);

    await page.goto('/library/topic?name=Inbox');
    await expect(page.getByText(LISTE)).toBeVisible();
    await page.goto('/library/topic?name=Work');
    await oeffne(page, SEITE);
    await page.getByRole('button', { name: 'Note actions' }).click();
    await expect(page.getByRole('menuitem')).toHaveText([/^Change$/, /^Delete$/]);
    await page.getByRole('menuitem', { name: 'Change', exact: true }).click();
    await dialog.getByRole('option', { name: /^Home\b/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
    await expect(page.locator('.ablage')).toContainText('via #home');
    const nachSeite = sichereBestand();
    expect(nachSeite.notes.find((eintrag) => eintrag.text === SEITE)?.pinned).toBe(1);
    expect(nachSeite.corrections).toHaveLength(2);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
    await expect(page.getByText(SEITE)).toBeVisible();

    await page.goto('/library/topic?name=Work');
    await oeffne(page, SEITE_WEG);
    await page.getByRole('button', { name: 'Note actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    await expect(page.getByText(SEITE_WEG)).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText(/Note deleted/);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(SEITE_WEG)).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);

    const weg = page.locator('.notiz', { hasText: LISTE_WEG });
    await weg.getByRole('button', { name: 'Note actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(page.getByText(LISTE_WEG)).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText(/Note deleted/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    await expect(page.getByText(LISTE_WEG)).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(LISTE_WEG)).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);

    await page.goto('/library/topic?name=Inbox');
    await page.getByRole('button', { name: 'Note actions' }).first().click();
    await expect(page.getByRole('menuitem')).toHaveText([/^Change$/, /^Delete$/]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Topic actions' })).toHaveCount(0);
  } finally {
    stelleBestand(bestand);
  }
});
