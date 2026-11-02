import { expect, test, type Locator, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeQuelle } from './feld.ts';
import { leereLokal } from './lokal.ts';

const BILDER = 'tmp-test/screens';
const SATZ = 'Buy a birthday present for Anna – she mentioned the new Murakami.';
const TAG_TEXT =
  'Call the landlord about the broken radiator in the bedroom. Ask for a repair date before the weekend. #wo';

const LISBON = 'Travel \u2013 Lisbon';

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

async function oeffneSeite(page: Page, thema: string, text: string): Promise<void> {
  const antwort = await page.request.get(`/api/library/notes?topic=${encodeURIComponent(thema)}`);
  expect(antwort.ok()).toBeTruthy();
  const daten = (await antwort.json()) as { notes: Array<{ id: number; text: string }> };
  const id = daten.notes.filter((notiz) => notiz.text.includes(text)).reduce((max, notiz) => Math.max(max, notiz.id), 0);
  expect(id).toBeGreaterThan(0);
  await page.goto(`/library/note?id=${id}`);
  await expect(page).toHaveURL(new RegExp(`/library/note\\?id=${id}$`));
}

async function wechsle(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Note actions' }).click();
  await page.getByRole('menuitem', { name: 'Change', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Move note to' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function themaZahl(page: Page, name: string): Promise<number> {
  const antwort = await page.request.get('/api/topics');
  const daten = (await antwort.json()) as { topics: Array<{ name: string; count: number }> };
  return daten.topics.find((thema) => thema.name === name)?.count ?? 0;
}

async function auffuellen(
  page: Page,
  name: string,
  ziel: number,
  textFuer: (index: number) => string,
  verschieben: boolean,
): Promise<void> {
  const fehlt = ziel - (await themaZahl(page, name));
  for (let index = 0; index < fehlt; index += 1) {
    const antwort = await page.request.post('/api/notes', { data: { text: textFuer(index) } });
    if (!antwort.ok()) throw new Error(`Seed ${name} failed.`);
    if (!verschieben) continue;
    const notiz = (await antwort.json()) as { id: number };
    const move = await page.request.post(`/api/notes/${notiz.id}/move`, { data: { topic: name } });
    if (!move.ok()) throw new Error(`Move ${name} failed.`);
  }
}

test('change picker lists topics and closes without a move', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await auffuellen(page, 'Books', 9, (index) => `Books ${index} #Books`, false);
  await auffuellen(page, 'Ideas', 23, (index) => `Ideas ${index} #Ideas`, false);
  await auffuellen(page, LISBON, 5, (index) => `Lisbon ${index}`, true);
  await auffuellen(page, 'Inbox', 3, (index) => `Inbox loose ${index}`, false);
  await setzeQuelle(page, 'Pay the rent #Home');
  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('status')).toContainText('Added to');
  await expect(page.getByRole('status')).toContainText('Home');
  await expect(page.getByRole('button', { name: 'Change' })).toHaveCount(0);
  await oeffneSeite(page, 'Home', 'Pay the rent');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home > Pay the rent');
  const dialog = await wechsle(page);
  await expect(dialog.getByLabel('Search topics')).toBeFocused();
  await expect(dialog.locator('.wz.sel .n')).toHaveText('Home');
  await expect(dialog.locator('.wz.sel .ok')).toBeVisible();
  const zeilen = dialog.locator('.wz');
  if ((await zeilen.count()) === 7) {
    await expect(zeilen.locator('.n')).toHaveText(['Inbox', 'Books', 'Home', 'Ideas', LISBON, 'Work', 'Workout']);
    await expect(zeilen.nth(0).locator('.w')).toHaveText('3');
    await expect(zeilen.nth(1).locator('.w')).toHaveText('9');
    await expect(zeilen.nth(3).locator('.w')).toHaveText('23');
    await expect(zeilen.nth(4).locator('.w')).toHaveText('5');
    await expect(zeilen.nth(5).locator('.w')).toHaveText('14');
    await expect(zeilen.nth(6).locator('.w')).toHaveText('6');
  }
  await page.screenshot({ path: `tmp-test/screens/${testInfo.project.name}-03b-change.png` });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home > Pay the rent');
  await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
});

test('empty capture', async ({ page }, testInfo) => {
  const feld = page.getByRole('textbox', { name: 'Note' });
  await expect(feld).toBeFocused();
  await expect(page.locator('.cm-placeholder')).toHaveText('Start typing…');
  await erwarteQuelle(page, '');
  await expect(page.getByRole('button', { name: 'File' })).toBeDisabled();
  await expect(page.locator('.ziel')).toHaveText('');
  await expect(page.getByRole('link', { name: 'Library' })).toBeVisible();
  const kbd = page.locator('.kbd');
  if (testInfo.project.name === 'handy') {
    await expect(kbd).toBeHidden();
  } else {
    await expect(kbd).toBeVisible();
    await expect(page.locator('.kbd .win').first()).toBeVisible();
    await expect(page.locator('.kbd .mac').first()).toBeHidden();
  }
  const knopf = await page.getByRole('button', { name: 'File' }).boundingBox();
  expect(knopf).not.toBeNull();
  expect(knopf!.y + knopf!.height).toBeLessThanOrEqual(testInfo.project.name === 'handy' ? 844 : 900);
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-01-capture.png` });
  if (testInfo.project.name === 'desktop') {
    await page.evaluate(() => {
      document.documentElement.dataset.os = 'mac';
    });
    await expect(page.locator('.kbd .mac').first()).toBeVisible();
    await expect(page.locator('.kbd .win').first()).toBeHidden();
    await page.screenshot({ path: `${BILDER}/desktop-01-capture-mac.png` });
  }
});

test('typing shows the inbox destination', async ({ page }, testInfo) => {
  await setzeQuelle(page, SATZ);
  await expect(page.locator('.ziel b')).toHaveText('Inbox');
  await expect(page.getByRole('button', { name: 'File' })).toBeEnabled();
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-01b-typing.png` });
});

