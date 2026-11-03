import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, liesQuelle, setzeAuswahl, setzeQuelle } from './feld.ts';
import { leereLokal } from './lokal.ts';

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

async function markiere(page: Page, start: number, ende?: number): Promise<void> {
  const text = await liesQuelle(page);
  await setzeAuswahl(page, start, ende ?? text.length);
}

async function klick(page: Page, name: string): Promise<void> {
  const leiste = page.getByRole('toolbar', { name: 'Format' });
  await expect(leiste).toBeVisible();
  await leiste.getByRole('button', { name }).click();
}

test('a format on several selected lines applies to each line', async ({ page }) => {
  test.setTimeout(60_000);
  await setzeQuelle(page, 'one\ntwo');
  await markiere(page, 0, 3);
  await klick(page, 'Bold');
  await erwarteQuelle(page, '**one**\ntwo');

  await setzeQuelle(page, 'one\ntwo');
  await markiere(page, 0);
  await klick(page, 'Bold');
  await erwarteQuelle(page, '**one**\n**two**');
  await markiere(page, 0);
  await klick(page, 'Bold');
  await erwarteQuelle(page, 'one\ntwo');

  await markiere(page, 0);
  await klick(page, 'Bulleted list');
  await erwarteQuelle(page, '- one\n- two');
  await markiere(page, 0);
  await klick(page, 'Bulleted list');
  await erwarteQuelle(page, 'one\ntwo');

  await markiere(page, 0);
  await klick(page, 'Important');
  await erwarteQuelle(page, '!!!! one\n!!!! two');
  await markiere(page, 0);
  await klick(page, 'Important');
  await erwarteQuelle(page, 'one\ntwo');
});
