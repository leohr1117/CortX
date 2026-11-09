import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from '../anmelden.ts';
import { warteBereit } from '../lokal.ts';
import {
  FELD,
  ablegenPerKlick,
  blockText,
  editorJson,
  enterDannTasten,
  erwarteStil,
  invarianten,
  istListenzeile,
  klickeAn,
  klickeBeschriftung,
  knopfKlick,
  modellText,
  sichtbar,
  tippeTasten,
  waehleSichtbar,
  waehleSichtbarenText,
} from './hilfen.ts';
import {
  ausServer,
  keineDoppelteLeerstelle,
  serverUnverfaelscht,
  type MarkName,
  type NotizAntwort,
} from './speicher.ts';
import { oeffneFeld } from './feldOeffnen.ts';
test.beforeEach(({ }, testInfo) => {
  testInfo.skip(testInfo.project.name !== 'abnahme-desktop', 'nur bei 1440 px');
});
const HANDY = { width: 390, height: 844 };
const TREFFER_MIN = 48;
interface Kasten {
  x: number;
  y: number;
  width: number;
  height: number;
}
function schneidet(a: Kasten, b: Kasten): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
function auswahlKasten(page: Page): Promise<Kasten | null> {
  return page.evaluate(() => {
    const auswahl = getSelection();
    if (!auswahl || auswahl.rangeCount < 1) return null;
    const rect = auswahl.getRangeAt(0).getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}
const KUERZEL = [
  ['**fett** x', 'fett', 'fett'],
  ['*kursiv* x', 'kursiv', 'kursiv'],
  ['~~weg~~ x', 'weg', 'strich'],
  ['`code` x', 'code', 'mono'],
] as const;
function flach(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}
async function pruefeAblage(
  page: Page,
  merkmal: string,
  marks: Partial<Record<MarkName, string[]>>,
): Promise<void> {
  const sicht = await blockText(page, FELD);
  const id = await ablegenPerKlick(page, 'erfassen', null, merkmal);
  const server = ausServer((await (await page.request.get(`/api/notes/${id}`)).json()) as NotizAntwort);
  serverUnverfaelscht(server, sicht, marks);
}
test('Feld oeffnet, Haken liefert Klartext', async ({ page }) => {
  await meldeAn(page);
  await page.goto('/');
  await warteBereit(page);
  await expect(page.locator(FELD)).toBeVisible();
  const leer = await modellText(page);
  expect(leer.trim()).toBe('');
  await klickeAn(page, FELD);
  await tippeTasten(page, 'Milch');
  await expect.poll(async () => (await modellText(page)).trim()).toBe('Milch');
  expect(await editorJson(page)).toMatchObject({ type: 'doc' });
});
for (const feld of ['erfassen', 'notiz'] as const) {
  test.describe(`${feld} – Desktop`, { tag: '@F1' }, () => {
    test.beforeEach(async ({ page }) => {
      await oeffneFeld(page, feld);
    });
    test.afterEach(async ({ page }, info) => {
      if (info.status === 'skipped') return;
      await invarianten(page);
    });
    for (const [eingabe, wort, art] of KUERZEL) {
      test(`Kuerzel per Tasten: ${eingabe}`, async ({ page }) => {
        await tippeTasten(page, eingabe);
        await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toBe(eingabe.replace(/[*~`]/g, ''));
        await erwarteStil(page, wort, art, true);
        await erwarteStil(page, 'x', art, false);
      });
    }
    test('Weitertippen nach Format verfaelscht nichts', async ({ page }) => {
      await tippeTasten(page, 'eins ');
      await page.keyboard.press('Control+b');
      await tippeTasten(page, 'zwei');
      await page.keyboard.press('Control+b');
      await tippeTasten(page, ' drei vier');
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toBe('eins zwei drei vier');
      await erwarteStil(page, 'zwei', 'fett', true);
    });
    test('Pfeiltasten: jeder Druck ein sichtbares Zeichen', async ({ page }) => {
      await tippeTasten(page, '**fett** x');
      for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowLeft');
      await tippeTasten(page, 'Y');
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toBe('feYtt x');
    });
    test('Ruecktaste loescht den Buchstaben und laesst das Format (K6)', async ({ page }) => {
      await tippeTasten(page, '**fett**');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await expect.poll(async () => flach(await sichtbar(page)), { timeout: 3_000 }).toBe('fe');
      expect(flach(await modellText(page))).toBe('fe');
      await erwarteStil(page, 'fe', 'fett', true);
    });
    test('Mehrzeilig loeschen hinterlaesst keine Zeichen (K5)', async ({ page }) => {
      await tippeTasten(page, 'aaa **bbb**\n~~ccc~~ ddd\neee fff');
      await waehleSichtbarenText(page, 'bbb', 'eee ');
      await page.keyboard.press('Backspace');
      await expect.poll(async () => flach(await sichtbar(page)), { timeout: 3_000 }).toBe('aaa fff');
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).not.toMatch(/\*/);
      if (feld === 'erfassen') await pruefeAblage(page, 'fff', { fett: [], kursiv: [], strich: [], code: [] });
    });
    test('Enter-Enter verlaesst die Liste (H7)', async ({ page }) => {
      await tippeTasten(page, '- eins');
      await page.keyboard.press('Enter');
      await tippeTasten(page, 'zwei');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await tippeTasten(page, 'raus');
      expect(await modellText(page)).not.toMatch(/\n- raus\s*$/);
      expect(await istListenzeile(page, 'eins')).toBe(true);
      expect(await istListenzeile(page, 'zwei')).toBe(true);
      expect(await istListenzeile(page, 'raus')).toBe(false);
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toContain('raus');
    });
    test('Nummernliste laeuft weiter (H8)', async ({ page }) => {
      await tippeTasten(page, '1. eins');
      await page.keyboard.press('Enter');
      await tippeTasten(page, 'zwei');
      expect(await modellText(page)).not.toMatch(/^1\.\s/m);
      expect(await istListenzeile(page, 'eins')).toBe(true);
      expect(await istListenzeile(page, 'zwei')).toBe(true);
    });
    test('Sternchen am Listenanfang bleiben vollstaendig (K4)', async ({ page }) => {
      await tippeTasten(page, '- Milch');
      await page.keyboard.press('Enter');
      await tippeTasten(page, '**Brot**');
      await expect.poll(async () => flach(await sichtbar(page)), { timeout: 3_000 }).toBe('Milch Brot');
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).not.toMatch(/\*/);
      await erwarteStil(page, 'Brot', 'fett', true);
      if (feld === 'erfassen') await pruefeAblage(page, 'Brot', { fett: ['Brot'], kursiv: [], strich: [], code: [] });
    });
    if (feld === 'erfassen') {
      test('Doppelte Leerstelle in fortgesetzter Liste und Kasten (K8)', async ({ page }) => {
        await tippeTasten(page, '- eins');
        await page.keyboard.press('Enter');
        await tippeTasten(page, 'zwei');
        await page.keyboard.press('Enter');
        await tippeTasten(page, '[ ] milch');
        const sicht = await blockText(page, FELD);
        const id = await ablegenPerKlick(page, 'erfassen', null, 'milch');
        const server = ausServer((await (await page.request.get(`/api/notes/${id}`)).json()) as NotizAntwort);
        keineDoppelteLeerstelle(server.roh);
        serverUnverfaelscht(server, sicht, { fett: [], kursiv: [], strich: [], code: [] });
      });
    }
    test('Taste direkt nach Enter bleibt (K7)', async ({ page }) => {
      await tippeTasten(page, '- eins');
      await enterDannTasten(page, 'zw');
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toMatch(/eins[^\n]*\n[^\n]*zw/);
    });
    test('Kopieren gibt keine Formatzeichen weiter (H9)', async ({ page }) => {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await tippeTasten(page, 'a **fett** b');
      await waehleSichtbar(page, 0, 99);
      await page.keyboard.press('Control+c');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('a fett b');
    });
    test('Einfuegen formatiert Markdown (H10)', async ({ page }) => {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.evaluate(async () => {
        await navigator.clipboard.writeText('**Brot** und\n- Milch');
      });
      await klickeAn(page, FELD);
      await page.keyboard.press('Control+v');
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).not.toMatch(/\*/);
      await erwarteStil(page, 'Brot', 'fett', true);
      expect(await istListenzeile(page, 'Milch')).toBe(true);
    });
    test('Rueckgaengig nimmt Format und Wort einzeln zurueck (M2)', async ({ page }) => {
      await tippeTasten(page, 'eins zwei drei');
      await waehleSichtbar(page, 0, 99);
      await knopfKlick(page, 'Bold');
      await page.keyboard.press('Control+z');
      await expect.poll(async () => flach(await sichtbar(page)), { timeout: 3_000 }).toBe('eins zwei drei');
      await erwarteStil(page, 'drei', 'fett', false);
      await page.keyboard.press('Control+z');
      expect(flach(await modellText(page))).toBe('eins zwei');
    });
  });
  test.describe(`${feld} – Ablegen`, { tag: '@F2' }, () => {
    let notizId: number | null = null;
    test.beforeEach(async ({ page }) => {
      notizId = await oeffneFeld(page, feld);
    });
    test('Speichern und Wiederoeffnen: Server-JSON gleich Editor-JSON', async ({ page }) => {
      await tippeTasten(page, 'Einkauf\n');
      await knopfKlick(page, 'Bulleted list');
      await tippeTasten(page, 'Milch\n\n**wichtig** und ~~alt~~');
      const editorDoc = await editorJson(page);
      const id = await ablegenPerKlick(page, feld, notizId, 'Einkauf');
      const server = (await (await page.request.get(`/api/notes/${id}`)).json()) as { doc?: unknown };
      expect(server.doc).toEqual(editorDoc);
      await page.goto(`/library/note?id=${id}`);
      await warteBereit(page);
      await klickeAn(page, 'header button[aria-label="Edit"]');
      await warteBereit(page);
      await expect(page.locator(FELD)).toBeVisible();
      expect(await editorJson(page)).toEqual(editorDoc);
    });
    test('Offline ablegen, online gleich Server-JSON', async ({ page, context }) => {
      await context.setOffline(true);
      await tippeTasten(page, 'Milch');
      const editorDoc = await editorJson(page);
      if (feld === 'erfassen') {
        await klickeBeschriftung(page, 'File');
        await expect(page.getByRole('status')).toHaveText('Filed offline · syncs later');
      }
      const warten = page.waitForResponse((r) => {
        if (!r.ok() || r.request().method() !== 'POST') return false;
        const pfad = new URL(r.url()).pathname;
        const passend = feld === 'erfassen' ? pfad === '/api/notes' : pfad === `/api/notes/${notizId}`;
        if (!passend) return false;
        return (r.request().postData() ?? '').includes('Milch');
      });
      await context.setOffline(false);
      const antwort = await warten;
      const koerper = (await antwort.json()) as { id?: number };
      const id = koerper.id ?? notizId;
      const server = (await (await page.request.get(`/api/notes/${id}`)).json()) as { doc?: unknown };
      expect(server.doc).toEqual(editorDoc);
    });
  });
  test.describe(`${feld} – Leiste`, { tag: '@F4' }, () => {
    test('Leiste nicht ueber Auswahl oder Titel, Treffer mindestens 48 px', async ({ page }) => {
      await oeffneFeld(page, feld);
      await tippeTasten(page, 'Einkauf\nMilch');
      await waehleSichtbarenText(page, 'Milch', 'Milch');
      const fehler: string[] = [];
      const leiste = page.getByRole('toolbar', { name: 'Format' });
      const leisteKasten = await leiste.boundingBox();
      const auswahl = await auswahlKasten(page);
      if (!leisteKasten) fehler.push('Leiste nicht sichtbar');
      else if (!auswahl) fehler.push('Auswahl nicht sichtbar');
      else if (schneidet(leisteKasten, auswahl)) fehler.push('Leiste ueber der Auswahl');
      const titel = page.locator('header.kopf h1');
      const titelZahl = await titel.count();
      if (feld === 'notiz' && titelZahl === 0) fehler.push('Titel fehlt');
      const titelKasten = titelZahl > 0 ? await titel.first().boundingBox() : null;
      if (leisteKasten && titelKasten && schneidet(leisteKasten, titelKasten)) fehler.push('Leiste ueber dem Titel');
      await page.setViewportSize(HANDY);
      await expect(page.locator('.format-leiste.mobil')).toBeVisible();
      const knoepfe = await page.locator('.format-leiste.mobil .schalt').evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { name: el.getAttribute('aria-label') ?? '', w: r.width, h: r.height };
        }),
      );
      if (knoepfe.length === 0) fehler.push('keine Trefferflaeche');
      for (const knopf of knoepfe) {
        if (knopf.w < TREFFER_MIN || knopf.h < TREFFER_MIN) {
          fehler.push(`${knopf.name} ${Math.round(knopf.w)}x${Math.round(knopf.h)}`);
        }
      }
      expect(fehler).toEqual([]);
      await invarianten(page);
    });
  });
}
