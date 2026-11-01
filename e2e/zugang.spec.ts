import { expect, test, type Page } from '@playwright/test';
import { ANMELDE_NAME, ANMELDE_PASSWORT } from './anmelden.ts';
import { liesEntwurf, warteBereit, warteschlangeLaenge } from './lokal.ts';

const BILDER = 'tmp-test/screens';

async function inboxEnthaelt(page: Page, text: string): Promise<boolean> {
  const antwort = await page.request.get('/api/library/notes?topic=Inbox');
  if (!antwort.ok()) return false;
  const daten = (await antwort.json()) as { notes: Array<{ text: string }> };
  return daten.notes.some((notiz) => notiz.text === text);
}

test('sign-in rejects a bad password, opens the app, and signs out', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeFocused();
  await expect(page.getByText('Change your password in Stride.')).toBeVisible();
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-08-login.png` });

  await page.getByLabel('Email').fill(ANMELDE_NAME);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('The email or password is wrong.');
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-08-login-fehler.png` });

  await page.getByLabel('Password').fill(ANMELDE_PASSWORT);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeVisible();
  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('an offline draft can be filed without an account and syncs after sign-in', async ({ page }, testInfo) => {
  const text = `Door note ${testInfo.project.name}`;
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await warteBereit(page);
  const feld = page.getByRole('textbox', { name: 'Note' });
  await expect(feld).toBeVisible();
  await feld.pressSequentially(text, { delay: 10 });
  await expect.poll(() => liesEntwurf(page)).toBe(text);
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-08-offline-entwurf.png` });
  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('status')).toHaveText('Filed offline · syncs later');
  await expect.poll(() => warteschlangeLaenge(page)).toBe(1);

  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect.poll(() => warteschlangeLaenge(page)).toBe(1);
  await page.getByLabel('Email').fill(ANMELDE_NAME);
  await page.getByLabel('Password').fill(ANMELDE_PASSWORT);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeVisible();
  await expect.poll(() => warteschlangeLaenge(page)).toBe(0);
  await expect.poll(() => inboxEnthaelt(page, text)).toBe(true);
});
