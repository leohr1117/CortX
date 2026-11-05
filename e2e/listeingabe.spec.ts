import { expect, test, type Page } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeQuelle } from './feld.ts';
import { leereLokal } from './lokal.ts';

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

async function vorher(page: Page, inputType: string, data: string | null = null): Promise<void> {
  await page.locator('.schreib .cm-content').focus();
  await page.locator('.schreib .cm-editor').evaluate(
    (el, angabe: { inputType: string; data: string | null }) => {
      const ziel = el.querySelector('.cm-content');
      if (!(ziel instanceof HTMLElement)) throw new Error('missing editor');
      ziel.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: angabe.inputType,
          data: angabe.data,
        }),
      );
    },
    { inputType, data },
  );
}

test('enter, shift enter, and backspace edit a list on a phone width', async ({ page }) => {
  await setzeQuelle(page, '- milk');
  await page.keyboard.press('Enter');
  await erwarteQuelle(page, '- milk\n- ');

  await setzeQuelle(page, '* milk');
  await page.keyboard.press('Enter');
  await erwarteQuelle(page, '* milk\n* ');

  await setzeQuelle(page, '[] call');
  await page.keyboard.press('Enter');
  await erwarteQuelle(page, '[] call\n[] ');

  await setzeQuelle(page, '[x] done');
  await page.keyboard.press('Enter');
  await erwarteQuelle(page, '[x] done\n[] ');

  await setzeQuelle(page, '- [x] done');
  await page.keyboard.press('Enter');
  await erwarteQuelle(page, '- [x] done\n- [ ] ');

  await setzeQuelle(page, '- ');
  await page.keyboard.press('Enter');
  await erwarteQuelle(page, '');

  await setzeQuelle(page, '- hello');
  await page.keyboard.press('Shift+Enter');
  await erwarteQuelle(page, '- hello\n  ');

  await setzeQuelle(page, '- ');
  await page.keyboard.press('Backspace');
  await erwarteQuelle(page, '');

  await setzeQuelle(page, 'hello');
  await page.keyboard.press('Enter');
  await erwarteQuelle(page, 'hello\n');
  await expect(page.getByRole('status')).toHaveCount(0);

  await setzeQuelle(page, '1. milk');
  await page.keyboard.press('Enter');
  await erwarteQuelle(page, '1. milk\n');
});

test('a phone insert event edits the list before the editor does', async ({ page }) => {
  await setzeQuelle(page, '- milk');
  await vorher(page, 'insertParagraph');
  await erwarteQuelle(page, '- milk\n- ');

  await setzeQuelle(page, '- milk');
  await vorher(page, 'insertLineBreak');
  await erwarteQuelle(page, '- milk\n  ');

  await setzeQuelle(page, '[] call');
  await vorher(page, 'insertText', '\n');
  await erwarteQuelle(page, '[] call\n[] ');

  await setzeQuelle(page, '- ');
  await vorher(page, 'deleteContentBackward');
  await erwarteQuelle(page, '');

  await setzeQuelle(page, 'hello');
  const verhindert = await page.locator('.schreib .cm-editor').evaluate((el) => {
    const ziel = el.querySelector('.cm-content');
    if (!(ziel instanceof HTMLElement)) throw new Error('missing editor');
    let gehalten = false;
    const horch = (event: Event) => {
      gehalten = event.defaultPrevented;
    };
    ziel.addEventListener('beforeinput', horch, true);
    ziel.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertParagraph',
        data: null,
      }),
    );
    ziel.removeEventListener('beforeinput', horch, true);
    return gehalten;
  });
  expect(verhindert).toBe(false);
  await erwarteQuelle(page, 'hello');
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('control enter still files when the line is not a list', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'handy', 'desktop filing shortcut');
  await setzeQuelle(page, '#Capdesk\nPing');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('status')).toContainText('Added to');
  await erwarteQuelle(page, '');
});
