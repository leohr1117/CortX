import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, richteSicht, setzeQuelle, setzeSicht } from './feld.ts';
import { leereLokal, liesEntwurf } from './lokal.ts';

test.beforeEach(async ({ page }) => {
  await richteSicht(page);
  await meldeAn(page);
  await leereLokal(page);
});

async function ablegen(page: Page, text: string): Promise<void> {
  await setzeQuelle(page, text);
  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('status')).toContainText('Added to');
  await expect(page.getByRole('status')).toContainText(text);
}

async function inboxTexte(page: Page): Promise<string[]> {
  const antwort = await page.request.get('/api/library/notes?topic=Inbox');
  expect(antwort.ok()).toBeTruthy();
  return ((await antwort.json()) as { notes: Array<{ text: string }> }).notes.map((notiz) => notiz.text);
}

test('a new card replaces the old one and undo leaves no second message', async ({ page }) => {
  await ablegen(page, 'First marker');
  await ablegen(page, 'Second marker');
  await expect(page.getByRole('status')).toHaveCount(1);
  await expect(page.getByRole('status')).not.toContainText('First marker');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
  await erwarteQuelle(page, 'Second marker');
  expect(await inboxTexte(page)).not.toContain('Second marker');
  expect(await inboxTexte(page)).toContain('First marker');
});

test('dismiss, escape, and a swipe each remove the card without undoing', async ({ page }) => {
  await ablegen(page, 'Stay filed');
  const kreuz = page.getByRole('button', { name: 'Dismiss' });
  const flaeche = await kreuz.boundingBox();
  expect(flaeche?.width ?? 0).toBeGreaterThanOrEqual(48);
  expect(flaeche?.height ?? 0).toBeGreaterThanOrEqual(48);
  await kreuz.click();
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(await inboxTexte(page)).toContain('Stay filed');

  await ablegen(page, 'Escape me');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(await inboxTexte(page)).toContain('Escape me');

  await ablegen(page, 'Swipe me');
  const karte = page.getByRole('status');
  const box = await karte.boundingBox();
  if (!box) throw new Error('Card has no box.');
  await page.mouse.move(box.x + 24, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(karte).toHaveCount(0);
  expect(await inboxTexte(page)).toContain('Swipe me');
});

test('focus holds the card and typing does not dismiss it', async ({ page }) => {
  test.setTimeout(60_000);
  await ablegen(page, 'Hold please');
  await page.getByRole('button', { name: 'Undo' }).focus();
  await page.waitForTimeout(9_000);
  await expect(page.getByRole('status')).toContainText('Hold please');
  const feld = page.getByRole('textbox', { name: 'Note' });
  await feld.focus();
  await page.keyboard.type('Still here');
  await expect(feld).toBeFocused();
  await expect(page.getByRole('status')).toContainText('Hold please');
  await page.waitForTimeout(5_000);
  await expect(page.getByRole('status')).toBeVisible();
  await page.waitForTimeout(4_000);
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('a card without an action fades after five seconds', async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.install({ time: Date.now() });
  await setzeQuelle(page, 'Queued offline');
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('status')).toHaveText('Filed offline · syncs later');
  await page.clock.fastForward(4_900);
  await expect(page.getByRole('status')).toBeVisible();
  await page.clock.fastForward(300);
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('the card stays on the next page and undo restores the text', async ({ page }) => {
  await ablegen(page, 'Travel text');
  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Travel text');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect.poll(() => liesEntwurf(page)).toBe('Travel text');
  await page.goto('/');
  await erwarteQuelle(page, 'Travel text');
});

test('the card sits above the keyboard and the File button', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'handy', 'phone width');
  await setzeQuelle(page, 'Above keys');
  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('status')).toContainText('Above keys');
  await setzeSicht(page, 520);
  const karte = page.getByRole('status');
  await expect.poll(async () => {
    const meldung = await karte.boundingBox();
    const bar = await page.getByRole('toolbar', { name: 'Format' }).boundingBox();
    const knopf = await page.getByRole('button', { name: 'File' }).boundingBox();
    if (!meldung || !bar || !knopf) return false;
    const ueberLeiste = meldung.y + meldung.height <= bar.y + 2;
    const ueberKnopf = meldung.y + meldung.height <= knopf.y + 1;
    const nah = knopf.y - (meldung.y + meldung.height) <= 24;
    return ueberLeiste && ueberKnopf && nah;
  }).toBe(true);
});
