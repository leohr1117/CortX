import { expect, test } from '@playwright/test';

const BILDER = 'tmp-bau/screens-U01';
const SATZ = 'Buy a birthday present for Anna – she mentioned the new Murakami.';
const TAG_TEXT =
  'Call the landlord about the broken radiator in the bedroom. Ask for a repair date before the weekend. #wo';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('empty capture', async ({ page }, testInfo) => {
  const feld = page.getByRole('textbox', { name: 'Note' });
  await expect(feld).toBeFocused();
  await expect(feld).toHaveAttribute('placeholder', 'Start typing…');
  await expect(feld).toHaveValue('');
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
  const feld = page.getByRole('textbox', { name: 'Note' });
  await feld.fill(SATZ);
  await expect(page.locator('.ziel b')).toHaveText('Inbox');
  await expect(page.getByRole('button', { name: 'File' })).toBeEnabled();
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-01b-typing.png` });
});

test('hash opens suggestions and the keyboard follows the device', async ({ page }, testInfo) => {
  const feld = page.getByRole('textbox', { name: 'Note' });
  await feld.fill(TAG_TEXT);
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
    await expect(feld).toHaveValue(`${TAG_TEXT}\n`);
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
  await expect(feld).toHaveValue(TAG_TEXT.replace('#wo', '#Workout'));
  await expect(liste).toHaveCount(0);
  await expect(page.locator('.ziel b')).toHaveText('Workout');
});

test('a suggestion can be tapped', async ({ page }) => {
  const feld = page.getByRole('textbox', { name: 'Note' });
  await feld.fill('Remember #wo');
  await page.getByRole('option', { name: /Workout/ }).click();
  await expect(feld).toHaveValue('Remember #Workout');
  await expect(page.locator('.ziel b')).toHaveText('Workout');
  await feld.fill('Remember #zz');
  await page.getByRole('option', { name: /New topic/ }).click();
  await expect(feld).toHaveValue('Remember #zz');
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('files with the button and with ctrl enter', async ({ page }, testInfo) => {
  const feld = page.getByRole('textbox', { name: 'Note' });
  await feld.fill('Buy milk');
  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('status')).toContainText('Filed in');
  await expect(page.getByRole('status')).toContainText('Inbox');
  await expect(page.getByRole('button', { name: 'Change' })).toBeVisible();
  await expect(feld).toHaveValue('');
  await expect(feld).toBeFocused();
  await expect(page.getByRole('button', { name: 'File' })).toBeDisabled();

  await feld.fill('Pay the rent #Home');
  await expect(page.locator('.ziel b')).toHaveText('Home');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('status')).toContainText('Home');
  await expect(feld).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Change' })).toBeVisible();
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-03-toast.png` });

  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await page.keyboard.press('Control+Enter');
  await expect(feld).toHaveValue('');
});

test('library is an empty placeholder', async ({ page }) => {
  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole('button', { name: 'File' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Library' })).toHaveCount(0);
  await page.goto('/library');
  await expect(page.getByRole('button', { name: 'File' })).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();
});
