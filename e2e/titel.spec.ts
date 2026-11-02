import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { setzeQuelle } from './feld.ts';
import { leereLokal, warteBereit } from './lokal.ts';

const BILDER = 'tmp-test/screens';

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

async function ohneSeitlichenUeberlauf(page: Page): Promise<void> {
  const passt = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(passt).toBe(true);
}

test('a paragraph on the first line is the title in the list and the header', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const thema = `Markt${testInfo.project.name}`;
  const absatz = '**Fresh** bread from the corner market';
  const sichtbar = 'Fresh bread from the corner market';
  const breite = testInfo.project.name === 'handy' ? 390 : 1440;

  await page.goto('/');
  await warteBereit(page);
  await setzeQuelle(page, `#${thema}\n${absatz}`);
  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('status')).toContainText(sichtbar);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();

  await setzeQuelle(page, `#${thema}/Liste/Dairy\nMilk and tea`);
  await expect(page.locator('.ziel b')).toHaveText([thema, 'Liste', 'Dairy']);
  if (testInfo.project.name === 'handy') {
    await page.screenshot({ path: `${BILDER}/handy-titel-erfassen.png` });
  }
  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('status')).toContainText(`${thema} > Liste`);

  const gespeichert = await texte(page, thema);
  expect(gespeichert).toContain(absatz);
  expect(gespeichert).toContain('Liste\n\n## Dairy\n\nMilk and tea');
  expect(gespeichert.every((text) => !text.startsWith('# '))).toBe(true);

  await page.goto(`/library/topic?name=${encodeURIComponent(thema)}`);
  await expect(page.getByRole('heading', { name: thema, level: 1 })).toBeVisible();
  const karte = page.locator('.notiz', { hasText: 'corner market' });
  await expect(karte).toContainText('Fresh');
  await expect(karte).toContainText('bread from the corner market');
  await expect(karte).not.toContainText('**');
  await expect(karte).not.toContainText('# ');
  await expect(karte.locator('h2.titel')).toHaveCount(0);
  const seitenkarte = page.locator('.notiz', { hasText: 'Milk and tea' });
  await expect(seitenkarte).toContainText('Liste');
  await expect(seitenkarte.locator('h2.titel')).toHaveCount(0);
  await expect(seitenkarte.locator('h2.abschnitt')).toHaveText('Dairy');
  await ohneSeitlichenUeberlauf(page);
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-titel-liste.png` });

  await karte.locator('a.tx').click();
  const kopf = page.getByRole('heading', { level: 1 });
  await expect(kopf).toHaveText(`${thema} > ${sichtbar}`);
  await expect(page.locator('.lesetext h2.titel')).toHaveCount(0);
  await expect(page.locator('.lesetext')).toContainText(sichtbar);
  await expect(page.locator('.lesetext')).not.toContainText('**');
  await ohneSeitlichenUeberlauf(page);
  const zurueck = page.getByRole('button', { name: 'Back' });
  const edit = page.getByRole('button', { name: 'Edit' });
  const kasten = await kopf.boundingBox();
  const rueck = await zurueck.boundingBox();
  const stift = await edit.boundingBox();
  expect(kasten).not.toBeNull();
  expect(rueck).not.toBeNull();
  expect(stift).not.toBeNull();
  expect(rueck!.x + rueck!.width).toBeLessThanOrEqual(kasten!.x + 2);
  expect(kasten!.x + kasten!.width).toBeLessThanOrEqual(stift!.x + 2);
  expect(stift!.x + stift!.width).toBeLessThanOrEqual(breite + 1);
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-titel-kopf.png` });

  await zurueck.click();
  await seitenkarte.locator('a.tx').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${thema} > Liste`);
  const verzeichnis = page.getByRole('navigation', { name: 'On this page' });
  await expect(verzeichnis.getByRole('link')).toHaveText(['Dairy']);
  await expect(page.locator('.lesetext h2.titel')).toHaveCount(0);
  await expect(page.locator('.lesetext p').first()).toHaveText('Liste');
  await expect(page.locator('#abschnitt-0')).toHaveText('Dairy');
  await ohneSeitlichenUeberlauf(page);
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-titel-abschnitt.png` });

  await page.goto('/library');
  await page.getByRole('textbox', { name: 'Search notes' }).fill('corner market');
  const treffer = page.locator('.zeile', { hasText: thema });
  await expect(treffer).toContainText('Fresh');
  await expect(treffer).toContainText('corner market');
  await expect(treffer).not.toContainText('**');
  await expect(treffer).not.toContainText('# ');
  await expect(treffer.locator('.ne')).toHaveText(thema);
  await ohneSeitlichenUeberlauf(page);
  if (testInfo.project.name === 'handy') {
    await page.screenshot({ path: `${BILDER}/handy-titel-suche.png` });
  }
});
