import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { packeDokument } from '../../shared/features/format/dokument.ts';
import { modell } from '../../shared/features/format/modell.ts';
import { meldeAn } from '../anmelden.ts';
import { warteBereit } from '../lokal.ts';
import {
  FELD,
  ablegenOderSpeichern,
  editorJson,
  gboard,
  klickeAn,
  klickeBeschriftung,
  tippeAn,
  tippeBeschriftung,
  tippeTasten,
} from './hilfen.ts';
import { ohneSchemaVersion } from './speicher.ts';

interface Zeile {
  type?: string;
  attrs?: { quelle?: string };
}

function handy(info: TestInfo): boolean {
  return info.project.name.includes('handy');
}

function zeilen(doc: unknown): Zeile[] {
  if (!doc || typeof doc !== 'object') return [];
  const inhalt = (doc as { content?: Zeile[] }).content;
  return Array.isArray(inhalt) ? inhalt : [];
}

function ablageDoc(): Record<string, unknown> {
  return packeDokument(
    modell.node('doc', null, [
      modell.nodes.absatz!.createChecked({ quelle: 'q-alpha' }, modell.text('Alpha')),
      modell.nodes.leerzeile!.createChecked({ quelle: 'q-leer' }),
      modell.nodes.absatz!.createChecked({ quelle: 'q-omega' }, modell.text('Omega')),
    ]),
  );
}

async function tippe(page: Page, text: string, istHandy: boolean): Promise<void> {
  if (!istHandy) {
    await tippeTasten(page, text);
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await gboard({ page, cdp }, text);
}

async function oeffneNotiz(page: Page, id: number, istHandy: boolean): Promise<void> {
  await page.goto(`/library/note?id=${id}`);
  await warteBereit(page);
  if (istHandy) await tippeAn(page, 'header button[aria-label="Edit"]');
  else await klickeAn(page, 'header button[aria-label="Edit"]');
  await warteBereit(page);
  await expect(page.locator(FELD)).toBeVisible();
}

test('Ablegen behält quelle und leerzeile', { tag: '@F2' }, async ({ page }, testInfo) => {
  const istHandy = handy(testInfo);
  await meldeAn(page);
  const angelegt = await page.request.post('/api/notes', { data: { doc: ablageDoc() } });
  expect(angelegt.ok()).toBe(true);
  const id = ((await angelegt.json()) as { id: number }).id;
  await oeffneNotiz(page, id, istHandy);
  await expect.poll(async () => JSON.stringify(await editorJson(page))).toContain('q-alpha');
  const vorher = await editorJson(page);
  await tippe(page, 'Ende', istHandy);
  await ablegenOderSpeichern(page, 'notiz', id, 'Ende');
  const server = (await (await page.request.get(`/api/notes/${id}`)).json()) as { doc?: unknown };
  const alt = zeilen(vorher);
  const neu = zeilen(ohneSchemaVersion(server.doc));
  expect(neu[0]?.attrs?.quelle).toBe('q-alpha');
  expect(neu[1]?.type).toBe('leerzeile');
  expect(neu[1]?.attrs?.quelle).toBe('q-leer');
  expect(neu[0]).toEqual(alt[0]);
  expect(neu[1]).toEqual(alt[1]);
  expect(JSON.stringify(neu)).toContain('Ende');
  await oeffneNotiz(page, id, istHandy);
  await expect.poll(async () => JSON.stringify(await editorJson(page))).toContain('Ende');
  await expect.poll(async () => {
    const editor = ohneSchemaVersion(await editorJson(page));
    const geladen = (await (await page.request.get(`/api/notes/${id}`)).json()) as { doc?: unknown };
    return JSON.stringify(editor) === JSON.stringify(ohneSchemaVersion(geladen.doc));
  }).toBe(true);
});

test('Offline ablegen behält leerzeile', { tag: '@F2' }, async ({ page, context }, testInfo) => {
  const istHandy = handy(testInfo);
  await meldeAn(page);
  await page.goto('/');
  await warteBereit(page);
  await expect(page.locator(FELD)).toBeVisible();
  if (istHandy) await tippeAn(page, FELD);
  else await klickeAn(page, FELD);
  await context.setOffline(true);
  await tippe(page, 'Eins\n\nZwei', istHandy);
  await expect.poll(async () => JSON.stringify(await editorJson(page))).toContain('Zwei');
  const editorDoc = await editorJson(page);
  expect(zeilen(editorDoc).length).toBeGreaterThanOrEqual(3);
  if (istHandy) await tippeBeschriftung(page, 'File');
  else await klickeBeschriftung(page, 'File');
  await expect(page.getByRole('status')).toHaveText('Filed offline · syncs later');
  const warten = page.waitForResponse((antwort) => {
    if (!antwort.ok() || antwort.request().method() !== 'POST') return false;
    const pfad = new URL(antwort.url()).pathname;
    return pfad === '/api/notes' && (antwort.request().postData() ?? '').includes('Zwei');
  });
  await context.setOffline(false);
  const antwort = await warten;
  const id = ((await antwort.json()) as { id?: number }).id;
  expect(id).toBeTruthy();
  const server = (await (await page.request.get(`/api/notes/${id}`)).json()) as { doc?: unknown };
  expect(ohneSchemaVersion(server.doc)).toEqual(editorDoc);
});
