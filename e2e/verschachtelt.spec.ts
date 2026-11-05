import { expect, test } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeAuswahl, setzeCursor, setzeQuelle } from './feld.ts';
import { leereLokal } from './lokal.ts';

const KNOEPFE = ['Bold', 'Italic', 'Strikethrough', 'Important', 'Code'] as const;

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

test('nested formats toggle from the bar on a phone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'handy', 'phone width');
  test.setTimeout(60_000);
  const leiste = page.getByRole('toolbar', { name: 'Format' });
  const knopf = (name: string) => leiste.getByRole('button', { name });

  await setzeQuelle(page, '**Hi**');
  await setzeCursor(page, 3);
  await expect(knopf('Bold')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.schreib .cm-fett', { hasText: 'Hi' })).toBeVisible();
  await expect(page.locator('.schreib .cm-marker-weg')).toHaveCount(2);

  await setzeQuelle(page, 'Hi');
  await setzeAuswahl(page, 0, 2);
  for (const name of KNOEPFE) {
    await knopf(name).click();
    await expect(knopf(name)).toHaveAttribute('aria-pressed', 'true');
  }
  await erwarteQuelle(page, '***~~!!`Hi`!!~~***');
  await expect(
    page.locator('.schreib .cm-fett.cm-kursiv.cm-strich.cm-wichtig.cm-code', { hasText: 'Hi' }),
  ).toBeVisible();

  await knopf('Italic').click();
  await expect(knopf('Italic')).toHaveAttribute('aria-pressed', 'false');
  await expect(knopf('Bold')).toHaveAttribute('aria-pressed', 'true');
  await expect(knopf('Code')).toHaveAttribute('aria-pressed', 'true');
  await knopf('Code').click();
  await knopf('Bold').click();
  await knopf('Strikethrough').click();
  await knopf('Important').click();
  await erwarteQuelle(page, 'Hi');
  for (const name of KNOEPFE) await expect(knopf(name)).toHaveAttribute('aria-pressed', 'false');

  await setzeQuelle(page, '');
  for (const name of KNOEPFE) {
    await knopf(name).click();
    await expect(knopf(name)).toHaveAttribute('aria-pressed', 'true');
  }
  await erwarteQuelle(page, '***~~!!``!!~~***');
  await expect(page.locator('.schreib .cm-marker-weg')).toHaveCount(0);

  await knopf('Bold').click();
  await expect(knopf('Bold')).toHaveAttribute('aria-pressed', 'false');
  await expect(knopf('Italic')).toHaveAttribute('aria-pressed', 'true');
  await expect(knopf('Strikethrough')).toHaveAttribute('aria-pressed', 'true');
  await knopf('Italic').click();
  await knopf('Important').click();
  await knopf('Code').click();
  await knopf('Strikethrough').click();
  await erwarteQuelle(page, '');
  for (const name of KNOEPFE) await expect(knopf(name)).toHaveAttribute('aria-pressed', 'false');
});
