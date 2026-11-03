import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeAuswahl, setzeQuelle } from './feld.ts';
import { leereLokal } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand } from './schau.ts';

const BILDER = 'tmp-test/screens';

const TEXT = [
  '= Review',
  'See **Anna** and *Bea* and ~~Dan~~.',
  '- milk',
  '[] call',
  '[x] done',
  'Code `**not**` stays.',
  'See [site](https://example.com/a).',
  '#topic stays a tag',
].join('\n');

function versatz(stunde: number, minute: number): string {
  const jetzt = new Date();
  return new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), stunde, minute, 0, 0).toISOString();
}

async function tippe(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Note' }).pressSequentially(text, { delay: 30 });
}

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

test('the format bar and typing shortcuts follow the screen size', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  const handy = testInfo.project.name === 'handy';
  try {
    setzeSchauspiel([{ name: 'Work', notizen: [{ text: TEXT, created: versatz(9, 12) }] }]);
    await page.goto('/library/topic?name=Work');
    const karte = page.locator('.notiz', { hasText: 'Review' });
    await expect(karte.locator('.ti')).toHaveText('Review');
    await expect(karte.locator('h3, strong, em, s, li, code, .haken')).toHaveCount(0);
    await karte.locator('a.tx').click();
    await expect(page.getByRole('heading', { level: 3 })).toHaveText('Review');
    await expect(page.locator('.lesetext strong')).toHaveText('Anna');
    await expect(page.locator('.lesetext em')).toHaveText('Bea');
    await expect(page.locator('.lesetext s')).toHaveText('Dan');
    await expect(page.locator('.lesetext li')).toHaveText('milk');
    await expect(page.locator('.lesetext .hakenlabel')).toHaveText(['call', 'done']);
    await expect(page.locator('.lesetext code')).toHaveText('**not**');
    await expect(page.locator('.lesetext a')).toHaveAttribute('href', 'https://example.com/a');
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(1);
    if (handy) await page.screenshot({ path: `${BILDER}/handy-format-read.png`, fullPage: true });

    await page.getByRole('button', { name: 'Edit' }).click();
    const leiste = page.getByRole('toolbar', { name: 'Format' });
    if (handy) {
      await expect(leiste).toBeVisible();
      await expect(leiste.getByRole('button', { name: 'Bold' })).toBeVisible();
      await expect(leiste.getByRole('button', { name: 'Checklist' })).toBeVisible();
      const kasten = await leiste.boundingBox();
      expect(kasten).not.toBeNull();
      expect(kasten!.y + kasten!.height).toBeGreaterThan(828);
      await page.screenshot({ path: `${BILDER}/handy-format-edit.png`, fullPage: true });
    } else {
      await expect(leiste).toHaveCount(0);
      await setzeAuswahl(page, 0, 4);
      await expect(leiste).toBeVisible();
    }

    await setzeQuelle(page, 'Hello');
    await setzeAuswahl(page, 0, 5);
    await page.keyboard.press('Control+b');
    await erwarteQuelle(page, '**Hello**');

    await setzeQuelle(page, '');
    await tippe(page, 'hello**');
    await erwarteQuelle(page, '**hello**');
    await page.keyboard.press('Control+z');
    await erwarteQuelle(page, 'hello**');

    await setzeQuelle(page, '');
    await tippe(page, '[ ]');
    await erwarteQuelle(page, '[] ');
    await page.keyboard.press('Control+z');
    await erwarteQuelle(page, '[ ]');
  } finally {
    stelleBestand(bestand);
  }
});

test('a typed dash and space becomes a list and backspace restores the characters', async ({ page }) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  try {
    setzeSchauspiel([{ name: 'Work', notizen: [{ text: 'Keep', created: versatz(11, 0) }] }]);
    await page.goto('/library/topic?name=Work');
    await page.locator('.notiz').first().locator('a.tx').click();
    await page.getByRole('button', { name: 'Edit' }).click();
    await setzeQuelle(page, '');
    await tippe(page, '- ');
    await expect(page.locator('.modell-host .cm-punkt')).toHaveCount(1);
    await erwarteQuelle(page, '- ');
    await page.keyboard.press('Backspace');
    await expect(page.locator('.modell-host .cm-punkt')).toHaveCount(0);
    await expect(page.locator('.modell-host .ProseMirror')).toHaveText('- ');
    await erwarteQuelle(page, '- ');
  } finally {
    stelleBestand(bestand);
  }
});

test('a typed bold shortcut becomes bold and backspace restores the characters', async ({ page }) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  try {
    setzeSchauspiel([{ name: 'Work', notizen: [{ text: 'Keep', created: versatz(11, 20) }] }]);
    await page.goto('/library/topic?name=Work');
    await page.locator('.notiz').first().locator('a.tx').click();
    await page.getByRole('button', { name: 'Edit' }).click();
    await setzeQuelle(page, '');
    await tippe(page, '**x**');
    await expect(page.locator('.modell-host .cm-fett')).toHaveText('x');
    await erwarteQuelle(page, '**x**');
    await page.keyboard.press('Backspace');
    await expect(page.locator('.modell-host .cm-fett')).toHaveCount(0);
    await expect(page.locator('.modell-host .ProseMirror')).toHaveText('**x**');
    await erwarteQuelle(page, '\\*\\*x\\*\\*');
  } finally {
    stelleBestand(bestand);
  }
});

test('turning shortcuts off keeps the format buttons', async ({ page }) => {
  test.setTimeout(90_000);
  const bestand = sichereBestand();
  try {
    setzeSchauspiel([{ name: 'Work', notizen: [{ text: 'Plain note', created: versatz(10, 0) }] }]);
    await page.goto('/library');
    await page.getByRole('button', { name: 'Library menu' }).click();
    const schalter = page.getByRole('switch', { name: /Convert shortcuts while typing/ });
    await expect(schalter).toHaveAttribute('aria-checked', 'true');
    await schalter.click();
    await expect(schalter).toHaveAttribute('aria-checked', 'false');

    await page.goto('/library/topic?name=Work');
    await page.locator('.notiz').first().locator('a.tx').click();
    await page.getByRole('button', { name: 'Edit' }).click();
    await setzeQuelle(page, '');
    await tippe(page, 'hello**');
    await erwarteQuelle(page, 'hello**');
    await setzeQuelle(page, 'Hello');
    await setzeAuswahl(page, 0, 5);
    await page.keyboard.press('Control+b');
    await erwarteQuelle(page, '**Hello**');

    await setzeQuelle(page, '');
    await tippe(page, '**x**');
    await expect(page.locator('.modell-host .cm-fett')).toHaveCount(0);
    await expect(page.locator('.modell-host .ProseMirror')).toHaveText('**x**');
    await erwarteQuelle(page, '\\*\\*x\\*\\*');
    await setzeQuelle(page, '');
    await tippe(page, '- ');
    await expect(page.locator('.modell-host .cm-punkt')).toHaveCount(0);
    await expect(page.locator('.modell-host .ProseMirror')).toHaveText('- ');
    await erwarteQuelle(page, '\\- ');
  } finally {
    stelleBestand(bestand);
  }
});
