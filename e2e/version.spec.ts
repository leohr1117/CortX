import { expect, test, type Page } from '@playwright/test';
import { HINWEIS_TEXT } from '../shared/features/version/index.ts';
import { AKTUELLE_VERSION } from '../shared/versionen.ts';
import { KARTE_TEXT } from '../client/src/ui/kartenregister.ts';
import { meldeAn } from './anmelden.ts';
import { entferneVersionsstand } from './schau.ts';

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
    await expect(page.locator('[data-update-hinweis]')).toHaveCount(0);
    await expect(page.locator('[data-neu-punkt]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Library menu' }).click();
    await expect(page.locator('[data-version]')).toHaveText(`Version ${AKTUELLE_VERSION}`);
    await expect(page.getByRole('menuitem', { name: HINWEIS_TEXT.neuigkeiten })).toBeVisible();
    await ohneSeitlichenUeberlauf(page);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-version-menu.png` });

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
