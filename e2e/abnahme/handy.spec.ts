import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from '../anmelden.ts';
import { warteBereit } from '../lokal.ts';
import {
  FELD,
  type Feld,
  blockText,
  ablegenOderSpeichern,
  editorJson,
  enterDann,
  erwarteBasisbild,
  erwarteStil,
  gboard,
  invarianten,
  knopf,
  leereAuswahl,
  modellText,
  sichtbar,
  tippeAn,
  tippeBeschriftung,
  istListenzeile,
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

test('Feld oeffnet, Haken liefert Klartext', async ({ page }) => {
  await meldeAn(page);
  await page.goto('/');
  await warteBereit(page);
  await expect(page.locator(FELD)).toBeVisible();
  const leer = await modellText(page);
  expect(leer.trim()).toBe('');
  await tippeAn(page, FELD);
  const cdp = await page.context().newCDPSession(page);
  await gboard({ page, cdp }, 'Milch');
  await expect.poll(async () => (await modellText(page)).trim()).toBe('Milch');
  const json = await page.evaluate(() => {
    const haken = (window as Window & { __cortxModell?: { json: () => unknown } }).__cortxModell;
    return haken?.json() ?? null;
  });
  expect(json).toMatchObject({ type: 'doc' });
});

const KNOEPFE = [
  ['Bold', 'fett'],
  ['Italic', 'kursiv'],
  ['Strikethrough', 'strich'],
  ['Code', 'mono'],
  ['Important', 'wichtig'],
  ['Heading', 'kopf'],
] as const;

const KUERZEL = [
  ['**fett** x', 'fett', 'fett'],
  ['*kursiv* x', 'kursiv', 'kursiv'],
  ['~~weg~~ x', 'weg', 'strich'],
  ['`code` x', 'code', 'mono'],
] as const;

async function oeffneFeld(page: Page, feld: 'erfassen' | 'notiz'): Promise<{ f: Feld; id: number | null }> {
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
    await tippeAn(page, 'header button[aria-label="Edit"]');
  }
  await warteBereit(page);
  await expect(page.locator(FELD)).toBeVisible();
  await tippeAn(page, FELD);
  if (feld === 'notiz') {
    await leereAuswahl(page);
    await expect.poll(async () => (await modellText(page)).trim()).toBe('');
  }
  return { f: { page, cdp: await page.context().newCDPSession(page) }, id };
}

