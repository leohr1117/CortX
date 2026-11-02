import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { cursorKopf, erwarteQuelle, setzeQuelle } from './feld.ts';
import { leereLokal, warteBereit } from './lokal.ts';

const BILDER = 'tmp-test/screens';
const TEILEN = '#school/Thema1 text1\ntext1 text1\n#school/Thema2 text2\ntext2 text2';

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

async function texte(page: Page, thema: string): Promise<string[]> {
  const antwort = await page.request.get(`/api/library/notes?topic=${encodeURIComponent(thema)}`);
  expect(antwort.ok()).toBeTruthy();
  return ((await antwort.json()) as { notes: Array<{ text: string }> }).notes.map((notiz) => notiz.text);
}

test('target lines split one note across pages', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const handy = testInfo.project.name === 'handy';
  let token = '';
  try {
    await page.goto('/');
    await warteBereit(page);
    await setzeQuelle(page, TEILEN);
    await expect(page.locator('.ziel')).toContainText('Goes to');
    await expect(page.locator('.ziel b')).toHaveText(['school', 'Thema1', 'school', 'Thema2']);
    await expect(page.locator('.ziel')).toContainText('(new)');
    if (handy) await page.screenshot({ path: `${BILDER}/handy-zielzeilen-teilen.png` });
    const warten = page.waitForResponse(
      (antwort) => antwort.url().endsWith('/api/notes') && antwort.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'File' }).click();
    const antwort = await warten;
    expect(antwort.ok()).toBeTruthy();
    const koerper = (await antwort.json()) as { undo?: string; ziel?: string };
    token = koerper.undo ?? '';
    expect(koerper.ziel ?? '').toContain('Thema1');
    expect(koerper.ziel ?? '').toContain('Thema2');
    await expect(page.getByRole('status')).toContainText('Added to');
    await expect(page.getByRole('status')).toContainText('Thema1');
    await expect(page.getByRole('status')).toContainText('Thema2');
    if (handy) await page.screenshot({ path: `${BILDER}/handy-zielzeilen-abgelegt.png` });
    const abgelegt = (await texte(page, 'school')).sort();
    expect(abgelegt).toContain('Thema1\n\ntext1\ntext1 text1');
    expect(abgelegt).toContain('Thema2\n\ntext2\ntext2 text2');
    expect(abgelegt.join('\n')).not.toContain('#school');
    expect(abgelegt.filter((text) => text.startsWith('Thema'))).toEqual([
      'Thema1\n\ntext1\ntext1 text1',
      'Thema2\n\ntext2\ntext2 text2',
    ]);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('status')).toHaveCount(0);
    await erwarteQuelle(page, TEILEN);
    await expect.poll(() => cursorKopf(page)).toBe(TEILEN.length);
    token = '';
    const danach = await texte(page, 'school');
    expect(danach).not.toContain('Thema1\n\ntext1\ntext1 text1');
    expect(danach).not.toContain('Thema2\n\ntext2\ntext2 text2');
    const themen = await page.request.get('/api/topics');
    expect(themen.ok()).toBeTruthy();
    const namen = ((await themen.json()) as { topics: Array<{ name: string }> }).topics.map((thema) => thema.name);
    expect(namen).toContain('school');
  } finally {
    if (token) await page.request.post('/api/notes/undo', { data: { token } });
  }
});

test('text before the first target line goes to the inbox', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const thema = `Vor${testInfo.project.name}`;
  const roh = `starts in the inbox\n#${thema}/Page keep #tag`;
  let token = '';
  try {
    await page.goto('/');
    await warteBereit(page);
    await setzeQuelle(page, roh);
    await expect(page.locator('.ziel b')).toHaveText(['Inbox', thema, 'Page']);
    const warten = page.waitForResponse(
      (antwort) => antwort.url().endsWith('/api/notes') && antwort.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'File' }).click();
    const antwort = await warten;
    expect(antwort.ok()).toBeTruthy();
    token = ((await antwort.json()) as { undo?: string }).undo ?? '';
    const eingang = await texte(page, 'Inbox');
    const seiten = await texte(page, thema);
    expect(eingang).toContain('starts in the inbox');
    expect(seiten).toEqual(['Page\n\nkeep #tag']);
    expect(seiten.join('\n')).not.toContain(`#${thema}`);
    expect(seiten[0]?.startsWith('# ')).toBe(false);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('status')).toHaveCount(0);
    await erwarteQuelle(page, roh);
    await expect.poll(() => cursorKopf(page)).toBe(roh.length);
    token = '';
    expect(await texte(page, 'Inbox')).not.toContain('starts in the inbox');
    expect(await texte(page, thema)).toEqual([]);
  } finally {
    if (token) await page.request.post('/api/notes/undo', { data: { token } });
  }
});

test('an empty topic stays and the last page can be restored', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const handy = testInfo.project.name === 'handy';
  const thema = `Shelf${testInfo.project.name}`;
  let token = '';
  const erstellt = await page.request.post('/api/notes', { data: { text: `#${thema}\nOnly page` } });
  expect(erstellt.ok()).toBeTruthy();
  try {
    await page.goto(`/library/topic?name=${encodeURIComponent(thema)}`);
    await expect(page.getByRole('heading', { name: thema, level: 1 })).toBeVisible();
    await expect(page.getByText('Only page')).toBeVisible();
    const warten = page.waitForResponse(
      (antwort) => antwort.request().method() === 'POST' && /\/api\/notes\/\d+\/delete$/.test(antwort.url()),
    );
    await page.getByRole('button', { name: 'Note actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    const geloescht = await warten;
    expect(geloescht.ok()).toBeTruthy();
    token = ((await geloescht.json()) as { token?: string }).token ?? '';
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Page deleted');
    await expect(page.getByText('Only page')).toHaveCount(0);
    await expect(page.getByText('0 pages')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: thema, level: 1 })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Page deleted');
    await expect(page.getByText('0 pages')).toBeVisible();
    if (handy) await page.screenshot({ path: `${BILDER}/handy-seite-geloescht.png` });
    await page.getByRole('link', { name: 'Back to Library' }).click();
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    const zeile = page.getByRole('link', { name: new RegExp(`^${thema}\\b`) });
    await expect(zeile).toContainText('0 pages');
    await expect(page.getByRole('status')).toContainText('Page deleted');
    if (handy) await page.screenshot({ path: `${BILDER}/handy-leeres-thema.png` });
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('status')).toHaveCount(0);
    token = '';
    await expect(zeile).not.toContainText('0 pages');
    await zeile.click();
    await expect(page.getByRole('heading', { name: thema, level: 1 })).toBeVisible();
    await expect(page.getByText('Only page')).toBeVisible();
  } finally {
    if (token) await page.request.post('/api/notes/undo', { data: { token } });
  }
});
