import fs from 'node:fs';
import { expect, festeZeit, test, type Page } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeAuswahl, setzeQuelle } from './feld.ts';
import { leereLokal } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand } from './schau.ts';

const REFERENZ = 'tmp-test/referenz';
const WORT = 'einkau';
const NEU = 'Einkauf';

test.beforeAll(() => {
  fs.mkdirSync(REFERENZ, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

function feld(page: Page) {
  return page.locator('.schreib .ProseMirror');
}

async function pruefeFokus(page: Page): Promise<void> {
  await expect.poll(() => feld(page).evaluate((el) => document.activeElement === el)).toBe(true);
}

async function starteFeld(page: Page): Promise<void> {
  await feld(page).click();
  await pruefeFokus(page);
}

async function ersetzeAuswahl(page: Page, text: string, von: number, bis: number, nachher: string): Promise<void> {
  await setzeQuelle(page, text);
  await setzeAuswahl(page, von, bis);
  await pruefeFokus(page);
  const verhindert = await feld(page).evaluate((el, data: string) => {
    const ereignis = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertReplacementText',
      data,
    });
    el.dispatchEvent(ereignis);
    return ereignis.defaultPrevented;
  }, NEU);
  expect(verhindert).toBe(true);
  await erwarteQuelle(page, nachher);
}

async function komponiere(page: Page, text: string, nachher: string): Promise<void> {
  await setzeQuelle(page, text);
  await pruefeFokus(page);
  const verhindert = await feld(page).evaluate(async (el, angabe: { wort: string; data: string }) => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    el.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: angabe.data }));
    const ereignis = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertCompositionText',
      data: angabe.data,
    });
    el.dispatchEvent(ereignis);
    const wandler = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let knoten = wandler.nextNode();
    let ersetzt = false;
    while (knoten) {
      const inhalt = knoten.textContent ?? '';
      const index = inhalt.indexOf(angabe.wort);
      if (index >= 0) {
        knoten.textContent = inhalt.slice(0, index) + angabe.data + inhalt.slice(index + angabe.wort.length);
        ersetzt = true;
        break;
      }
      knoten = wandler.nextNode();
    }
    if (!ersetzt) throw new Error('composition text missing');
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: angabe.data }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    return ereignis.defaultPrevented;
  }, { wort: WORT, data: NEU });
  expect(verhindert).toBe(false);
  await erwarteQuelle(page, nachher);
}

async function oeffneNotiz(page: Page, text: string): Promise<void> {
  setzeSchauspiel([{ name: 'Work', notizen: [{ text, created: festeZeit(0, 9, 12) }] }]);
  await page.goto('/library/topic?name=Work');
  await page.locator('.notiz').first().locator('a.tx').click();
  await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(feld(page)).toBeVisible();
  await erwarteQuelle(page, text);
  await starteFeld(page);
}

test('a keyboard suggestion replaces the selected word while capturing', async ({ page }, testInfo) => {
  await starteFeld(page);
  await ersetzeAuswahl(page, WORT, 0, WORT.length, NEU);
  await expect(feld(page)).toHaveText(NEU);
  if (testInfo.project.name === 'android-pixel') {
    await page.screenshot({ path: `${REFERENZ}/android-pixel-ime-nachher.png` });
  }
});

test('a keyboard suggestion replaces a word inside a sentence and keeps the following space', async ({ page }) => {
  await starteFeld(page);
  const satz = `Bitte ${WORT}`;
  await ersetzeAuswahl(page, satz, satz.indexOf(WORT), satz.indexOf(WORT) + WORT.length, `Bitte ${NEU}`);
  const mitLeerzeichen = `${WORT} `;
  await ersetzeAuswahl(page, mitLeerzeichen, 0, WORT.length, `${NEU} `);
  const satzMitLeerzeichen = `Bitte ${WORT} `;
  const start = satzMitLeerzeichen.indexOf(WORT);
  await ersetzeAuswahl(page, satzMitLeerzeichen, start, start + WORT.length, `Bitte ${NEU} `);
});

test('a composition replaces the typed word while capturing', async ({ page }) => {
  await starteFeld(page);
  await komponiere(page, WORT, NEU);
  await komponiere(page, `Bitte ${WORT}`, `Bitte ${NEU}`);
  await komponiere(page, `${WORT} `, `${NEU} `);
  await komponiere(page, `Bitte ${WORT} `, `Bitte ${NEU} `);
});

test('letters still append while capturing', async ({ page }) => {
  await starteFeld(page);
  await setzeQuelle(page, WORT);
  await pruefeFokus(page);
  await feld(page).pressSequentially('ab', { delay: 20 });
  await erwarteQuelle(page, `${WORT}ab`);
});

test('a suggestion and a composition replace the word in a note', async ({ page }) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  try {
    await oeffneNotiz(page, WORT);
    await ersetzeAuswahl(page, WORT, 0, WORT.length, NEU);
    await expect(feld(page)).toHaveText(NEU);
    const satz = `Bitte ${WORT}`;
    await ersetzeAuswahl(page, satz, satz.indexOf(WORT), satz.indexOf(WORT) + WORT.length, `Bitte ${NEU}`);
    await ersetzeAuswahl(page, `${WORT} `, 0, WORT.length, `${NEU} `);
    await komponiere(page, WORT, NEU);
    await komponiere(page, `Bitte ${WORT}`, `Bitte ${NEU}`);
    await komponiere(page, `Bitte ${WORT} `, `Bitte ${NEU} `);
    await setzeQuelle(page, WORT);
    await pruefeFokus(page);
    await feld(page).pressSequentially('ab', { delay: 20 });
    await erwarteQuelle(page, `${WORT}ab`);
  } finally {
    stelleBestand(bestand);
  }
});
