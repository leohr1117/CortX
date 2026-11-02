import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { erkenneTermin, terminText } from '../shared/features/termine/index.ts';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle } from './feld.ts';
import { leereLokal } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand } from './schau.ts';

const BILDER = 'tmp-test/screens';
const ERSTELLT = '2026-11-01T15:00:00.000Z';
const SONNTAG = '2026-11-01T10:00:00.000Z';

const THEMA = ['= Review tomorrow at 3pm', '- send the **numbers**', '[] confirm the room'].join('\n');
const OHNE = 'Lunch with Jonas went well.';
const EINGANG = 'Bring the spare key morgen 15 Uhr.';
const FUND = '= Lantern check next Monday at 15:30';
const SCHUBLADE = 'Lantern bulbs are in the drawer.';

function zeile(text: string, created: string): string {
  const termin = erkenneTermin(text, new Date(created));
  if (!termin) throw new Error(`No date in: ${text}`);
  const label = terminText(termin, new Date());
  if (!/^\d{1,2} [A-Z][a-z]{2}(?: \d{4})? · \d{2}:\d{2}$/.test(label)) throw new Error(label);
  return label;
}

async function oeffneEdit(page: Page): Promise<void> {
  await page.locator('.notiz').first().locator('a.tx').click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('textbox', { name: 'Note' })).toBeVisible();
}

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

test('reading shows a date on a topic, in Inbox, and in search', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const bestand = sichereBestand();
  const thema = zeile(THEMA, ERSTELLT);
  const eingang = zeile(EINGANG, ERSTELLT);
  const fund = zeile(FUND, SONNTAG);
  try {
    setzeSchauspiel([
      { name: 'Inbox', notizen: [{ text: EINGANG, created: ERSTELLT }] },
      {
        name: 'Work',
        notizen: [
          { text: THEMA, created: ERSTELLT },
          { text: OHNE, created: '2026-10-31T11:00:00.000Z' },
        ],
      },
      {
        name: 'Studio',
        notizen: [
          { text: FUND, created: SONNTAG },
          { text: SCHUBLADE, created: '2026-10-01T10:00:00.000Z' },
        ],
      },
    ]);

    await page.goto('/library/topic?name=Work');
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    const notiz = page.locator('.notiz', { hasText: 'Review tomorrow' });
    await expect(notiz.locator('.termin')).toHaveText(thema);
    await expect(notiz.locator('.termin')).toHaveText(/^2 Nov(?: 2026)? · 15:00$/);
    await expect(notiz.getByRole('heading', { level: 3 })).toHaveText('Review tomorrow at 3pm');
    await expect(notiz.locator('li')).toHaveText('send the numbers');
    await expect(notiz.locator('strong')).toHaveText('numbers');
    await expect(notiz.locator('.hakenlabel')).toHaveText('confirm the room');
    await expect(notiz.locator('.zeit')).toHaveText(/^\d{2}:\d{2}$/);
    await expect(notiz.locator('button', { hasText: /calendar|todoist/i })).toHaveCount(0);
    const schlicht = page.locator('.notiz', { hasText: 'Lunch with Jonas' });
    await expect(schlicht.locator('.termin')).toHaveCount(0);
    await expect(schlicht.locator('h3, li, strong, .haken')).toHaveCount(0);
    await expect(schlicht.locator('.zeit')).toHaveText(/^\d{2}:\d{2}$/);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-date-topic.png` });

    await oeffneEdit(page);
    await erwarteQuelle(page, THEMA);
    await expect(page.locator('.termin')).toHaveCount(0);
    await page.goto('/');
    const capture = page.getByRole('textbox', { name: 'Note' });
    await capture.fill('Call tomorrow at 3pm');
    await expect(capture).toHaveValue('Call tomorrow at 3pm');
    await expect(page.locator('.termin')).toHaveCount(0);

    await page.goto('/library/topic?name=Inbox');
    await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
    const post = page.locator('.notiz', { hasText: 'spare key' });
    await expect(post.locator('.termin')).toHaveText(eingang);
    await expect(post.locator('.termin')).toHaveText(/^2 Nov(?: 2026)? · 15:00$/);
    await expect(post).toContainText('Bring the spare key morgen 15 Uhr.');
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-date-inbox.png` });

    await page.goto('/library');
    await page.getByRole('textbox', { name: 'Search notes' }).fill('lantern');
    const treffer = page.locator('.zeile', { hasText: 'Lantern check' });
    await expect(treffer.locator('.termin')).toHaveText(fund);
    await expect(treffer.locator('.termin')).toHaveText(/^2 Nov(?: 2026)? · 15:30$/);
    await expect(treffer.getByRole('heading', { level: 3 })).toHaveText('Lantern check next Monday at 15:30');
    await expect(treffer.locator('.ne')).toHaveText('Studio');
    const leer = page.locator('.zeile', { hasText: 'Lantern bulbs' });
    await expect(leer.locator('.termin')).toHaveCount(0);
    await expect(leer.locator('.ne')).toHaveText('Studio');
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-date-search.png` });
  } finally {
    stelleBestand(bestand);
  }
});
