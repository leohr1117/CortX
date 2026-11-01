import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { tagesLabel } from '../shared/features/library/index.ts';
import { leereLokal } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand, type SaatNotiz } from './schau.ts';

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

function bibliothek(work: SaatNotiz[]): void {
  const gestern = versatz(-1, 18, 0);
  const heute = versatz(0, 11, 4);
  setzeSchauspiel([
    {
      name: 'Inbox',
      notizen: [{ text: 'Loose scrap', created: versatz(0, 8, 0) }, ...stapel('Inbox', 2, versatz(0, 8, 1))],
    },
    { name: 'Books', notizen: stapel('Books', 9, gestern) },
    { name: 'Home', notizen: stapel('Home', 7, heute) },
    { name: 'Ideas', notizen: stapel('Ideas', 23, am(10, 29, 12, 0)) },
    { name: LISBON, notizen: stapel('Lisbon', 5, am(10, 24, 16, 0)) },
    { name: 'Work', notizen: work },
    { name: 'Workout', notizen: stapel('Workout', 6, am(10, 30, 19, 0)) },
  ]);
}

function arbeitsNotizen(): SaatNotiz[] {
  return [
    { text: MARA, created: versatz(0, 14, 32) },
    { text: FREITAG, created: versatz(0, 9, 12) },
    { text: SERVER, created: versatz(-1, 17, 48) },
    { text: JONAS, created: versatz(-1, 12, 55) },
    { text: BUCH, created: am(10, 28, 8, 20) },
  ];
}

async function oeffneWork(page: Page): Promise<void> {
  await page.goto('/library/topic?name=Work');
  await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
}

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await leereLokal(page);
});

test('topic menu renames with validation and lists merge targets', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  const oktober = am(10, 28, 8, 20);
  try {
    bibliothek(arbeitsNotizen());
    await oeffneWork(page);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Today', 'Yesterday', tagesLabel(oktober, new Date())]);
    await expect(page.locator('.notiz p')).toHaveText([MARA, FREITAG, SERVER, JONAS, BUCH]);
    await page.getByRole('button', { name: 'Note actions' }).first().click();
    await expect(page.getByRole('menu')).toHaveCount(0);

    await page.getByRole('button', { name: 'Topic actions' }).click();
    await expect(page.getByRole('menuitem')).toHaveText([/Rename/, /Merge into\u2026/, /Delete topic/]);
    await expect(page.getByText('Its notes move to Inbox')).toBeVisible();
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-05-topic-menu.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);

    await page.getByRole('button', { name: 'Topic actions' }).click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    const feld = page.getByRole('textbox', { name: 'Name' });
    await expect(feld).toBeFocused();
    await expect(feld).toHaveValue('Work');
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-05c-rename.png` });
    await feld.fill('Studio');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Topic actions' }).click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await feld.fill('');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a name.');
    await feld.fill('books');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toHaveText('A topic with this name already exists.');
    await feld.fill('Inbox');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toHaveText('That name is reserved.');
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    expect((await page.request.get('/api/library/notes?topic=Work')).ok()).toBeTruthy();

    await page.getByRole('button', { name: 'Topic actions' }).click();
    await page.getByRole('menuitem', { name: 'Merge into\u2026' }).click();
    await expect(page.getByRole('heading', { name: 'Merge \u201CWork\u201D into' })).toBeVisible();
    await expect(page.getByText('All 5 notes move there and \u201CWork\u201D is removed.')).toBeVisible();
    await expect(page.getByRole('option').locator('.n')).toHaveText(['Books', 'Home', 'Ideas', LISBON, 'Workout']);
    await expect(page.getByRole('option').locator('.w')).toHaveText(['9', '7', '23', '5', '6']);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-05d-merge.png` });
    await page.getByRole('textbox', { name: 'Search topics' }).fill('lis');
    await expect(page.getByRole('option').locator('.n')).toHaveText([LISBON]);
    await page.locator('.scrim').click({ position: { x: 8, y: 8 } });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Topic actions' }).click();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await feld.fill('Studio');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Studio', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/name=Studio/);
    await expect(page.getByText(MARA)).toBeVisible();
    await page.getByRole('link', { name: 'Back to Library' }).click();
    await expect(page.locator('.zeile .ti')).toHaveText(['Inbox', 'Books', 'Home', 'Ideas', 'Studio', LISBON, 'Workout']);
  } finally {
    stelleBestand(bestand);
  }
});

test('merging a topic moves its notes and undo puts them back', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const bestand = sichereBestand();
  try {
    bibliothek(stapel('Work', 14, versatz(0, 14, 32)));
    const vorher = await (await page.request.get('/api/library/notes?topic=Work')).json();
    await oeffneWork(page);
    await page.getByRole('button', { name: 'Topic actions' }).click();
    await page.getByRole('menuitem', { name: 'Merge into\u2026' }).click();
    await page.getByRole('option', { name: /Ideas/ }).click();
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('\u201CWork\u201D merged into Ideas');
    await expect(page.locator('.zeile .wert')).toHaveText(['3', '9', '7', '37', '5', '6']);
    await expect(page.locator('.zeile .ti')).toHaveText(['Inbox', 'Books', 'Home', 'Ideas', LISBON, 'Workout']);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-05f-merged.png` });
    expect((await page.request.get('/api/library/notes?topic=Work')).status()).toBe(404);
    const ideen = (await (await page.request.get('/api/library/notes?topic=Ideas')).json()) as {
      notes: Array<{ id: number }>;
    };
    for (const notiz of (vorher as { notes: Array<{ id: number }> }).notes) {
      expect(ideen.notes.some((eintrag) => eintrag.id === notiz.id)).toBe(true);
    }

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.locator('.zeile .wert')).toHaveText(['3', '9', '7', '23', '5', '14', '6']);
    expect(await (await page.request.get('/api/library/notes?topic=Work')).json()).toEqual(vorher);
    await page.getByRole('link', { name: /^Work\b/ }).click();
    await expect(page.getByText('Work latest')).toBeVisible();
  } finally {
    stelleBestand(bestand);
  }
});

test('deleting a topic moves its notes to Inbox and undo puts them back', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const bestand = sichereBestand();
  try {
    bibliothek(stapel('Work', 14, versatz(0, 14, 32)));
    const vorher = await (await page.request.get('/api/library/notes?topic=Work')).json();
    await oeffneWork(page);
    await page.getByRole('button', { name: 'Topic actions' }).click();
    await page.getByRole('menuitem', { name: /Delete topic/ }).click();
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('\u201CWork\u201D deleted');
    await expect(page.locator('.zeile .wert')).toHaveText(['17', '9', '7', '23', '5', '6']);
    await expect(page.locator('.zeile .ti')).toHaveText(['Inbox', 'Books', 'Home', 'Ideas', LISBON, 'Workout']);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-05e-deleted.png` });
    await page.getByRole('link', { name: /^Inbox\b/ }).click();
    await expect(page.getByText('Work latest')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Topic actions' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Back to Library' }).click();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.locator('.zeile .wert')).toHaveText(['3', '9', '7', '23', '5', '14', '6']);
    expect(await (await page.request.get('/api/library/notes?topic=Work')).json()).toEqual(vorher);
    await page.getByRole('link', { name: /^Inbox\b/ }).click();
    await expect(page.getByText('Work latest')).toHaveCount(0);
  } finally {
    stelleBestand(bestand);
  }
});
