import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeQuelle } from './feld.ts';
import { leereLokal, liesEntwurf, warteBereit, warteschlangeLaenge } from './lokal.ts';

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

async function themaZahl(page: Page, name: string): Promise<number> {
  const antwort = await page.request.get('/api/topics');
  const daten = (await antwort.json()) as { topics: Array<{ name: string; count: number }> };
  return daten.topics.find((thema) => thema.name === name)?.count ?? 0;
}

test('draft survives reload and is cleared after filing', async ({ page }) => {
  const feld = page.getByRole('textbox', { name: 'Note' });
  await feld.pressSequentially('Unsent thought', { delay: 10 });
  await expect.poll(() => liesEntwurf(page)).toBe('Unsent thought');
  await page.reload();
  await warteBereit(page);
  await erwarteQuelle(page, 'Unsent thought');
  await expect(feld).toBeFocused();
  await page.getByRole('button', { name: 'File' }).click();
  await erwarteQuelle(page, '');
  await expect.poll(() => liesEntwurf(page)).toBe('');
  await page.reload();
  await warteBereit(page);
  await erwarteQuelle(page, '');
});

test('files offline and syncs the note once', async ({ page }, testInfo) => {
  const thema = `Zed${testInfo.project.name}`;
  const vorher = await themaZahl(page, thema);

  await setzeQuelle(page, `#${thema}\nOffline marker ${testInfo.project.name}`);
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'File' }).click();
  await erwarteQuelle(page, '');
  await expect(page.getByRole('button', { name: 'File' })).toBeDisabled();
  await expect(page.getByRole('status')).toHaveText('Filed offline · syncs later');
  await expect(page.getByRole('button', { name: 'Change' })).toHaveCount(0);
  expect(await themaZahl(page, thema)).toBe(vorher);
  await expect.poll(() => warteschlangeLaenge(page)).toBe(1);
  await page.screenshot({ path: `tmp-test/screens/${testInfo.project.name}-03c-offline.png` });

  await page.route('**/api/notes', (route) => {
    if (route.request().method() === 'POST' && /\/api\/notes$/.test(route.request().url())) {
      return route.abort();
    }
    return route.continue();
  });
  await page.context().setOffline(false);
  await page.reload();
  await warteBereit(page);
  await erwarteQuelle(page, '');
  await expect.poll(() => warteschlangeLaenge(page)).toBe(1);
  expect(await themaZahl(page, thema)).toBe(vorher);

  await page.unroute('**/api/notes');
  await page.reload();
  await warteBereit(page);
  await expect.poll(() => themaZahl(page, thema)).toBe(vorher + 1);
  await page.reload();
  await warteBereit(page);
  await expect.poll(() => themaZahl(page, thema)).toBe(vorher + 1);
  await expect.poll(() => warteschlangeLaenge(page)).toBe(0);

  await setzeQuelle(page, `#${thema}\nSecond ${testInfo.project.name}`);
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('status')).toHaveText('Filed offline · syncs later');
  await expect.poll(() => warteschlangeLaenge(page)).toBe(1);
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => themaZahl(page, thema)).toBe(vorher + 2);
  await expect.poll(() => warteschlangeLaenge(page)).toBe(0);
  await page.reload();
  await warteBereit(page);
  await expect.poll(() => themaZahl(page, thema)).toBe(vorher + 2);
});
