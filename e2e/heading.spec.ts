import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { cursorKopf, erwarteQuelle, setzeAuswahl, setzeCursor, setzeQuelle } from './feld.ts';
import { leereLokal } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand } from './schau.ts';

const BILDER = 'tmp-test/screens';

const THEMA = [
  'Ask Mara about the review',
  '- send the **numbers**',
  '[] confirm Thursday',
  '[x] share the agenda',
  'See <b>Mara</b> and keep #work as written.',
].join('\n');

const EINGANG = [
  '= Hold the hallway scrap',
  '- spare **key**',
  '[] call the depot',
  'Leave <em>markup</em> and #inbox as written.',
].join('\n');

const FUND = '= Lantern **heading** keeps #studio';

function versatz(tage: number, stunde: number, minute: number): string {
  const jetzt = new Date();
  return new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + tage, stunde, minute, 0, 0).toISOString();
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

test('edit marks a heading and reading shows it while a tag stays text', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const bestand = sichereBestand();
  try {
    setzeSchauspiel([
      { name: 'Inbox', notizen: [{ text: EINGANG, created: versatz(0, 9, 12) }] },
      {
        name: 'Work',
        notizen: [
          { text: THEMA, created: versatz(0, 14, 32) },
          { text: 'Lunch with Jonas went well.', created: versatz(-1, 12, 55) },
        ],
      },
      { name: 'Studio', notizen: [{ text: FUND, created: versatz(0, 16, 4) }] },
    ]);

    await page.goto('/library/topic?name=Work');
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    await oeffneEdit(page);
    const feld = page.getByRole('textbox', { name: 'Note' });
    const kopf = page.getByRole('button', { name: 'Heading' });
    await expect(feld).toBeVisible();
    await erwarteQuelle(page, THEMA);
    if (testInfo.project.name === 'desktop') await setzeAuswahl(page, 0, 1);
    else await setzeCursor(page, 0);
    await expect(kopf).toHaveAttribute('aria-pressed', 'false');
    await kopf.click();
    const mitKopf = `= ${THEMA}`;
    await erwarteQuelle(page, mitKopf);
    await expect(kopf).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-heading-edit.png` });

    await kopf.click();
    await erwarteQuelle(page, THEMA);
    await expect(kopf).toHaveAttribute('aria-pressed', 'false');
    await kopf.click();
    await erwarteQuelle(page, mitKopf);
    await page.getByRole('button', { name: 'Read' }).click();
    await page.getByRole('button', { name: 'Back' }).click();

    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    const notiz = page.locator('.notiz', { hasText: 'Ask Mara about the review' });
    await expect(notiz.locator('.ti')).toHaveText('Ask Mara about the review');
    await expect(notiz.locator('h3, li, strong, .haken')).toHaveCount(0);
    await expect(notiz).not.toContainText('send the numbers');
    await expect(notiz).not.toContainText('= Ask');
    const schlicht = page.locator('.notiz', { hasText: 'Lunch with Jonas' });
    await expect(schlicht.locator('.ti')).toHaveText('Lunch with Jonas went well.');
    await expect(schlicht.locator('h3')).toHaveCount(0);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-heading-topic.png` });

    await page.goto('/library/topic?name=Inbox');
    await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
    const eingang = page.locator('.notiz', { hasText: 'hallway scrap' });
    await expect(eingang.locator('.ti')).toHaveText('Hold the hallway scrap');
    await expect(eingang.locator('h3, li, strong, .haken')).toHaveCount(0);
    await expect(eingang).not.toContainText('spare key');
    await expect(eingang).not.toContainText('= Hold');
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-heading-inbox.png` });

    await page.goto('/library');
    await page.getByRole('textbox', { name: 'Search notes' }).fill('lantern');
    const treffer = page.locator('.zeile', { hasText: 'Lantern' });
    await expect(treffer.getByRole('heading', { level: 3 })).toHaveText('Lantern heading keeps #studio');
    await expect(treffer.locator('strong')).toHaveText('heading');
    await expect(treffer).toContainText('#studio');
    await expect(treffer).not.toContainText('= Lantern');
    await expect(treffer.locator('.ne')).toHaveText('Studio');
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-heading-search.png` });

    await treffer.click();
    await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
    await expect(page.getByRole('heading', { level: 3, name: 'Lantern heading keeps #studio' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Studio', level: 1 })).toBeVisible();

    await page.goto('/');
    await setzeQuelle(page, '= plain #work');
    await erwarteQuelle(page, '= plain #work');
    await expect(page.locator('.schreib h3')).toHaveCount(0);

    await page.goto('/library/topic?name=Work');
    await oeffneEdit(page);
    const nochmal = page.getByRole('textbox', { name: 'Note' });
    await expect(nochmal).toBeVisible();
    await erwarteQuelle(page, mitKopf);
    await expect.poll(() => cursorKopf(page)).toBe(mitKopf.length);
    if (testInfo.project.name === 'desktop') await setzeAuswahl(page, 0, 1);
    else await setzeCursor(page, 0);
    await expect(page.getByRole('button', { name: 'Heading' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Heading' }).click();
    await erwarteQuelle(page, THEMA);
    await page.getByRole('button', { name: 'Read' }).click();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    const klar = page.locator('.notiz', { hasText: 'Ask Mara about the review' });
    await expect(klar.locator('h3, li')).toHaveCount(0);
    await expect(klar.locator('.ti')).toHaveText('Ask Mara about the review');
    await expect(klar).not.toContainText('send the numbers');
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-heading-plain.png` });
  } finally {
    stelleBestand(bestand);
  }
});