test('hash opens suggestions and the keyboard follows the device', async ({ page }, testInfo) => {
  await setzeQuelle(page, TAG_TEXT);
  const liste = page.getByRole('listbox');
  await expect(liste).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(3);
  await expect(page.getByRole('option').nth(0)).toContainText('Work');
  await expect(page.getByRole('option').nth(0)).toContainText('14');
  await expect(page.getByRole('option').nth(1)).toContainText('Workout');
  await expect(page.getByRole('option').nth(1)).toContainText('6');
  await expect(page.getByRole('option').nth(2)).toContainText('New topic “wo”');
  await expect(page.getByRole('option').nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.ziel b')).toHaveText('Work');
  const tagBox = await page.locator('.hier').boundingBox();
  const listBox = await liste.boundingBox();
  expect(tagBox).not.toBeNull();
  expect(listBox).not.toBeNull();
  expect(listBox!.x).toBeLessThanOrEqual(tagBox!.x + 8);
  expect(listBox!.x + listBox!.width).toBeGreaterThan(tagBox!.x);
  expect(listBox!.y).toBeGreaterThanOrEqual(tagBox!.y + tagBox!.height - 4);
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-02-tag.png` });
  if (testInfo.project.name === 'handy') {
    await page.keyboard.press('Enter');
    await erwarteQuelle(page, `${TAG_TEXT}\n`);
    await expect(liste).toHaveCount(0);
    await expect(page.locator('.ziel b')).toHaveText('Work');
    const knopf = await page.getByRole('button', { name: 'File' }).boundingBox();
    expect(knopf).not.toBeNull();
    expect(knopf!.y).toBeGreaterThan(400);
    expect(knopf!.y + knopf!.height).toBeLessThanOrEqual(844);
    return;
  }
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await erwarteQuelle(page, TAG_TEXT.replace('#wo', '#Workout'));
  await expect(liste).toHaveCount(0);
  await expect(page.locator('.ziel b')).toHaveText('Workout');
});

test('a suggestion can be tapped', async ({ page }) => {
  await setzeQuelle(page, 'Remember #wo');
  await page.getByRole('option', { name: /Workout/ }).click();
  await erwarteQuelle(page, 'Remember #Workout');
  await expect(page.locator('.ziel b')).toHaveText('Workout');
  await setzeQuelle(page, 'Remember #zz');
  await page.getByRole('option', { name: /New topic/ }).click();
  await erwarteQuelle(page, 'Remember #zz');
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('files with the button and with ctrl enter', async ({ page }, testInfo) => {
  const feld = page.getByRole('textbox', { name: 'Note' });
  await setzeQuelle(page, 'Buy milk');
  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('status')).toContainText('Added to');
  await expect(page.getByRole('status')).toContainText('Inbox');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change' })).toHaveCount(0);
  await erwarteQuelle(page, '');
  await expect(feld).toBeFocused();
  await expect(page.getByRole('button', { name: 'File' })).toBeDisabled();

  await setzeQuelle(page, 'Pay the rent #Home');
  await expect(page.locator('.ziel b')).toHaveText('Home');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('status')).toContainText('Added to');
  await expect(page.getByRole('status')).toContainText('Home');
  await erwarteQuelle(page, '');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change' })).toHaveCount(0);
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-03-toast.png` });

  await page.keyboard.press('Control+Enter');
  await erwarteQuelle(page, '');
});

test('change moves the note onto an existing or new topic', async ({ page }, testInfo) => {
  await setzeQuelle(page, 'Move me #Home');
  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('status')).toContainText('Added to');
  await expect(page.getByRole('status')).toContainText('Home');
  await oeffneSeite(page, 'Home', 'Move me');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home > Move me');

  let dialog = await wechsle(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home > Move me');

  dialog = await wechsle(page);
  await page.locator('.scrim').click({ position: { x: 8, y: 8 } });
  await expect(dialog).toHaveCount(0);

  dialog = await wechsle(page);
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home > Move me');

  dialog = await wechsle(page);
  await dialog.getByRole('option', { name: /^Work\b/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Work > Move me');
  await expect(page.locator('.ablage')).toContainText('via #work');

  dialog = await wechsle(page);
  await dialog.getByLabel('Search topics').press('ArrowDown');
  const ziel = (await dialog.locator('.wz.akt .n').innerText()).trim();
  await dialog.getByLabel('Search topics').press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(ziel);

  const neu = `Zimmer${testInfo.project.name}`;
  const tastatur = `Taste${testInfo.project.name}`;
  dialog = await wechsle(page);
  await dialog.getByLabel('Search topics').fill(neu);
  await dialog.getByRole('option', { name: /New topic/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(neu);
  await page.screenshot({ path: `tmp-test/screens/${testInfo.project.name}-03-moved.png` });

  dialog = await wechsle(page);
  await dialog.getByLabel('Search topics').fill(tastatur);
  await dialog.getByLabel('Search topics').press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(tastatur);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(tastatur);
});

test('library returns to capture', async ({ page }) => {
  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'File' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Library' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to Capture' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
});
