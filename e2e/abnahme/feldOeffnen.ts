import { expect, type Page } from '@playwright/test';
import { meldeAn } from '../anmelden.ts';
import { warteBereit } from '../lokal.ts';
import { FELD, klickeAn, leereAuswahl, modellText } from './hilfen.ts';
export async function oeffneFeld(page: Page, feld: 'erfassen' | 'notiz'): Promise<number | null> {
  await meldeAn(page);
  let id: number | null = null;
  if (feld === 'erfassen') {
    await page.goto('/');
  } else {
    const antwort = await page.request.post('/api/notes', { data: { text: 'Seite' } });
    expect(antwort.ok()).toBe(true);
    id = ((await antwort.json()) as { id: number }).id;
    await page.goto(`/library/note?id=${id}`);
    await warteBereit(page);
    await klickeAn(page, 'header button[aria-label="Edit"]');
  }
  await warteBereit(page);
  await expect(page.locator(FELD)).toBeVisible();
  await klickeAn(page, FELD);
  if (feld === 'notiz') {
    await leereAuswahl(page);
    await expect.poll(async () => (await modellText(page)).trim()).toBe('');
  }
  return id;
}
