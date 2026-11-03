import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { letzteNotizZeile, tagesLabel } from '../shared/features/library/index.ts';
import { meldeAn } from './anmelden.ts';
import { leereLokal } from './lokal.ts';
import { loescheNotizen, setzeSchauspiel, setzeThema, sichereBestand, stelleBestand, type SaatNotiz } from './schau.ts';

const BILDER = 'tmp-test/screens';
const LISBON = 'Travel \u2013 Lisbon';

const MARA = 'Ask Mara for the Q4 numbers before Thursday\u2019s review.';
const FREITAG = 'Idea for the team: a short Friday summary \u2013 three bullet points, sent at 4 pm.';
const SERVER = 'Server move: disable the old backup task first, then switch the DNS.';
const JONAS = 'Lunch with Jonas went well. He\u2019s open to sharing their design system with us.';
const BUCH = 'Read chapter 4 of \u201cShape Up\u201d on betting tables before the planning meeting.';

function am(monat: number, tag: number, stunde: number, minute: number): string {
  const jahr = new Date().getFullYear();
  return new Date(jahr, monat - 1, tag, stunde, minute, 0, 0).toISOString();
}

function versatz(tage: number, stunde: number, minute: number): string {
  const jetzt = new Date();
  return new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + tage, stunde, minute, 0, 0).toISOString();
}

function stapel(name: string, anzahl: number, neueste: string): SaatNotiz[] {
  const notizen: SaatNotiz[] = [];
  for (let index = 0; index < anzahl - 1; index += 1) {
    const minute = index % 60;
    const stunde = 8 + Math.floor(index / 60);
    notizen.push({ text: `${name} ${index}`, created: new Date(2020, 0, 2, stunde, minute, 0, 0).toISOString() });
  }
  notizen.push({ text: `${name} latest`, created: neueste });
  return notizen;
}

async function oeffneLibrary(page: Page): Promise<void> {
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
}

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

test('a filed note can be read from its topic', async ({ page }, testInfo) => {
  const thema = `Regal${testInfo.project.name}`;
  const text = `Shelf note ${testInfo.project.name}`;
  const antwort = await page.request.post('/api/notes', { data: { text: `#${thema}\n${text}` } });
  expect(antwort.ok()).toBeTruthy();
  await page.goto('/library');
  await page.getByRole('link', { name: new RegExp(`^${thema}\\b`) }).click();
  await expect(page.getByRole('heading', { name: thema, level: 1 })).toBeVisible();
  await expect(page.getByText(text)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Topic actions' })).toBeVisible();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to Library' }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
});

test('library, topic, and empty states', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const bestand = sichereBestand();
  const jetzt = new Date();
  const gestern = versatz(-1, 18, 0);
  const heute = versatz(0, 11, 4);
  const ideen = am(10, 29, 12, 0);
  const lissabon = am(10, 24, 16, 0);
  const training = am(10, 30, 19, 0);
  const oktober = am(10, 28, 8, 20);
  try {
    setzeSchauspiel([
      {
        name: 'Inbox',
        notizen: [
          { text: 'Loose scrap', created: versatz(0, 8, 0) },
          ...stapel('Inbox', 2, versatz(0, 8, 1)),
        ],
      },
      { name: 'Books', notizen: stapel('Books', 9, gestern) },
      { name: 'Home', notizen: stapel('Home', 7, heute) },
      { name: 'Ideas', notizen: stapel('Ideas', 23, ideen) },
      { name: LISBON, notizen: stapel('Lisbon', 5, lissabon) },
      { name: 'Work', notizen: stapel('Work', 14, versatz(0, 14, 32)) },
      { name: 'Workout', notizen: stapel('Workout', 6, training) },
    ]);

    await oeffneLibrary(page);
    await expect(page.locator('.zeile .ti')).toHaveText(['Inbox', 'Books', 'Home', 'Ideas', LISBON, 'Work', 'Workout']);
    await expect(page.locator('.zeile .ne')).toHaveText([
      'Notes without a topic',
      letzteNotizZeile(gestern, jetzt),
      letzteNotizZeile(heute, jetzt),
      letzteNotizZeile(ideen, jetzt),
      letzteNotizZeile(lissabon, jetzt),
      'Last note today',
      letzteNotizZeile(training, jetzt),
    ]);
    await expect(page.locator('.zeile .wert')).toHaveText(['3', '9', '7', '23', '5', '14', '6']);
    await expect(page.getByRole('link', { name: 'Back to Capture' })).toBeVisible();
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-04-library.png` });

    await page.getByRole('link', { name: /^Inbox\b/ }).click();
    await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
    await expect(page.getByText('Loose scrap')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Topic actions' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Back to Library' }).click();

    const maraZeit = versatz(0, 14, 32);
    const freitagZeit = versatz(0, 9, 12);
    const serverZeit = versatz(-1, 17, 48);
    const jonasZeit = versatz(-1, 12, 55);
    setzeThema('Work', [
      { text: MARA, created: maraZeit },
      { text: FREITAG, created: freitagZeit },
      { text: SERVER, created: serverZeit },
      { text: JONAS, created: jonasZeit },
      { text: BUCH, created: oktober },
    ]);
    await page.goto(`/library/topic?name=${encodeURIComponent('Work')}`);
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Today', 'Yesterday', tagesLabel(oktober, jetzt)]);
    await expect(page.locator('.notiz .ti')).toHaveText([MARA, FREITAG, SERVER, JONAS, BUCH]);
    await expect(page.locator('.notiz .zeit')).toHaveText([
      tagesLabel(maraZeit, jetzt),
      tagesLabel(freitagZeit, jetzt),
      tagesLabel(serverZeit, jetzt),
      tagesLabel(jonasZeit, jetzt),
      tagesLabel(oktober, jetzt),
    ]);
    await expect(page.getByRole('button', { name: 'Note actions' })).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Topic actions' })).toBeVisible();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-05b-topic.png` });
    await page.getByRole('link', { name: 'Back to Library' }).click();
    await expect(page).toHaveURL(/\/library$/);

    loescheNotizen(true);
    await page.goto(`/library/topic?name=${encodeURIComponent('Inbox')}`);
    await expect(page.getByText('Inbox is empty.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Topic actions' })).toHaveCount(0);
    await expect(page.locator('.notiz')).toHaveCount(0);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-04c-inbox-empty.png` });

    loescheNotizen(false);
    await oeffneLibrary(page);
    await expect(page.getByText('No notes yet.')).toHaveCount(0);
    await expect(page.locator('.zeile .ti')).toHaveText(['Inbox', 'Books', 'Home', 'Ideas', LISBON, 'Work', 'Workout']);
    await expect(page.locator('.zeile .ne')).toHaveText([
      'Notes without a topic',
      '0 pages',
      '0 pages',
      '0 pages',
      '0 pages',
      '0 pages',
      '0 pages',
    ]);
    await expect(page.locator('.zeile .wert')).toHaveText(['0', '0', '0', '0', '0', '0', '0']);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-04b-library-empty.png` });
    await page.getByRole('link', { name: 'Back to Capture' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-back-capture.png` });
  } finally {
    stelleBestand(bestand);
  }
});
