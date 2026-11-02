import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeAuswahl, setzeQuelle } from './feld.ts';
import { leereLokal } from './lokal.ts';

const BILDER = 'tmp-test/screens';

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

async function tippe(page: Page, text: string): Promise<void> {
  await page.locator('.schreib .cm-content').pressSequentially(text, { delay: 20 });
}

async function leisteUeberFile(page: Page): Promise<boolean> {
  const leiste = page.getByRole('toolbar', { name: 'Format' });
  const knopf = page.getByRole('button', { name: 'File' });
  const bar = await leiste.boundingBox();
  const ziel = await knopf.boundingBox();
  if (!bar || !ziel) return false;
  return bar.y + bar.height <= ziel.y + 1;
}

test('the capture format bar follows the screen and stays off the File button', async ({ page }, testInfo) => {
  const handy = testInfo.project.name === 'handy';
  const leiste = page.getByRole('toolbar', { name: 'Format' });
  if (handy) {
    await expect(leiste).toBeVisible();
    await expect(leiste.getByRole('button', { name: 'Bold' })).toBeVisible();
    await expect(leiste.getByRole('button', { name: 'Important' })).toBeVisible();
    await expect(leiste.getByRole('button', { name: 'Checklist' })).toBeVisible();
    await expect(leiste.getByRole('button', { name: 'Bulleted list' })).toBeVisible();
    await expect.poll(() => leisteUeberFile(page)).toBe(true);
    await page.screenshot({ path: `${BILDER}/handy-capture-editor.png` });
    return;
  }
  await expect(leiste).toHaveCount(0);
  await setzeQuelle(page, 'Hello');
  await setzeAuswahl(page, 0, 5);
  await expect(leiste).toBeVisible();
  await page.getByRole('button', { name: 'Bold' }).click();
  await erwarteQuelle(page, '**Hello**');
});

test('capture shortcuts match the setting and leave a hash tag alone', async ({ page }) => {
  test.setTimeout(60_000);
  await setzeQuelle(page, '');
  await tippe(page, 'hello**');
  await erwarteQuelle(page, '**hello**');
  await page.keyboard.press('Control+z');
  await erwarteQuelle(page, 'hello**');

  await setzeQuelle(page, '');
  await tippe(page, '[ ]');
  await erwarteQuelle(page, '[] ');

  await setzeQuelle(page, '');
  await tippe(page, '#tag**');
  await erwarteQuelle(page, '#tag**');

  await page.goto('/library');
  await page.getByRole('button', { name: 'Library menu' }).click();
  const schalter = page.getByRole('switch', { name: /Convert shortcuts while typing/ });
  await schalter.click();
  await expect(schalter).toHaveAttribute('aria-checked', 'false');
  await page.goto('/');
  await setzeQuelle(page, '');
  await tippe(page, 'hello**');
  await erwarteQuelle(page, 'hello**');
  await setzeQuelle(page, 'Hello');
  await setzeAuswahl(page, 0, 5);
  await expect(page.getByRole('toolbar', { name: 'Format' })).toBeVisible();
  await page.getByRole('button', { name: 'Bold' }).click();
  await erwarteQuelle(page, '**Hello**');
});

test('the capture tag menu and filing follow the keyboard', async ({ page }, testInfo) => {
  const handy = testInfo.project.name === 'handy';
  const thema = handy ? 'Caphandy' : 'Capdesk';
  await setzeQuelle(page, 'Call #wo');
  const liste = page.getByRole('listbox');
  await expect(liste).toBeVisible();
  await expect(page.locator('.tag.hier')).toBeVisible();
  if (handy) {
    await page.keyboard.press('Enter');
    await erwarteQuelle(page, 'Call #wo\n');
    await expect(liste).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
  } else {
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await erwarteQuelle(page, 'Call #Workout');
    await expect(liste).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
  }
  await setzeQuelle(page, `Ping #${thema}`);
  await expect(liste).toBeVisible();
  await page.keyboard.press('Enter');
  if (handy) {
    await erwarteQuelle(page, `Ping #${thema}\n`);
    await expect(liste).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
    await page.getByRole('button', { name: 'File' }).click();
  } else {
    await erwarteQuelle(page, `Ping #${thema}`);
    await expect(liste).toHaveCount(0);
    await page.keyboard.press('Control+Enter');
  }
  await expect(page.getByRole('status')).toContainText('Added to');
  await expect(page.getByRole('status')).toContainText(thema);
  await erwarteQuelle(page, '');
  await expect(page.getByRole('button', { name: 'File' })).toBeDisabled();
});
