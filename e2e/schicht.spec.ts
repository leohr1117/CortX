import fs from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeAuswahl, setzeQuelle } from './feld.ts';
import { leereLokal } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand } from './schau.ts';

const BILDER = 'tmp-test/schicht';
const GOLD = 'rgb(243, 226, 168)';
const DUNKEL = 'rgb(26, 26, 26)';
const CHIP = 'rgb(38, 38, 38)';
const MONO = /monospace|Consolas|Cascadia|ui-monospace/i;

const TEXT = ['!!`Gold`!!', '`!!not!!`', '**`Bold`**', '!!Anna!!'].join('\n');

interface Mal {
  hintergrund: string;
  schrift: string;
  familie: string;
  schatten: string;
  gewicht: string;
}

function versatz(stunde: number, minute: number): string {
  const jetzt = new Date();
  return new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), stunde, minute, 0, 0).toISOString();
}

async function mal(ziel: Locator): Promise<Mal> {
  return ziel.evaluate((el) => {
    const stil = getComputedStyle(el);
    return {
      hintergrund: stil.backgroundColor,
      schrift: stil.color,
      familie: stil.fontFamily,
      schatten: stil.boxShadow,
      gewicht: stil.fontWeight,
    };
  });
}

function erwartetBeide(bild: Mal): void {
  expect(bild.hintergrund).toBe(GOLD);
  expect(bild.schrift).toBe(DUNKEL);
  expect(bild.familie).toMatch(MONO);
}

async function knopf(page: Page, name: string) {
  const leiste = page.getByRole('toolbar', { name: 'Format' });
  await expect(leiste).toBeVisible();
  return leiste.getByRole('button', { name });
}

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

test('important and code show both looks in either order', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  const handy = testInfo.project.name === 'handy';
  try {
    setzeSchauspiel([{ name: 'Work', notizen: [{ text: TEXT, created: versatz(9, 20) }] }]);
    await page.goto('/library/topic?name=Work');
    await page.locator('.notiz', { hasText: 'Gold' }).locator('a.tx').click();

    const leseGold = page.locator('.lesetext mark code', { hasText: 'Gold' });
    const leseCode = page.locator('.lesetext code', { hasText: '!!not!!' });
    const leseFett = page.locator('.lesetext strong code', { hasText: 'Bold' });
    const leseAnna = page.locator('.lesetext mark', { hasText: 'Anna' });
    await expect(leseGold).toBeVisible();
    erwartetBeide(await mal(leseGold));
    const chip = await mal(leseCode);
    expect(chip.hintergrund).toBe(CHIP);
    expect(chip.familie).toMatch(MONO);
    await expect(page.locator('.lesetext mark').filter({ has: page.locator('code', { hasText: '!!not!!' }) })).toHaveCount(0);
    const fett = await mal(leseFett);
    expect(fett.hintergrund).toBe(CHIP);
    expect(fett.familie).toMatch(MONO);
    expect(Number(fett.gewicht)).toBeGreaterThanOrEqual(600);
    const anna = await mal(leseAnna);
    expect(anna.hintergrund).toBe(GOLD);
    expect(anna.schrift).toBe(DUNKEL);
    expect(anna.familie).not.toMatch(MONO);
    if (handy) await page.locator('.lesetext').screenshot({ path: `${BILDER}/handy-lese.png` });

    await page.getByRole('button', { name: 'Edit' }).click();
    const editorGold = page.locator('.schreib .cm-code.cm-wichtig', { hasText: 'Gold' });
    await expect(editorGold).toHaveAttribute('style', /--stil-hintergrund:\s*#f3e2a8/);
    const editorBild = await mal(editorGold);
    erwartetBeide(editorBild);
    expect(editorBild.schatten).toContain('92, 67, 20');
    expect(editorBild.schatten).not.toContain('184, 137, 46');
    const editorCode = await mal(page.locator('.schreib .cm-code', { hasText: '!!not!!' }));
    expect(editorCode.hintergrund).toBe(CHIP);
    expect(editorCode.familie).toMatch(MONO);
    const editorFett = await mal(page.locator('.schreib .cm-fett.cm-code', { hasText: 'Bold' }));
    expect(editorFett.hintergrund).toBe(CHIP);
    expect(editorFett.familie).toMatch(MONO);
    expect(Number(editorFett.gewicht)).toBeGreaterThanOrEqual(600);
    const editorAnna = await mal(page.locator('.schreib .cm-wichtig', { hasText: 'Anna' }));
    expect(editorAnna.hintergrund).toBe(GOLD);
    expect(editorAnna.schrift).toBe(DUNKEL);
    expect(editorAnna.familie).not.toMatch(MONO);
    if (handy) await page.locator('.schreib').screenshot({ path: `${BILDER}/handy-editor.png` });

    await setzeQuelle(page, 'Hi');
    await setzeAuswahl(page, 0, 2);
    await (await knopf(page, 'Code')).click();
    await (await knopf(page, 'Important')).click();
    await erwarteQuelle(page, '!!`Hi`!!');
    const nachCode = await mal(page.locator('.schreib .cm-code.cm-wichtig', { hasText: 'Hi' }));
    erwartetBeide(nachCode);

    await setzeQuelle(page, 'Hi');
    await setzeAuswahl(page, 0, 2);
    await (await knopf(page, 'Important')).click();
    await (await knopf(page, 'Code')).click();
    await erwarteQuelle(page, '!!`Hi`!!');
    const nachWichtig = await mal(page.locator('.schreib .cm-code.cm-wichtig', { hasText: 'Hi' }));
    erwartetBeide(nachWichtig);
    expect(nachWichtig).toEqual(nachCode);

    await setzeQuelle(page, 'Hi');
    await setzeAuswahl(page, 0, 2);
    await (await knopf(page, 'Bold')).click();
    await (await knopf(page, 'Code')).click();
    const paar = await mal(page.locator('.schreib .cm-fett.cm-code', { hasText: 'Hi' }));
    expect(paar.hintergrund).toBe(CHIP);
    expect(paar.familie).toMatch(MONO);
    expect(paar.hintergrund).not.toBe(GOLD);
    if (handy) {
      const leiste = page.getByRole('toolbar', { name: 'Format' });
      await leiste.screenshot({ path: `${BILDER}/handy-leiste.png` });
    }
  } finally {
    stelleBestand(bestand);
  }
});
