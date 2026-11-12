import { expect, test, type Page } from './ruhe.ts';
import { oeffneFeld } from './abnahme/feldOeffnen.ts';
import { FELD, erwarteStil, istListenzeile, klickeAn, sichtbar } from './abnahme/hilfen.ts';

const MARKDOWN = '# Ueberschrift\n- Liste\n**fett** and `code` and #tag';

async function fuegeEin(page: Page, text: string): Promise<void> {
  await klickeAn(page, FELD);
  await page.locator(FELD).evaluate((el, wert: string) => {
    const data = new DataTransfer();
    data.setData('text/plain', wert);
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    el.dispatchEvent(event);
  }, text);
}

test('pasting Markdown into the start note formats it in the editor', async ({ page }) => {
  await oeffneFeld(page, 'erfassen');
  await fuegeEin(page, MARKDOWN);

  await expect.poll(() => sichtbar(page), { timeout: 3_000 }).not.toMatch(/\*\*|##/);
  await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toMatch(/Ueberschrift/);
  await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toMatch(/Liste/);
  await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toMatch(/fett/);
  await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toMatch(/code/);
  await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toMatch(/tag/);

  await expect(page.locator(`${FELD} h2`)).toHaveText('Ueberschrift');
  expect(await istListenzeile(page, 'Liste')).toBe(true);
  await erwarteStil(page, 'fett', 'fett', true);
  await expect(page.locator(`${FELD} .cm-code`)).toContainText('code');

  await expect(page).toHaveURL(/\/(?:\?.*)?$/);
  await expect(page.locator(FELD)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
});
