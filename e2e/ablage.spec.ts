import fs from 'node:fs';
import { expect, test } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeQuelle } from './feld.ts';
import { leereLokal, warteBereit } from './lokal.ts';

const BILDER = 'tmp-test/screens';
const SEITE = ['# Deutsch LK', '', '## Analysis', '', 'First', '', '### Deeper'].join('\n');

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

test('a shorthand path shows the target and files into the section', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const erstellt = await page.request.post('/api/notes', { data: { text: '#school/Seite\nSeed' } });
  expect(erstellt.ok()).toBeTruthy();
  const id = ((await erstellt.json()) as { id: number }).id;
  const umbenannt = await page.request.post(`/api/notes/${id}`, { data: { text: SEITE, version: 1 } });
  expect(umbenannt.ok()).toBeTruthy();

  await page.goto('/');
  await warteBereit(page);
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeFocused();

  await setzeQuelle(page, '#Garten/Algebra Idea');
  await expect(page.locator('.ziel')).toContainText('Goes to');
  await expect(page.locator('.ziel b')).toHaveText(['Garten', 'Algebra']);
  await expect(page.locator('.ziel')).toContainText('(new)');

  await setzeQuelle(page, '#wrk Hmm');
  await expect(page.locator('.ziel')).toContainText('Did you mean Work?');
  await expect(page.locator('.ziel b')).toHaveText('wrk');
  await expect(page.locator('.ziel')).toContainText('(new)');

  await setzeQuelle(page, '#a/b/c/d Too');
  await expect(page.locator('.ziel')).toHaveText('A path has at most three levels.');
  await expect(page.getByRole('button', { name: 'File' })).toBeDisabled();

  await setzeQuelle(page, '#school/deu');
  await expect(page.getByRole('option', { name: 'Deutsch LK', exact: true }).first()).toBeVisible();

  await setzeQuelle(page, '#school/deutsch-lk/analysis Verb');
  await expect(page.locator('.ziel')).toContainText('Goes to');
  await expect(page.locator('.ziel b')).toHaveText(['school', 'Deutsch LK', 'Analysis']);
  await expect(page.locator('.ziel')).not.toContainText('(new)');
  if (testInfo.project.name === 'handy') {
    await page.screenshot({ path: `${BILDER}/handy-ablage-ziel.png` });
  }

  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('status')).toContainText('Added to');
  await expect(page.getByRole('status')).toContainText('Deutsch LK > Analysis');
  await erwarteQuelle(page, '');

  await setzeQuelle(page, '#school/deutsch-lk Tail');
  await expect(page.locator('.ziel b')).toHaveText(['school', 'Deutsch LK']);
  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('status')).toContainText('Added to');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();

  const mitSchwanz = await page.request.get(`/api/notes/${id}`);
  expect(mitSchwanz.ok()).toBeTruthy();
  const vorher = ((await mitSchwanz.json()) as { text: string }).text;
  expect(vorher.indexOf('## Analysis')).toBeLessThan(vorher.indexOf('Verb'));
  expect(vorher.indexOf('Verb')).toBeLessThan(vorher.indexOf('Tail'));

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Added to')).toHaveCount(0);
  const ohne = await page.request.get(`/api/notes/${id}`);
  const nachher = ((await ohne.json()) as { text: string }).text;
  expect(nachher).toContain('Verb');
  expect(nachher).not.toContain('Tail');
  expect(nachher.indexOf('### Deeper')).toBeLessThan(nachher.indexOf('Verb'));

  await page.goto(`/library/topic?name=${encodeURIComponent('school')}`);
  await expect(page.getByRole('heading', { name: 'school', level: 1 })).toBeVisible();
  await page.locator(`#note-${id} a.tx`).click();
  await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
  await expect(page.getByRole('heading', { level: 1, name: 'school > Deutsch LK' })).toBeVisible();
  const verzeichnis = page.getByRole('navigation', { name: 'On this page' });
  await expect(verzeichnis.getByRole('link')).toHaveText(['Analysis']);
  await expect(page.locator('#abschnitt-0')).toHaveText('Analysis');
  await expect(page.locator('.lesetext')).toContainText('Verb');
  await expect(page.getByRole('heading', { level: 3, name: 'Deeper' })).toBeVisible();
  if (testInfo.project.name === 'handy') {
    await page.screenshot({ path: `${BILDER}/handy-ablage-seite.png` });
    await verzeichnis.screenshot({ path: `${BILDER}/handy-ablage-verzeichnis.png` });
  }
  await verzeichnis.getByRole('link', { name: 'Analysis' }).click();
  await expect(page.locator('#abschnitt-0')).toBeInViewport();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'school', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Library' }).click();
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
});
