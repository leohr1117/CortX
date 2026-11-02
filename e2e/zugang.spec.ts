import { expect, test, type Page } from '@playwright/test';
import { ANMELDE_NAME, ANMELDE_PASSWORT } from './anmelden.ts';
import { liesEntwurf, warteBereit, warteschlangeLaenge } from './lokal.ts';

const PASSWORT_SEITE = 'https://stride.leohr.de/mehr/profil/passwort';

const BILDER = 'tmp-test/screens';

async function inboxEnthaelt(page: Page, text: string): Promise<boolean> {
  const antwort = await page.request.get('/api/library/notes?topic=Inbox');
  if (!antwort.ok()) return false;
  const daten = (await antwort.json()) as { notes: Array<{ text: string }> };
  return daten.notes.some((notiz) => notiz.text === text);
}

test('sign-in fields keep stable names for a password manager', async ({ page }, testInfo) => {
  await page.goto('/');
  const form = page.locator('form');
  await expect(form).toHaveAttribute('method', 'post');
  await expect(form.locator('button[type="submit"]')).toHaveText('Sign in');
  await expect(page.getByText('Username', { exact: true })).toBeVisible();
  await expect(page.getByText('Password', { exact: true })).toBeVisible();

  const name = page.getByLabel('Username');
  await expect(name).toHaveAttribute('id', 'username');
  await expect(name).toHaveAttribute('name', 'username');
  await expect(name).toHaveAttribute('autocomplete', 'username');
  await expect(name).toHaveAttribute('autocapitalize', 'none');
  await expect(name).toHaveAttribute('autocorrect', 'off');
  await expect(name).toHaveAttribute('spellcheck', 'false');
  expect(Number(await name.getAttribute('maxlength'))).toBeGreaterThanOrEqual(128);

  const passwort = page.getByRole('textbox', { name: 'Password', exact: true });
  await expect(passwort).toHaveAttribute('id', 'password');
  await expect(passwort).toHaveAttribute('name', 'password');
  await expect(passwort).toHaveAttribute('type', 'password');
  await expect(passwort).toHaveAttribute('autocomplete', 'current-password');
  const grenze = Number(await passwort.getAttribute('maxlength'));
  expect(grenze).toBeGreaterThanOrEqual(128);
  const lang = 'p'.repeat(grenze);
  await passwort.fill(lang);
  await expect(passwort).toHaveValue(lang);
  await passwort.fill(`${lang}x`);
  await expect(passwort).toHaveValue(lang);

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await passwort.fill('');
  await passwort.click();
  const eingefuegt = 'pasted-password';
  await page.evaluate(async (text) => {
    await navigator.clipboard.writeText(text);
  }, eingefuegt);
  await page.keyboard.press('Control+V');
  await expect(passwort).toHaveValue(eingefuegt);

  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(passwort).toHaveAttribute('type', 'text');
  await expect(passwort).toHaveValue(eingefuegt);
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-08-login-zeigen.png` });
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(passwort).toHaveAttribute('type', 'password');
});

test('sign-in rejects a bad password, opens the app, and signs out', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByLabel('Username')).toBeFocused();
  await expect(page.getByText('Change your password in Stride.')).toBeVisible();
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-08-login.png` });

  await page.getByLabel('Username').fill(ANMELDE_NAME);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('The username or password is wrong.');
  await expect(page.getByLabel('Username')).toHaveValue(ANMELDE_NAME);
  await expect(page.getByRole('textbox', { name: 'Password', exact: true })).toHaveValue('');
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-08-login-fehler.png` });

  const vorher = await page.evaluate(() => window.history.length);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(ANMELDE_PASSWORT);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
  expect(await page.evaluate(() => window.history.length)).toBeGreaterThan(vorher);
  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('change-password redirects without a session', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await page.route('https://stride.leohr.de/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Stride</title>' }),
  );
  const antwort = await page.goto('/.well-known/change-password');
  const herkunft = antwort?.request().redirectedFrom();
  expect(herkunft?.url()).toContain('/.well-known/change-password');
  expect((await herkunft?.response())?.status()).toBe(302);
  expect((await herkunft?.response())?.headers().location).toBe(PASSWORT_SEITE);
  await expect(page).toHaveURL(PASSWORT_SEITE);
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
  await page.getByLabel('Username').fill(ANMELDE_NAME);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(ANMELDE_PASSWORT);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeVisible();
  await expect.poll(() => warteschlangeLaenge(page)).toBe(0);
  await expect.poll(() => inboxEnthaelt(page, text)).toBe(true);
});
