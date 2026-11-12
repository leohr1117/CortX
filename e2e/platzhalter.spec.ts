import { expect, test, type Page } from './ruhe.ts';
import { oeffneFeld } from './abnahme/feldOeffnen.ts';
import { sichereBestand, stelleBestand } from './schau.ts';
import { FELD, leereAuswahl, ruhig } from './abnahme/hilfen.ts';

let bestand: ReturnType<typeof sichereBestand> | null = null;

test.beforeEach(() => {
  bestand = sichereBestand();
});

test.afterEach(() => {
  if (bestand) stelleBestand(bestand);
  bestand = null;
});

const PLATZ = `${FELD} .cm-placeholder`;

async function fuegeEin(page: Page, text: string): Promise<void> {
  await page.locator(FELD).evaluate((el, wert: string) => {
    const ablage = new DataTransfer();
    ablage.setData('text/plain', wert);
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: ablage });
    el.dispatchEvent(event);
  }, text);
  await ruhig(page);
}

test('an empty note in the edit view shows Start typing', async ({ page }) => {
  await oeffneFeld(page, 'notiz');
  await expect(page.locator(PLATZ)).toHaveText('Start typing\u2026');
});

test('an empty list item hides the placeholder', async ({ page }) => {
  await oeffneFeld(page, 'notiz');
  await page.keyboard.type('- ');
  await ruhig(page);
  await expect(page.locator(`${FELD} .cm-marker`)).toHaveCount(1);
  await expect(page.locator(PLATZ)).toHaveCount(0);
});

test('an empty checkbox hides the placeholder', async ({ page }) => {
  await oeffneFeld(page, 'notiz');
  await page.keyboard.type('[] ');
  await ruhig(page);
  await expect(page.locator(`${FELD} .cm-haken`)).toHaveCount(1);
  await expect(page.locator(PLATZ)).toHaveCount(0);
});

test('a blank line or a divider alone hides the placeholder', async ({ page }) => {
  await oeffneFeld(page, 'notiz');
  await page.keyboard.type('x');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await ruhig(page);
  await expect(page.locator(PLATZ)).toHaveCount(0);
  await leereAuswahl(page);
  await fuegeEin(page, '---');
  await expect(page.locator(`${FELD} hr`)).toHaveCount(1);
  await expect(page.locator(PLATZ)).toHaveCount(0);
});

test('clearing the note shows the placeholder again', async ({ page }) => {
  await oeffneFeld(page, 'notiz');
  await page.keyboard.type('Probe');
  await expect(page.locator(PLATZ)).toHaveCount(0);
  await leereAuswahl(page);
  await expect(page.locator(PLATZ)).toHaveText('Start typing\u2026');
});