function flach(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

async function pruefeAblage(
  page: Page,
  merkmal: string,
  marks: Partial<Record<MarkName, string[]>>,
): Promise<void> {
  const sicht = await blockText(page, FELD);
  const id = await ablegenOderSpeichern(page, 'erfassen', null, merkmal);
  const server = ausServer((await (await page.request.get(`/api/notes/${id}`)).json()) as NotizAntwort);
  serverUnverfaelscht(server, sicht, marks);
}

for (const feld of ['erfassen', 'notiz'] as const) {
  test.describe(`${feld} – Handy-Abnahme`, { tag: '@F1' }, () => {
    let f!: Feld;

    test.beforeEach(async ({ page }) => {
      await meldeAn(page);
      if (feld === 'erfassen') {
        await page.goto('/');
      } else {
        const antwort = await page.request.post('/api/notes', { data: { text: 'Seite' } });
        expect(antwort.ok()).toBe(true);
        const id = ((await antwort.json()) as { id: number }).id;
        await page.goto(`/library/note?id=${id}`);
        await warteBereit(page);
        await tippeAn(page, 'header button[aria-label="Edit"]');
      }
      await warteBereit(page);
      await expect(page.locator(FELD)).toBeVisible();
      await tippeAn(page, FELD);
      if (feld === 'notiz') {
        await leereAuswahl(page);
        await expect.poll(async () => (await modellText(page)).trim()).toBe('');
      }
      f = { page, cdp: await page.context().newCDPSession(page) };
    });

    test.afterEach(async ({ page }, info) => {
      if (info.status === 'skipped') return;
      await invarianten(page);
    });

    test('leeres Feld: Cursor in der Platzhalterzeile', async ({ page }) => {
      const platz = page.locator('.cm-placeholder, [data-placeholder]').first();
      const p = await platz.boundingBox({ timeout: 1_000 }).catch(() => null);
      expect(p, 'Platzhalterzeile').not.toBeNull();
      const hoehe = await page.locator(`${FELD} > *`).first().evaluate((el) => el.getBoundingClientRect().height);
      expect(hoehe).toBeLessThanOrEqual((p?.height ?? 0) * 1.6);
      await gboard(f, 'Hallo');
      const text = await page.locator(FELD).getByText('Hallo').boundingBox();
      expect(text).not.toBeNull();
      expect(Math.abs((text?.y ?? 0) - (p?.y ?? 0))).toBeLessThan(4);
    });

    test('Bildvergleich nach dem Tippen', async ({ page }, info) => {
      await gboard(f, 'Hallo');
      await erwarteBasisbild(page, `${feld}-leer-getippt.png`, info);
    });

    for (const [knopfName, art] of KNOEPFE) {
      test(`${knopfName}: ohne Markierung an, tippen, aus, weitertippen`, async ({ page }) => {
        await gboard(f, 'eins ');
        await knopf(page, knopfName);
        await gboard(f, 'zwei');
        await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toBe('eins zwei');
        await knopf(page, knopfName);
        await gboard(f, ' drei');
        await erwarteStil(page, 'zwei', art, true);
        await erwarteStil(page, 'drei', art, false);
      });

      test(`${knopfName}: auf Markierung, mehrzeilig, erneut aus`, async ({ page }) => {
        await gboard(f, 'aa\nbb\ncc dd');
        await waehleSichtbar(page, 0, 99);
        await knopf(page, knopfName);
        for (const wort of ['aa', 'bb', 'cc dd']) await erwarteStil(page, wort, art, true);
        await knopf(page, knopfName);
        for (const wort of ['aa', 'bb', 'cc dd']) await erwarteStil(page, wort, art, false);
      });
    }

    for (const [eingabe, wort, art] of KUERZEL) {
      test(`Kuerzel per Gboard: ${eingabe}`, async ({ page }) => {
        await gboard(f, eingabe);
        await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toBe(eingabe.replace(/[*~`]/g, ''));
        await erwarteStil(page, wort, art, true);
        await erwarteStil(page, 'x', art, false);
      });
    }

    test('Weitertippen nach Format verfaelscht nichts', async ({ page }) => {
      await gboard(f, 'eins ');
      await knopf(page, 'Bold');
      await gboard(f, 'zwei');
      await knopf(page, 'Bold');
      await gboard(f, ' drei vier');
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toBe('eins zwei drei vier');
    });

    test('Pfeiltasten: jeder Druck ein sichtbares Zeichen', async ({ page }) => {
      await gboard(f, '**fett** x');
      for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowLeft');
      await gboard(f, 'Y');
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toBe('feYtt x');
    });

    test('Ruecktaste loescht den Buchstaben und laesst das Format (K6)', async ({ page }) => {
      await gboard(f, '**fett**');
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await expect.poll(async () => flach(await sichtbar(page)), { timeout: 3_000 }).toBe('fe');
      expect(flach(await modellText(page))).toBe('fe');
      await erwarteStil(page, 'fe', 'fett', true);
    });

    test('Mehrzeilig loeschen hinterlaesst keine Zeichen (K5)', async ({ page }) => {
      await gboard(f, 'aaa **bbb**\n~~ccc~~ ddd\neee fff');
      await waehleSichtbarenText(page, 'bbb', 'eee ');
      await page.keyboard.press('Backspace');
      await expect.poll(async () => flach(await sichtbar(page)), { timeout: 3_000 }).toBe('aaa fff');
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).not.toMatch(/\*/);
      if (feld === 'erfassen') await pruefeAblage(page, 'fff', { fett: [], kursiv: [], strich: [], code: [] });
    });

    test('Enter-Enter verlaesst die Liste (H7)', async ({ page }) => {
      await gboard(f, '- eins');
      await page.keyboard.press('Enter');
      await gboard(f, 'zwei');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await gboard(f, 'raus');
      expect(await modellText(page)).not.toMatch(/\n- raus\s*$/);
      expect(await istListenzeile(page, 'eins')).toBe(true);
      expect(await istListenzeile(page, 'zwei')).toBe(true);
      expect(await istListenzeile(page, 'raus')).toBe(false);
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toContain('raus');
    });

    test('Nummernliste laeuft weiter (H8)', async ({ page }) => {
      await gboard(f, '1. eins');
      await page.keyboard.press('Enter');
      await gboard(f, 'zwei');
      expect(await modellText(page)).not.toMatch(/^1\.\s/m);
      expect(await istListenzeile(page, 'eins')).toBe(true);
      expect(await istListenzeile(page, 'zwei')).toBe(true);
    });

    test('Sternchen am Listenanfang bleiben vollstaendig (K4)', async ({ page }) => {
      await gboard(f, '- Milch');
      await page.keyboard.press('Enter');
      await gboard(f, '**Brot**');
      await expect.poll(async () => flach(await sichtbar(page)), { timeout: 3_000 }).toBe('Milch Brot');
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).not.toMatch(/\*/);
      await erwarteStil(page, 'Brot', 'fett', true);
      if (feld === 'erfassen') await pruefeAblage(page, 'Brot', { fett: ['Brot'], kursiv: [], strich: [], code: [] });
    });

    if (feld === 'erfassen') {
      test('Doppelte Leerstelle in fortgesetzter Liste und Kasten (K8)', async ({ page }) => {
        await gboard(f, '- eins');
        await page.keyboard.press('Enter');
        await gboard(f, 'zwei');
        await page.keyboard.press('Enter');
        await gboard(f, '[ ] milch');
        const sicht = await blockText(page, FELD);
        const id = await ablegenOderSpeichern(page, 'erfassen', null, 'milch');
        const server = ausServer((await (await page.request.get(`/api/notes/${id}`)).json()) as NotizAntwort);
        keineDoppelteLeerstelle(server.roh);
        serverUnverfaelscht(server, sicht, { fett: [], kursiv: [], strich: [], code: [] });
      });
    }

    test('Taste direkt nach Enter bleibt (K7)', async ({ page }) => {
      await gboard(f, '- eins');
      await enterDann(f, 'zw');
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toMatch(/eins[^\n]*\n[^\n]*zw/);
    });

    test('Kopieren gibt keine Formatzeichen weiter (H9)', async ({ page }) => {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await gboard(f, 'a **fett** b');
      await waehleSichtbar(page, 0, 99);
      await page.keyboard.press('Control+c');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('a fett b');
    });

    test('Einfuegen formatiert Markdown (H10)', async ({ page }) => {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.evaluate(async () => {
        await navigator.clipboard.writeText('**Brot** und\n- Milch');
      });
      await tippeAn(page, FELD);
      await page.keyboard.press('Control+v');
      await expect.poll(() => sichtbar(page), { timeout: 3_000 }).not.toMatch(/\*/);
      await erwarteStil(page, 'Brot', 'fett', true);
      expect(await istListenzeile(page, 'Milch')).toBe(true);
    });

    test('Rueckgaengig nimmt Format und Wort einzeln zurueck (M2)', async ({ page }) => {
      await gboard(f, 'eins zwei drei');
      await waehleSichtbar(page, 0, 99);
      await knopf(page, 'Bold');
      await page.keyboard.press('Control+z');
      await expect.poll(async () => flach(await sichtbar(page)), { timeout: 3_000 }).toBe('eins zwei drei');
      await erwarteStil(page, 'drei', 'fett', false);
      await page.keyboard.press('Control+z');
      expect(flach(await modellText(page))).toBe('eins zwei');
    });
  });

  test.describe(`${feld} – Ablegen`, { tag: '@F2' }, () => {
    let f!: Feld;
    let notizId: number | null = null;

    test.beforeEach(async ({ page }) => {
      const offen = await oeffneFeld(page, feld);
      f = offen.f;
      notizId = offen.id;
    });

    test('Speichern und Wiederoeffnen: Server-JSON gleich Editor-JSON', async ({ page }) => {
      await gboard(f, 'Einkauf\n');
      await knopf(page, 'Bulleted list');
      await gboard(f, 'Milch\n\n**wichtig** und ~~alt~~');
      const editorDoc = await editorJson(page);
      const id = await ablegenOderSpeichern(page, feld, notizId, 'Einkauf');
      const server = (await (await page.request.get(`/api/notes/${id}`)).json()) as { doc?: unknown };
      expect(server.doc).toEqual(editorDoc);
      await page.goto(`/library/note?id=${id}`);
      await warteBereit(page);
      await tippeAn(page, 'header button[aria-label="Edit"]');
      await warteBereit(page);
      await expect(page.locator(FELD)).toBeVisible();
      expect(await editorJson(page)).toEqual(editorDoc);
    });

    test('Offline ablegen, online gleich Server-JSON', async ({ page, context }) => {
      await context.setOffline(true);
      await gboard(f, 'Milch');
      const editorDoc = await editorJson(page);
      if (feld === 'erfassen') {
        await tippeBeschriftung(page, 'File');
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
}
