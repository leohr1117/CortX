import fs from 'node:fs';
import { expect, festeZeit, test } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { leereLokal } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand } from './schau.ts';

const BILDER = 'tmp-test/screens';
const TEXT = 'Export title\n\nBody with **bold**.';

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

test('the banner menu exports the note as Markdown and then still opens Edit', async ({ page }, testInfo) => {
  const bestand = sichereBestand();
  try {
    setzeSchauspiel([{ name: 'Work', notizen: [{ text: TEXT, created: festeZeit(0, 9, 0) }] }]);
    await page.goto('/library/topic?name=Work');
    await expect(page.getByRole('heading', { name: 'Work', level: 1, exact: true })).toBeVisible();
    await page.locator('.notiz', { hasText: 'Export title' }).locator('a.tx').click();
    await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
    await page.getByRole('banner').getByRole('button', { name: 'Note actions' }).click();
    await expect(page.getByRole('menuitem')).toHaveText([/^Change$/, /^Export as Markdown$/, /^Delete$/]);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-note-banner-menu.png` });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'Export as Markdown', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('Export title.md');
    const ziel = `${BILDER}/${testInfo.project.name}-export-title.md`;
    await download.saveAs(ziel);
    expect(fs.readFileSync(ziel, 'utf8')).toBe(TEXT);

    await expect(page.getByRole('menuitem')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('.schreib .ProseMirror')).toBeVisible();
    await expect(page.locator('.schreib .ProseMirror')).toContainText('Export title');
  } finally {
    stelleBestand(bestand);
  }
});

test('the library row menu stays Change and Delete', async ({ page }) => {
  const bestand = sichereBestand();
  try {
    setzeSchauspiel([{ name: 'Work', notizen: [{ text: TEXT, created: festeZeit(0, 9, 0) }] }]);
    await page.goto('/library/topic?name=Work');
    await page.locator('.notiz', { hasText: 'Export title' }).getByRole('button', { name: 'Note actions' }).click();
    await expect(page.getByRole('menuitem')).toHaveText([/^Change$/, /^Delete$/]);
    await expect(page.getByRole('menuitem', { name: 'Export as Markdown', exact: true })).toHaveCount(0);
  } finally {
    stelleBestand(bestand);
  }
});
