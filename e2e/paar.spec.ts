import { expect, festeZeit, test, type Page } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeCursor, setzeQuelle } from './feld.ts';
import { leereLokal } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand, type Bestand } from './schau.ts';

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

async function modellKlartext(page: Page): Promise<string> {
  return page.evaluate(() => {
    const leser = (window as unknown as { __cortxModell?: { klartext: () => string } }).__cortxModell;
    return leser?.klartext() ?? '';
  });
}

async function modellHatMarke(page: Page, art: string): Promise<boolean> {
  return page.evaluate((name) => {
    const json = (window as unknown as { __cortxModell?: { json: () => unknown } }).__cortxModell?.json();
    return JSON.stringify(json ?? {}).includes(`"type":"${name}"`);
  }, art);
}

async function stellePaarZurueck(page: Page, bestand: Bestand): Promise<void> {
  await page.goto('about:blank').catch(() => undefined);
  await page.waitForTimeout(500).catch(() => undefined);
  stelleBestand(bestand);
}

async function oeffneNotiz(page: Page): Promise<void> {
  setzeSchauspiel([{ name: 'Pair', notizen: [{ text: 'Keep', created: festeZeit(0, 9, 12) }] }]);
  await page.goto('/library/topic?name=Pair');
  await page.locator('.notiz').first().locator('a.tx').click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await erwarteQuelle(page, 'Keep');
}

async function pruefeImport(page: Page, quelle: string, sichtbar: string, klasse: string, marke: string): Promise<void> {
  await setzeQuelle(page, quelle);
  await erwarteQuelle(page, quelle);
  await expect(page.locator('.schreib .ProseMirror')).toHaveText(sichtbar);
  await expect(page.locator(`.schreib .${klasse}`)).toHaveText(sichtbar);
  expect(await modellKlartext(page)).toBe(sichtbar);
  expect(await modellHatMarke(page, marke)).toBe(true);
}

test('imported format is a mark on both fields, not marker characters', async ({ page }) => {
  test.setTimeout(90_000);
  await pruefeImport(page, '*test*', 'test', 'cm-kursiv', 'kursiv');
  await pruefeImport(page, '**x**', 'x', 'cm-fett', 'fett');
  const bestand = sichereBestand();
  try {
    await oeffneNotiz(page);
    await pruefeImport(page, '*test*', 'test', 'cm-kursiv', 'kursiv');
    await pruefeImport(page, '**x**', 'x', 'cm-fett', 'fett');
  } finally {
    await stellePaarZurueck(page, bestand);
  }
});

async function pruefeBearbeiten(page: Page): Promise<void> {
  const feld = page.locator('.schreib .ProseMirror');
  await setzeQuelle(page, '*test*');
  await setzeCursor(page, 2);
  await page.keyboard.type('Z');
  await erwarteQuelle(page, '*tZest*');
  expect(await modellKlartext(page)).toBe('tZest');
  await expect(page.locator('.schreib .cm-kursiv')).toHaveText('tZest');

  await setzeQuelle(page, '*test*');
  await feld.press('Backspace');
  await erwarteQuelle(page, '*tes*');
  expect(await modellKlartext(page)).toBe('tes');
  await expect(page.locator('.schreib .cm-kursiv')).toHaveText('tes');

  await setzeQuelle(page, 'hello');
  await feld.press('Backspace');
  await erwarteQuelle(page, 'hell');
}

test('the note editor edits imported format inside the model', async ({ page }) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  try {
    await oeffneNotiz(page);
    await pruefeBearbeiten(page);
  } finally {
    await stellePaarZurueck(page, bestand);
  }
});

test('the capture editor edits imported format inside the model', async ({ page }) => {
  test.setTimeout(90_000);
  await pruefeBearbeiten(page);
});
