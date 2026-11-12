import { expect, festeZeit, test, type Page } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeQuelle } from './feld.ts';
import { leereLokal } from './lokal.ts';
import { setzeSchauspiel } from './schau.ts';

function versatz(): string {
  return festeZeit(0, 9, 12);
}

async function imEditor(page: Page, text: string): Promise<void> {
  setzeSchauspiel([{ name: 'Work', notizen: [{ text, created: versatz() }] }]);
  await page.goto('/library/topic?name=Work');
  await page.locator('.notiz').first().locator('a.tx').click();
  await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
  await page.getByRole('button', { name: 'Edit' }).click();
  await erwarteQuelle(page, text);
}

async function fuegeEin(page: Page, plain: string, html: string): Promise<void> {
  await page.locator('.schreib .ProseMirror').evaluate((el, angabe: { plain: string; html: string }) => {
    const data = new DataTransfer();
    data.setData('text/plain', angabe.plain);
    data.setData('text/html', angabe.html);
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    el.dispatchEvent(event);
  }, { plain, html });
}

async function vorher(page: Page, inputType: string): Promise<void> {
  await page.locator('.schreib .ProseMirror').evaluate((el, typ: string) => {
    el.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: typ,
        data: null,
      }),
    );
  }, inputType);
}

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

const MARKDOWN = '# Titel\n**fett** und `code`\n- a\n1. b\nText danach';
const HTML = '<div># Titel</div><div>**fett** und `code`</div><div>- a</div><div>1. b</div><div>Text danach</div>';

test('backspace and enter end an empty numbered item in the capture field', async ({ page }) => {
  await setzeQuelle(page, '1. ');
  await page.keyboard.press('Backspace');
  await erwarteQuelle(page, '');
  await setzeQuelle(page, 'hello');
  await erwarteQuelle(page, 'hello');

  await setzeQuelle(page, '1. ');
  await page.keyboard.press('Enter');
  await erwarteQuelle(page, '');
  await setzeQuelle(page, 'hello');
  await erwarteQuelle(page, 'hello');

  await setzeQuelle(page, '1. milk');
  await page.keyboard.press('Enter');
  await erwarteQuelle(page, '1. milk\n2. ');

  await setzeQuelle(page, '1. eins\n2. ');
  await page.keyboard.press('Enter');
  await erwarteQuelle(page, '1. eins\n');

  await setzeQuelle(page, '1. ');
  await vorher(page, 'deleteContentBackward');
  await erwarteQuelle(page, '');

  await setzeQuelle(page, '1. ');
  await vorher(page, 'insertParagraph');
  await erwarteQuelle(page, '');
});

test('backspace and enter end an empty numbered item in the editor', async ({ page }) => {
  await imEditor(page, '1. ');
  await page.keyboard.press('Backspace');
  await erwarteQuelle(page, '');
  await setzeQuelle(page, 'hello');
  await erwarteQuelle(page, 'hello');

  await setzeQuelle(page, '1. ');
  await page.keyboard.press('Enter');
  await erwarteQuelle(page, '');
  await setzeQuelle(page, 'hello');
  await erwarteQuelle(page, 'hello');

  await setzeQuelle(page, '1. milk');
  await page.keyboard.press('Enter');
  await erwarteQuelle(page, '1. milk\n2. ');

  await setzeQuelle(page, '1. eins\n2. ');
  await page.keyboard.press('Enter');
  await erwarteQuelle(page, '1. eins\n');

  await setzeQuelle(page, '1. ');
  await vorher(page, 'deleteContentBackward');
  await erwarteQuelle(page, '');
});

test('pasted markdown is formatted even when html still shows the markers', async ({ page }) => {
  await setzeQuelle(page, '');
  await fuegeEin(page, MARKDOWN, HTML);
  await erwarteQuelle(page, MARKDOWN);
  await expect(page.locator('.schreib .ProseMirror')).not.toContainText('**');
  await expect(page.locator('.schreib .ProseMirror')).toContainText('Text danach');
  await expect(page.locator('.schreib .cm-fett')).toContainText('fett');

  await imEditor(page, 'Vorher');
  await setzeQuelle(page, '');
  await fuegeEin(page, MARKDOWN, HTML);
  await erwarteQuelle(page, MARKDOWN);
  await expect(page.locator('.schreib .ProseMirror')).not.toContainText('**');
  await expect(page.locator('.schreib .ProseMirror')).toContainText('Text danach');
});
