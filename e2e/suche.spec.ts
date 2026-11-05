import fs from 'node:fs';
import { expect, festeZeit, test, type Page } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { leereLokal } from './lokal.ts';
import { legeFremdeNotiz, setzeSchauspiel, sichereBestand, stelleBestand, type SaatNotiz } from './schau.ts';

const BILDER = 'tmp-test/screens';
const FREMD = 'lantern hidden quicksilver ledger';

function versatz(tage: number, stunde: number, minute: number): string {
  return festeZeit(tage, stunde, minute);
}

function fueller(anzahl: number): SaatNotiz[] {
  const notizen: SaatNotiz[] = [];
  for (let index = 0; index < anzahl; index += 1) {
    notizen.push({ text: `Hallway hook ${index}`, created: versatz(0, 8, index) });
  }
  return notizen;
}

async function oeffneLibrary(page: Page): Promise<void> {
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search notes' })).toBeVisible();
}

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

test('search lists notes from every topic and opens the one you pick', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const bestand = sichereBestand();
  const arbeit = `Meet at 50% (draft) about the lantern budget`;
  const haus = `Hang the porch lantern before guests arrive. ${'alpha '.repeat(40)}tailmarker`;
  const schublade = 'Loose lantern bulb in the drawer';
  try {
    setzeSchauspiel([
      { name: 'Inbox', notizen: [{ text: schublade, created: versatz(-3, 9, 0) }] },
      { name: 'Work', notizen: [{ text: arbeit, created: versatz(0, 16, 0) }] },
      {
        name: 'Home',
        notizen: [...fueller(20), { text: haus, created: versatz(-1, 18, 0) }],
      },
    ]);
    legeFremdeNotiz(FREMD);

    await oeffneLibrary(page);
    await expect(page.getByRole('link', { name: /^Inbox\b/ })).toBeVisible();
    const feld = page.getByRole('textbox', { name: 'Search notes' });
    await feld.fill('lantern');
    await expect(page.locator('.liste .zeile .ne')).toHaveText(['Work', 'Home', 'Inbox']);
    await expect(page.getByRole('link', { name: /50%/ })).toBeVisible();
    const hausTreffer = page.getByRole('link', { name: /porch lantern/ });
    await expect(hausTreffer).toBeVisible();
    await expect(hausTreffer).toContainText('tailmarker');
    await expect(hausTreffer.locator('.lesetext')).toContainText('tailmarker');
    await expect(page.getByText('quicksilver')).toHaveCount(0);
    await expect(page.getByText('hidden')).toHaveCount(0);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-search-results.png` });

    await hausTreffer.click();
    await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
    await expect(page.locator('.lesetext')).toContainText('tailmarker');
    await expect(page.getByText('Hallway hook 0')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
    const notiz = page.locator('.notiz', { hasText: 'porch lantern' });
    await expect(notiz).toBeVisible();
    await expect(notiz).toContainText('tailmarker');
    await expect(page.getByText('Hallway hook 0')).toBeVisible();

    await page.getByRole('link', { name: 'Back to Library' }).click();
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await feld.fill('*** (" :');
    await expect(page.getByText('No matches.')).toBeVisible();
    await expect(page.getByText('Could not search.')).toHaveCount(0);
    await expect(page.locator('.zeile')).toHaveCount(0);
    await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-search-empty.png` });

    await feld.fill('(draft)');
    await expect(page.getByRole('link', { name: /50%/ })).toBeVisible();
    await expect(page.getByText('No matches.')).toHaveCount(0);

    await feld.fill('quicksilver');
    await expect(page.getByText('No matches.')).toBeVisible();
    await expect(page.getByText('ledger')).toHaveCount(0);

    await feld.fill('');
    await expect(page.getByRole('link', { name: /^Work\b/ })).toBeVisible();
    await expect(page.getByText('No matches.')).toHaveCount(0);
  } finally {
    stelleBestand(bestand);
  }
});
