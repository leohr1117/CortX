import { type Page } from '@playwright/test';
import { expect, test } from '../saat-fix.ts';
import { meldeAn } from '../anmelden.ts';
import { warteBereit } from '../lokal.ts';
import {
  FELD,
  type Feld,
  erwarteStil,
  gboard,
  invarianten,
  klickeAn,
  knopf,
  knopfKlick,
  leereAuswahl,
  modellText,
  sichtbar,
  tippeAn,
  tippeTasten,
  waehleSichtbarenText,
} from './hilfen.ts';

function istHandy(name: string): boolean {
  return name.includes('handy');
}

function flach(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

async function tippe(page: Page, feld: Feld | null, text: string, handy: boolean): Promise<void> {
  if (handy) {
    if (!feld) throw new Error('kein Feld');
    await gboard(feld, text);
    return;
  }
  await tippeTasten(page, text);
}

for (const feldName of ['erfassen', 'notiz'] as const) {
  test.describe(`${feldName} – Auszeichnung`, { tag: '@F1' }, () => {
    let f: Feld | null = null;

    test.beforeEach(async ({ page }, info) => {
      const handy = istHandy(info.project.name);
      await meldeAn(page);
      if (feldName === 'erfassen') {
        await page.goto('/');
      } else {
        const antwort = await page.request.post('/api/notes', { data: { text: 'Seite' } });
        expect(antwort.ok()).toBe(true);
        const id = ((await antwort.json()) as { id: number }).id;
        await page.goto(`/library/note?id=${id}`);
        await warteBereit(page);
        const stift = 'header button[aria-label="Edit"]';
        if (handy) await tippeAn(page, stift);
        else await klickeAn(page, stift);
      }
      await warteBereit(page);
      await expect(page.locator(FELD)).toBeVisible();
      if (handy) await tippeAn(page, FELD);
      else await klickeAn(page, FELD);
      if (feldName === 'notiz') {
        await leereAuswahl(page);
        await expect.poll(async () => (await modellText(page)).trim()).toBe('');
      }
      f = handy ? { page, cdp: await page.context().newCDPSession(page) } : null;
    });

    test.afterEach(async ({ page }, info) => {
      if (info.status === 'skipped') return;
      await invarianten(page);
    });

    test('Teilzeilen ueber mehrere Zeilen (H6)', async ({ page }, info) => {
      const handy = istHandy(info.project.name);
      await tippe(page, f, 'aaa **bbb**\n~~ccc~~ ddd\neee fff', handy);
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toContain('bbb');
      await waehleSichtbarenText(page, 'bbb', 'eee');
      if (handy) await knopf(page, 'Bold');
      else await knopfKlick(page, 'Bold');
      await expect.poll(async () => flach(await sichtbar(page)), { timeout: 3_000 }).toBe('aaa bbb ccc ddd eee fff');
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).not.toMatch(/\*/);
      await erwarteStil(page, 'eee', 'fett', true);
      await erwarteStil(page, 'fff', 'fett', false);
      await erwarteStil(page, 'aaa', 'fett', false);
    });

    test('Kuerzel == wird wichtig (H11)', async ({ page }, info) => {
      const handy = istHandy(info.project.name);
      await tippe(page, f, '==wichtig==', handy);
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toBe('wichtig');
      await erwarteStil(page, 'wichtig', 'wichtig', true);
    });

    test('Kuerzel # mit Leerstelle wird Ueberschrift (H11)', async ({ page }, info) => {
      const handy = istHandy(info.project.name);
      await tippe(page, f, '# Titel', handy);
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toBe('Titel');
      await erwarteStil(page, 'Titel', 'kopf', true);
    });
  });
}
