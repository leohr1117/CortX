import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { leereLokal } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand, type SaatNotiz } from './schau.ts';

const BILDER = 'tmp-test/screens';
const MARA = 'Ask Mara for the Q4 numbers before Thursday\u2019s review.';
const FREITAG = 'Idea for the team: a short Friday summary \u2013 three bullet points, sent at 4 pm.';
const SERVER = 'Server move: disable the old backup task first, then switch the DNS.';
const JONAS = 'Lunch with Jonas went well. He\u2019s open to sharing their design system with us.';
const BUCH = 'Read chapter 4 of \u201cShape Up\u201d on betting tables before the planning meeting.';
const ZWEITE = 'Start with the next sprint, ask Lena to try it first.';
const FREITAG_LANG = `${FREITAG}\n${ZWEITE}`;
const FREITAG_MEHR = `${FREITAG}\n${ZWEITE} Share the template on Monday.`;
const SCHROTT = 'Loose scrap about the hallway.';

function am(monat: number, tag: number, stunde: number, minute: number): string {
  const jahr = new Date().getFullYear();
  return new Date(jahr, monat - 1, tag, stunde, minute, 0, 0).toISOString();
}

function versatz(tage: number, stunde: number, minute: number): string {
  const jetzt = new Date();
  return new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + tage, stunde, minute, 0, 0).toISOString();
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

async function oeffneNotiz(page: Page, text: string): Promise<void> {
  const zeile = page.locator('.notiz', { hasText: text });
  await zeile.getByRole('button', { name: 'Note actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit note', level: 1 })).toBeVisible();
}

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
  await page.evaluate(() => sessionStorage.removeItem('cortex.note-undo'));
});

test('note menu edits, discards, and deletes with undo', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  try {
    setzeSchauspiel([
      { name: 'Inbox', notizen: [{ text: SCHROTT, created: versatz(0, 8, 0) }] },
      {
        name: 'Work',
        notizen: [{ text: FREITAG_LANG, created: versatz(0, 9, 12), source: 'tag' }],
      },
    ]);
    await page.goto('/library/topic?name=Work');
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Note actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Edit', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Delete', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);

    await oeffneNotiz(page, 'Friday summary');
    const feld = page.getByRole('textbox', { name: 'Note' });
    await expect(feld).toBeFocused();
    await expect(feld).toHaveValue(FREITAG_LANG);
    await expect(page.getByText('Work', { exact: true }).last()).toBeVisible();
    await expect(page.getByText(/^Filed today at 09:12 via #work$/)).toBeVisible();
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-07-edit.png` });
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();

    await oeffneNotiz(page, 'Friday summary');
    await feld.fill('');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await feld.fill('   ');
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await feld.fill(FREITAG_MEHR);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Discard changes?' })).toBeVisible();
    await expect(page.getByText('Your edits to this note will be lost.')).toBeVisible();
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-07b-discard.png` });
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(feld).toHaveValue(FREITAG_MEHR);
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    await expect(page.getByText(ZWEITE, { exact: false })).toBeVisible();
    await expect(page.getByText('Share the template on Monday.')).toHaveCount(0);

    await oeffneNotiz(page, 'Friday summary');
    await feld.fill('Friday summary, three bullets, sent at 4 pm.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    await expect(page.locator('.notiz p')).toHaveText('Friday summary, three bullets, sent at 4 pm.');
    const nachSpeichern = sichereBestand();
    const geaendert = nachSpeichern.notes.find((zeile) => zeile.text.startsWith('Friday summary'));
    expect(geaendert?.pinned).toBe(0);
    expect(geaendert?.created).toBe(versatz(0, 9, 12));

    setzeSchauspiel([
      { name: 'Inbox', notizen: [{ text: SCHROTT, created: versatz(0, 8, 0) }] },
      { name: 'Work', notizen: arbeitsNotizen() },
    ]);
    const erwartet = sichereBestand();
    await page.goto('/library/topic?name=Work');
    await expect(page.locator('.notiz p')).toHaveText([MARA, FREITAG, SERVER, JONAS, BUCH]);
    await page.getByRole('button', { name: 'Note actions' }).first().click();
    await expect(page.getByRole('menuitem')).toHaveText([/^Edit$/, /^Delete$/]);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-06-note-menu.png` });
    await page.keyboard.press('Escape');

    const jonas = page.locator('.notiz', { hasText: JONAS });
    await jonas.getByRole('button', { name: 'Note actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText(JONAS)).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText(/Note deleted/);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-06-deleted.png` });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    await expect(page.getByText(JONAS)).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText(/Note deleted/);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(JONAS)).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
    expect(sichereBestand().notes).toEqual(erwartet.notes);
    expect(sichereBestand().corrections).toEqual(erwartet.corrections);

    await page.goto('/library/topic?name=Inbox');
    await page.getByRole('button', { name: 'Note actions' }).click();
    await expect(page.getByRole('menuitem')).toHaveText([/^Edit$/, /^Delete$/]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Topic actions' })).toHaveCount(0);
  } finally {
    stelleBestand(bestand);
  }
});
