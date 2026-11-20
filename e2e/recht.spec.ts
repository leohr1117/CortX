import { expect, test, type Page } from './ruhe.ts';
import { RECHT } from '../shared/kern/recht.ts';
import { TEXTE } from '../shared/kern/texte.ts';
import { meldeAn } from './anmelden.ts';

const BILDER = 'tmp-test/screens';

async function ohneSeitlichenUeberlauf(page: Page): Promise<void> {
  const passt = await page.evaluate(() => {
    const seite = document.querySelector('.recht');
    const breit = document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
    const text = seite === null || seite.scrollWidth <= seite.clientWidth + 1;
    return breit && text;
  });
  expect(passt).toBe(true);
}

test('sign-in links to the legal pages, which name the host', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.marke')).toHaveText('Styra');
  const impressum = page.getByRole('link', { name: TEXTE.impressum });
  const datenschutz = page.getByRole('link', { name: TEXTE.datenschutz });
  await expect(impressum).toHaveAttribute('href', RECHT.impressum.pfad);
  await expect(datenschutz).toHaveAttribute('href', RECHT.datenschutz.pfad);
  await expect(page.getByRole('link', { name: TEXTE.absender })).toHaveAttribute('href', TEXTE.absenderUrl);
  const impressumKasten = await impressum.boundingBox();
  const datenschutzKasten = await datenschutz.boundingBox();
  expect(impressumKasten?.height ?? 0).toBeGreaterThanOrEqual(48);
  expect(datenschutzKasten?.height ?? 0).toBeGreaterThanOrEqual(48);

  await impressum.click();
  await expect(page).toHaveURL(/\/impressum$/);
  await expect(page.getByRole('heading', { name: TEXTE.impressum, level: 1 })).toBeVisible();
  await expect(page.locator('.login')).toHaveCount(0);
  await expect(page.locator('[data-recht="impressum"]')).toContainText('Hetzner Online GmbH');
  await expect(page.locator('[data-recht="impressum"]')).toContainText('CAX11');
  await expect(page.locator('[data-recht="impressum"]')).toContainText('Falkenstein, Germany');
  await expect(page.getByRole('link', { name: 'https://getstyra.app' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back' })).toBeVisible();
  await ohneSeitlichenUeberlauf(page);
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-impressum.png` });

  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.locator('.marke')).toHaveText('Styra');

  await page.goto(RECHT.datenschutz.pfad);
  await expect(page.getByRole('heading', { name: TEXTE.datenschutz, level: 1 })).toBeVisible();
  await expect(page.locator('.login')).toHaveCount(0);
  const notice = page.locator('[data-recht="datenschutz"]');
  await expect(notice).toContainText('Cloudflare Tunnel');
  await expect(notice).toContainText('127.0.0.1');
  await expect(notice).toContainText('03:25');
  await expect(notice).toContainText('29 days');
  await expect(notice).toContainText('four weeks');
  await expect(notice).toContainText('no time limit');
  await expect(page.getByRole('link', { name: 'privacy policy' })).toHaveAttribute('href', 'https://www.cloudflare.com/privacypolicy/');
  await ohneSeitlichenUeberlauf(page);
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-datenschutz.png` });
});

test('the library menu links to the legal pages and back returns to the library', async ({ page }) => {
  await meldeAn(page);
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: TEXTE.menueBibliothek }).click();
  const neu = page.getByRole('menuitem', { name: TEXTE.neuigkeiten });
  const impressum = page.getByRole('menuitem', { name: TEXTE.impressum });
  const datenschutz = page.getByRole('menuitem', { name: TEXTE.datenschutz });
  const absender = page.getByRole('menuitem', { name: TEXTE.absender });
  await expect(impressum).toHaveAttribute('href', RECHT.impressum.pfad);
  await expect(datenschutz).toHaveAttribute('href', RECHT.datenschutz.pfad);
  await expect(absender).toHaveAttribute('href', TEXTE.absenderUrl);
  const kaesten = await Promise.all([neu, impressum, datenschutz, absender].map(async (zeile) => zeile.boundingBox()));
  const [neuKasten, impressumKasten, datenschutzKasten, absenderKasten] = kaesten;
  if (!neuKasten || !impressumKasten || !datenschutzKasten || !absenderKasten) throw new Error('menu box missing');
  expect(impressumKasten.y).toBeGreaterThanOrEqual(neuKasten.y + neuKasten.height - 1);
  expect(datenschutzKasten.y).toBeGreaterThanOrEqual(impressumKasten.y + impressumKasten.height - 1);
  expect(absenderKasten.y).toBeGreaterThanOrEqual(datenschutzKasten.y + datenschutzKasten.height - 1);
  expect(impressumKasten.height).toBeGreaterThanOrEqual(48);
  expect(datenschutzKasten.height).toBeGreaterThanOrEqual(48);

  await impressum.click();
  await expect(page).toHaveURL(/\/impressum$/);
  await page.getByRole('link', { name: TEXTE.zurueckBibliothek }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
});
