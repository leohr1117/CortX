import fs from 'node:fs';
import { tagesLabel } from '../shared/features/library/index.ts';
import { expect, FESTE_UHR, test, type Page } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { setzeQuelle } from './feld.ts';
import { leereLokal, warteBereit } from './lokal.ts';
import { setzeAlleNotizZeiten, setzeNotizZeiten, versionsNotizZeit } from './schau.ts';

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
  await expect(karte.locator('.ti')).toHaveText(sichtbar);
  await expect(karte).not.toContainText('**');
  await expect(karte).not.toContainText('# ');
  await expect(karte.locator('h2, li')).toHaveCount(0);
  const seitenkarte = page.locator('.notiz', { hasText: 'Liste' });
  await expect(seitenkarte.locator('.ti')).toHaveText('Liste');
  await expect(seitenkarte).not.toContainText('Milk and tea');
  await expect(seitenkarte).not.toContainText('Dairy');
  await ohneSeitlichenUeberlauf(page);
  const vorher = setzeAlleNotizZeiten(versionsNotizZeit());
  const label = tagesLabel(versionsNotizZeit(), FESTE_UHR);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { name: thema, level: 1 })).toBeVisible();
    await expect(karte.locator('.ti')).toHaveText(sichtbar);
    await expect(seitenkarte.locator('.ti')).toHaveText('Liste');
    await expect(page.locator('h2.ab')).toHaveText(label);
    await expect(page.locator('.notiz .zeit')).toHaveText([label, label]);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-titel-liste.png` });

    await karte.locator('a.tx').click();
    await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
    const kopf = page.locator('.kopf').getByRole('heading', { level: 1 });
    await expect(kopf).toHaveText(thema);
    await expect(page.locator('.lesetext h2.titel')).toHaveCount(0);
    await expect(page.locator('main.notizblatt .lesetext')).toContainText(sichtbar);
    const blatt = await page.locator('main.notizblatt').innerText();
    expect(blatt.split(sichtbar).length - 1).toBe(1);
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
    await expect(page.locator('.kopf').getByRole('heading', { level: 1 })).toHaveText(thema);
    const abschnittBlatt = await page.locator('main.notizblatt').innerText();
    expect(abschnittBlatt.split('Liste').length - 1).toBe(1);
    const verzeichnis = page.getByRole('navigation', { name: 'On this page' });
    await expect(verzeichnis.getByRole('link')).toHaveText(['Dairy']);
    await expect(page.locator('.lesetext h2.titel')).toHaveCount(0);
    await expect(page.locator('.lesetext p').first()).toHaveText('Liste');
    await expect(page.locator('#abschnitt-0')).toHaveText('Dairy');
    await ohneSeitlichenUeberlauf(page);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-titel-abschnitt.png` });
  } finally {
    setzeNotizZeiten(vorher);
  }

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
