import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle } from './feld.ts';
import { leereLokal, warteBereit } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand } from './schau.ts';

const BILDER = 'tmp-test/screens';

const FAELLE = [
  { name: 'zahl', text: '1. milk', danach: '1. milk\n2. ', klasse: '', marker: ['1.', '2.'] },
  { name: 'gross', text: 'A. milk', danach: 'A. milk\nB. ', klasse: 'gross', marker: ['A.', 'B.'] },
  { name: 'klein', text: 'a. milk', danach: 'a. milk\nb. ', klasse: 'klein', marker: ['a.', 'b.'] },
  { name: 'roemisch', text: 'I. milk', danach: 'I. milk\nII. ', klasse: 'roemisch', marker: ['I.', 'II.'] },
  { name: 'roemisch-klein', text: 'i. milk', danach: 'i. milk\nii. ', klasse: 'roemisch-klein', marker: ['i.', 'ii.'] },
] as const;

function versatz(): string {
  const jetzt = new Date();
  return new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), 9, 12, 0, 0).toISOString();
}

async function imEditor(page: Page, text: string): Promise<void> {
  setzeSchauspiel([{ name: 'Work', notizen: [{ text, created: versatz() }] }]);
  await page.goto('/library/topic?name=Work');
  await page.locator('.notiz').first().locator('a.tx').click();
  await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
  await page.getByRole('button', { name: 'Edit' }).click();
  await erwarteQuelle(page, text);
}

async function marker(page: Page): Promise<string[]> {
  return page.locator('.schreib .cm-marker').evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
}

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

test('enter counts a numbered list and reload keeps the kind', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const bestand = sichereBestand();
  const handy = testInfo.project.name === 'handy';
  try {
    for (const fall of FAELLE) {
      await imEditor(page, fall.text);
      await page.keyboard.press('Enter');
      await erwarteQuelle(page, fall.danach);
      if (fall.klasse === '') await expect(page.locator('.schreib .cm-marker.nummer')).toHaveCount(2);
      else await expect.poll(() => marker(page)).toEqual([...fall.marker]);
      await expect.poll(() => sichereBestand().notes.some((eintrag) => eintrag.text === fall.danach)).toBe(true);
      if (handy) await page.screenshot({ path: `${BILDER}/handy-nummer-${fall.name}.png`, fullPage: true });
      await page.reload();
      await warteBereit(page);
      const liste = page.locator(fall.klasse ? `.lesetext ol.${fall.klasse}` : '.lesetext ol');
      await expect(liste).toBeVisible();
      await expect(liste.locator('li')).toHaveCount(2);
      await expect(liste.locator('li').first()).toHaveText('milk');
      await page.getByRole('button', { name: 'Edit' }).click();
      await erwarteQuelle(page, fall.danach);
      if (fall.klasse === '') await expect(page.locator('.schreib .cm-marker.nummer')).toHaveCount(2);
      else await expect.poll(() => marker(page)).toEqual([...fall.marker]);
    }
  } finally {
    stelleBestand(bestand);
  }
});
