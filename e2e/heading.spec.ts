import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { cursorKopf, erwarteQuelle, setzeAuswahl, setzeCursor } from './feld.ts';
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
    await expect(notiz.getByRole('heading', { level: 3 })).toHaveText('Ask Mara about the review');
    await expect(notiz.locator('li')).toHaveText('send the numbers');
    await expect(notiz.locator('strong')).toHaveText('numbers');
    await expect(notiz.locator('.hakenlabel')).toHaveText(['confirm Thursday', 'share the agenda']);
    await expect(notiz).toContainText('See <b>Mara</b> and keep #work as written.');
    await expect(notiz).not.toContainText('= Ask');
    await expect(notiz.locator('b, em, script')).toHaveCount(0);
    const schlicht = page.locator('.notiz', { hasText: 'Lunch with Jonas' });
    await expect(schlicht.getByRole('heading', { level: 3 })).toHaveCount(0);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-heading-topic.png` });

    await page.goto('/library/topic?name=Inbox');
    await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
    const eingang = page.locator('.notiz', { hasText: 'hallway scrap' });
    await expect(eingang.getByRole('heading', { level: 3 })).toHaveText('Hold the hallway scrap');
    await expect(eingang.locator('li')).toHaveText('spare key');
    await expect(eingang.locator('strong')).toHaveText('key');
    await expect(eingang.locator('.hakenlabel')).toHaveText('call the depot');
    await expect(eingang).toContainText('Leave <em>markup</em> and #inbox as written.');
    await expect(eingang.locator('em')).toHaveCount(0);
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
    await expect(page.getByRole('button', { name: 'Heading' })).toHaveCount(0);
    const capture = page.getByRole('textbox', { name: 'Note' });
    await capture.fill('= plain #work');
    await expect(capture).toHaveValue('= plain #work');
    await expect(page.locator('.spiegel h3, .spiegel .ueberschrift')).toHaveCount(0);

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
    await expect(klar.getByRole('heading', { level: 3 })).toHaveCount(0);
    await expect(klar).toContainText('Ask Mara about the review');
    await expect(klar.locator('li')).toHaveText('send the numbers');
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-heading-plain.png` });
  } finally {
    stelleBestand(bestand);
  }
});
