import { test, type Locator, type Page } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeCursor, setzeQuelle } from './feld.ts';
import { leereLokal } from './lokal.ts';

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

function inhalt(page: Page): Locator {
  return page.locator('.schreib .cm-content');
}

async function tasteZurueck(page: Page): Promise<void> {
  await inhalt(page).evaluate((el) => {
    el.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'deleteContentBackward',
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

test('deleting one side of a formatting pair removes the other', async ({ page }) => {
  test.setTimeout(60_000);
  const feld = inhalt(page);

  await setzeQuelle(page, '*test*');
  await feld.press('Backspace');
  await erwarteQuelle(page, 'test');
  await page.keyboard.press('Control+z');
  await erwarteQuelle(page, '*test*');

  await setzeCursor(page, 1);
  await feld.press('Backspace');
  await erwarteQuelle(page, 'test');

  await setzeQuelle(page, '*test*');
  await setzeCursor(page, 0);
  await feld.press('Delete');
  await erwarteQuelle(page, 'test');

  await setzeQuelle(page, '**x**');
  await feld.press('Backspace');
  await erwarteQuelle(page, 'x');

  await setzeQuelle(page, '*test*');
  await tasteZurueck(page);
  await erwarteQuelle(page, 'test');

  await setzeQuelle(page, 'hello');
  await feld.press('Backspace');
  await erwarteQuelle(page, 'hell');
});
