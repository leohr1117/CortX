import fs from 'node:fs';
import { expect, festeZeit, test } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeQuelle } from './feld.ts';
import { leereLokal } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand } from './schau.ts';

const BILDER = 'tmp-test/screens';

const THEMA = [
  'Ask Mara about the review',
  '',
  '- send the **numbers**',
  '- book the room',
  '[] confirm Thursday',
  '[x] share the agenda',
  'See <b>Mara</b> and keep #work as written.',
  'A lone ** stays.',
].join('\n');

const EINGANG = [
  'Hold the hallway scrap',
  '- spare **key**',
  '[] call the depot',
  '[x] seal the crate',
  'Leave <em>markup</em> and #inbox as written.',
].join('\n');

const LISTE = '- send the **folio** numbers';
const OFFEN = '[] confirm the folio hold';
const ZU = '[x] share the folio agenda';
const ROH = 'See <b>Mara</b> and keep #work on the folio';

function versatz(tage: number, stunde: number, minute: number): string {
  return festeZeit(tage, stunde, minute);
}

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

test('reading shows a list, checkboxes, and bold while the stored text stays plain', async ({ page }, testInfo) => {
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
      {
        name: 'Folio',
        notizen: [
          { text: LISTE, created: versatz(0, 16, 0) },
          { text: OFFEN, created: versatz(0, 15, 0) },
          { text: ZU, created: versatz(0, 14, 0) },
          { text: ROH, created: versatz(0, 13, 0) },
        ],
      },
    ]);

    await page.goto('/library/topic?name=Work');
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    const notiz = page.locator('.notiz', { hasText: 'Ask Mara about the review' });
    await expect(notiz.locator('.ti')).toHaveText('Ask Mara about the review');
    await expect(notiz.locator('li, strong, .haken, .lesetext')).toHaveCount(0);
    await expect(notiz).not.toContainText('book the room');
    await notiz.locator('a.tx').click();
    await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
    await expect(page.locator('.lesetext li')).toHaveText(['send the numbers', 'book the room']);
    await expect(page.locator('.lesetext strong')).toHaveText('numbers');
    await expect(page.locator('.lesetext .hakenlabel')).toHaveText(['confirm Thursday', 'share the agenda']);
    await expect(page.locator('.lesetext .haken.zu')).toHaveCount(1);
    await expect(page.locator('.lesetext .haken')).toHaveCount(2);
    await expect(page.locator('input, button.haken')).toHaveCount(0);
    await expect(page.locator('.lesetext b, .lesetext em, .lesetext img, .lesetext script')).toHaveCount(0);
    await expect(page.locator('.lesetext')).toContainText('See <b>Mara</b> and keep #work as written.');
    await expect(page.locator('.lesetext')).toContainText('A lone ** stays.');
    await expect(page.locator('.lesetext')).not.toContainText('- send');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible();
    const schlicht = page.locator('.notiz', { hasText: 'Lunch with Jonas' });
    await expect(schlicht.locator('.ti')).toHaveText('Lunch with Jonas went well.');
    await expect(schlicht.locator('li, .haken, strong')).toHaveCount(0);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-read-topic.png` });

    await page.locator('.notiz').first().locator('a.tx').click();
    await page.getByRole('button', { name: 'Edit' }).click();
    const feld = page.getByRole('textbox', { name: 'Note' });
    await expect(feld).toBeVisible();
    await erwarteQuelle(page, THEMA);
    await expect(page.locator('.lesetext')).toHaveCount(0);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-read-edit.png` });

    await page.goto('/library/topic?name=Inbox');
    await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
    const eingang = page.locator('.notiz', { hasText: 'hallway scrap' });
    await expect(eingang.locator('.ti')).toHaveText('Hold the hallway scrap');
    await expect(eingang.locator('li, strong, .haken')).toHaveCount(0);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-read-inbox.png` });
    await eingang.locator('a.tx').click();
    await expect(page.locator('.lesetext li')).toHaveText('spare key');
    await expect(page.locator('.lesetext strong')).toHaveText('key');
    await expect(page.locator('.lesetext .hakenlabel')).toHaveText(['call the depot', 'seal the crate']);
    await expect(page.locator('.lesetext .haken.zu')).toHaveCount(1);
    await expect(page.locator('.lesetext em')).toHaveCount(0);
    await expect(page.locator('.lesetext')).toContainText('Leave <em>markup</em> and #inbox as written.');
    await page.getByRole('button', { name: 'Back' }).click();

    await page.goto('/library');
    await page.getByRole('textbox', { name: 'Search notes' }).fill('folio');
    await expect(page.locator('.zeile .lesetext')).toHaveText([
      'send the folio numbers',
      'confirm the folio hold',
      'share the folio agenda',
      'See <b>Mara</b> and keep #work on the folio',
    ]);
    const treffer = page.locator('.zeile', { hasText: 'send the folio numbers' });
    await expect(treffer.locator('strong')).toHaveText('folio');
    await expect(treffer.locator('li')).toHaveCount(1);
    await expect(treffer).not.toContainText('- send');
    const offen = page.locator('.zeile', { hasText: 'confirm the folio hold' });
    await expect(offen.locator('.haken:not(.zu)')).toHaveCount(1);
    await expect(offen).not.toContainText('[]');
    const zu = page.locator('.zeile', { hasText: 'share the folio agenda' });
    await expect(zu.locator('.haken.zu')).toHaveCount(1);
    await expect(zu).not.toContainText('[x]');
    const roh = page.locator('.zeile', { hasText: '#work on the folio' });
    await expect(roh.locator('b')).toHaveCount(0);
    await expect(roh).toContainText('<b>Mara</b>');
    await expect(roh).toContainText('#work');
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-read-search.png` });

    await treffer.click();
    await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
    await expect(page.locator('.lesetext li')).toHaveText('send the folio numbers');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Folio', level: 1 })).toBeVisible();
    await expect(page.locator('.notiz .ti', { hasText: 'send the folio numbers' })).toBeVisible();
    await expect(page.locator('.notiz li')).toHaveCount(0);

    await page.goto('/');
    const rohtext = '- **bold** [] <b>x</b>';
    await setzeQuelle(page, rohtext);
    await expect(page.locator('.spiegel')).toHaveCount(0);
    await expect(page.locator('.schreib .cm-fett')).toHaveText('bold');
    await expect(page.locator('.schreib .ProseMirror')).toContainText('<b>x</b>');
    await expect(page.locator('.schreib .ProseMirror')).not.toContainText('**');
    const klar = await page.evaluate(() => {
      const leser = (window as unknown as { __cortxModell?: { klartext: () => string } }).__cortxModell;
      return leser?.klartext() ?? '';
    });
    expect(klar).toContain('bold');
    expect(klar).toContain('<b>x</b>');
    expect(klar).not.toContain('**');
    await erwarteQuelle(page, rohtext);
  } finally {
    stelleBestand(bestand);
  }
});
