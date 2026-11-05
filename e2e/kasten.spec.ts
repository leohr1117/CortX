import fs from 'node:fs';
import { expect, festeZeit, test, type Locator, type Page } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { leereLokal } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand } from './schau.ts';

const BILDER = 'tmp-test/screens';
const TITEL = 'Keep the porch list';
const OFFEN = '- [ ] confirm Thursday';
const BLEIBT = 'leave this line alone';
const ZU = '[x] share the agenda';
const TEXT = [TITEL, '', OFFEN, BLEIBT, ZU].join('\n');
const GEPRUEFT = [TITEL, '', '- [x] confirm Thursday', BLEIBT, ZU].join('\n');

function versatz(tage: number, stunde: number, minute: number): string {
  return festeZeit(tage, stunde, minute);
}

async function notizText(page: Page): Promise<string> {
  const id = new URL(page.url()).searchParams.get('id');
  const antwort = await page.request.get(`/api/notes/${id}`);
  expect(antwort.ok()).toBeTruthy();
  const notiz = (await antwort.json()) as { text: string };
  return notiz.text;
}

async function warteSpeichern(page: Page, aktion: () => Promise<void>): Promise<void> {
  const gespeichert = page.waitForResponse(
    (antwort) => antwort.request().method() === 'POST' && /\/api\/notes\/\d+$/.test(antwort.url()) && antwort.ok(),
  );
  await aktion();
  await gespeichert;
}

async function schalte(page: Page, kasten: Locator, touch: boolean): Promise<void> {
  await warteSpeichern(page, async () => {
    if (touch) await kasten.tap();
    else await kasten.click();
  });
}

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

test('a checkbox in the reading view toggles and stays saved', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const bestand = sichereBestand();
  const touch = testInfo.project.name === 'handy';
  try {
    setzeSchauspiel([{ name: 'Work', notizen: [{ text: TEXT, created: versatz(0, 14, 32) }] }]);
    await page.goto('/library/topic?name=Work');
    await page.locator('.notiz', { hasText: TITEL }).locator('a.tx').click();
    await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
    const kaesten = page.getByRole('checkbox', { name: 'Task' });
    await expect(kaesten).toHaveCount(2);
    const kasten = kaesten.first();
    await expect(kasten).toHaveAttribute('aria-checked', 'false');
    await expect(kaesten.nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.lesetext .hakenlabel')).toHaveText(['confirm Thursday', 'share the agenda']);
    await expect(page.locator('input, button.haken')).toHaveCount(0);
    const masse = await kasten.evaluate((el) => {
      const stil = getComputedStyle(el);
      return { breite: stil.width, hoehe: stil.height };
    });
    expect(masse).toEqual({ breite: '16px', hoehe: '16px' });
    if (touch) await page.locator('.hakenzeile').first().screenshot({ path: `${BILDER}/handy-kasten-offen.png` });

    await schalte(page, kasten, touch);
    await expect(kasten).toHaveAttribute('aria-checked', 'true');
    await expect(kasten).toHaveClass(/zu/);
    await expect(kasten.locator('svg')).toHaveCount(1);
    expect(await notizText(page)).toBe(GEPRUEFT);
    if (touch) await page.locator('.hakenzeile').first().screenshot({ path: `${BILDER}/handy-kasten-zu.png` });

    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Task' }).first()).toHaveAttribute('aria-checked', 'true');
    expect(await notizText(page)).toBe(GEPRUEFT);

    await schalte(page, page.getByRole('checkbox', { name: 'Task' }).first(), touch);
    await expect(page.getByRole('checkbox', { name: 'Task' }).first()).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('checkbox', { name: 'Task' }).first().locator('svg')).toHaveCount(0);
    expect(await notizText(page)).toBe(TEXT);

    await page.reload();
    const wieder = page.getByRole('checkbox', { name: 'Task' }).first();
    await expect(wieder).toHaveAttribute('aria-checked', 'false');
    expect(await notizText(page)).toBe(TEXT);

    await wieder.focus();
    await warteSpeichern(page, async () => {
      await page.keyboard.press('Space');
    });
    await expect(wieder).toHaveAttribute('aria-checked', 'true');
    expect(await notizText(page)).toBe(GEPRUEFT);

    await page.goto('/library');
    await page.getByRole('textbox', { name: 'Search notes' }).fill('share the agenda');
    const treffer = page.locator('.zeile', { hasText: 'share the agenda' });
    await expect(treffer).toHaveCount(1);
    await expect(treffer.locator('.haken')).toHaveCount(2);
    await expect(treffer.locator('[role="checkbox"]')).toHaveCount(0);
  } finally {
    stelleBestand(bestand);
  }
});
