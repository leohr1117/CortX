import { expect, test, type Page, type Response } from '@playwright/test';
import { meldeAn } from '../anmelden.ts';
import { warteBereit } from '../lokal.ts';
import {
  FELD,
  blockText,
  gboard,
  klickeAn,
  knopf,
  stil,
  tippeAn,
  tippeTasten,
} from './hilfen.ts';
import { ausServer, nur, serverUnverfaelscht, type NotizAntwort } from './speicher.ts';

const FORMATE = [
  { name: 'Fett', mark: 'fett', stilArt: 'fett', quelle: '**zwei**' },
  { name: 'Kursiv', mark: 'kursiv', stilArt: 'kursiv', quelle: '*zwei*' },
  { name: 'Strich', mark: 'strich', stilArt: 'strich', quelle: '~~zwei~~' },
  { name: 'Code', mark: 'code', stilArt: 'mono', quelle: '`zwei`' },
] as const;

function istHandy(name: string): boolean {
  return name.includes('handy');
}

async function tippe(page: Page, text: string, handy: boolean): Promise<void> {
  if (handy) await gboard({ page, cdp: await page.context().newCDPSession(page) }, text);
  else await tippeTasten(page, text);
}

async function oeffneBestehendeNotiz(page: Page, text: string, handy: boolean): Promise<number> {
  await meldeAn(page);
  const antwort = await page.request.post('/api/notes', { data: { text } });
  expect(antwort.ok()).toBe(true);
  const id = ((await antwort.json()) as { id: number }).id;
  await page.goto(`/library/note?id=${id}`);
  await warteBereit(page);
  const stift = 'header button[aria-label="Edit"]';
  if (handy) await tippeAn(page, stift);
  else await klickeAn(page, stift);
  await warteBereit(page);
  await expect(page.locator(FELD)).toBeVisible();
  return id;
}

async function cursorBei(page: Page, wort: string, seite: 'anfang' | 'ende', handy: boolean): Promise<void> {
  const ziel = page.locator(FELD).getByText(wort, { exact: true });
  const kasten = await ziel.boundingBox();
  const feld = await page.locator(FELD).boundingBox();
  if (!kasten || !feld) throw new Error(`kein ${wort}`);
  const y = kasten.y + kasten.height / 2;
  const x = seite === 'ende'
    ? Math.min(feld.x + feld.width - 8, kasten.x + kasten.width + 40)
    : Math.max(feld.x + 8, kasten.x + 1);
  if (handy) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

function horche(page: Page, id: number, merkmal: string): Promise<NotizAntwort> {
  const warten = page.waitForResponse(
    (antwort: Response) => antwort.request().method() === 'POST'
      && new URL(antwort.url()).pathname === `/api/notes/${id}`
      && (antwort.request().postData() ?? '').includes(merkmal),
    { timeout: 15_000 },
  );
  return warten.then(async () => (await (await page.request.get(`/api/notes/${id}`)).json()) as NotizAntwort);
}

function sicht(page: Page): Promise<string> {
  return blockText(page, FELD);
}

test.describe('bestehende Notiz', { tag: '@F1' }, () => {
  test('K1 bestehende Notiz: " drei" nach fettem Wort, Server-Inhalt unverfaelscht', async ({ page }, info) => {
    const handy = istHandy(info.project.name);
    const id = await oeffneBestehendeNotiz(page, 'Titel\neins **zwei**', handy);
    await cursorBei(page, 'zwei', 'ende', handy);
    const gespeichert = horche(page, id, 'rei');
    await tippe(page, ' drei', handy);
    const server = ausServer(await gespeichert);
    const text = await sicht(page);
    serverUnverfaelscht(server, text, nur('fett', 'zwei'));
    expect(text).toBe('Titel\neins zwei drei');
    expect((await stil(page, 'zwei')).fett).toBe(true);
    expect((await stil(page, 'drei')).fett).toBe(false);
  });

  test('K2 bestehende Notiz: Strich ohne Markierung, Server nicht verdoppelt', async ({ page }, info) => {
    const handy = istHandy(info.project.name);
    const id = await oeffneBestehendeNotiz(page, 'Titel', handy);
    await cursorBei(page, 'Titel', 'ende', handy);
    if (handy) await knopf(page, 'Strikethrough');
    else await page.keyboard.press('Control+Shift+X');
    const gespeichert = horche(page, id, 'hdhx');
    await tippe(page, 'hdhx', handy);
    const server = ausServer(await gespeichert);
    expect(server.roh, 'Strich nicht verdoppelt').not.toContain('~~hdhx~~~~');
    const text = await sicht(page);
    serverUnverfaelscht(server, text, { strich: ['hdhx'] });
    expect((await stil(page, 'hdhx')).strich).toBe(true);
  });

  test('K3 bestehende Notiz: Enter am Ende eines Formats', async ({ page }, info) => {
    const handy = istHandy(info.project.name);
    const id = await oeffneBestehendeNotiz(page, 'Titel\neins **zwei**', handy);
    await cursorBei(page, 'zwei', 'ende', handy);
    const gespeichert = horche(page, id, 'danach');
    await page.keyboard.press('Enter');
    await tippe(page, 'danach', handy);
    const server = ausServer(await gespeichert);
    const text = await sicht(page);
    serverUnverfaelscht(server, text, nur('fett', 'zwei'));
    expect(text).toBe('Titel\neins zwei\ndanach');
    expect((await stil(page, 'zwei')).fett).toBe(true);
    expect((await stil(page, 'danach')).fett).toBe(false);
  });

  for (const format of FORMATE) {
    if (format.mark === 'fett') continue;
    test(`${format.name} am Wortende, Server-Inhalt unverfaelscht`, async ({ page }, info) => {
      const handy = istHandy(info.project.name);
      const id = await oeffneBestehendeNotiz(page, `Titel\neins ${format.quelle}`, handy);
      await cursorBei(page, 'zwei', 'ende', handy);
      const gespeichert = horche(page, id, 'rei');
      await tippe(page, ' drei', handy);
      const server = ausServer(await gespeichert);
      const text = await sicht(page);
      serverUnverfaelscht(server, text, nur(format.mark, 'zwei'));
      expect(text).toBe('Titel\neins zwei drei');
      expect((await stil(page, 'zwei'))[format.stilArt]).toBe(true);
      expect((await stil(page, 'drei'))[format.stilArt]).toBe(false);
    });
  }

  for (const format of FORMATE) {
    test(`${format.name} am Wortanfang, Server-Inhalt unverfaelscht`, async ({ page }, info) => {
      const handy = istHandy(info.project.name);
      const id = await oeffneBestehendeNotiz(page, `Titel\n${format.quelle}`, handy);
      await cursorBei(page, 'zwei', 'ende', handy);
      for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowLeft');
      const gespeichert = horche(page, id, 'vor');
      await tippe(page, 'vor ', handy);
      const server = ausServer(await gespeichert);
      const text = await sicht(page);
      serverUnverfaelscht(server, text, nur(format.mark, 'zwei'));
      expect(text).toBe('Titel\nvor zwei');
      expect((await stil(page, 'vor'))[format.stilArt]).toBe(false);
      expect((await stil(page, 'zwei'))[format.stilArt]).toBe(true);
    });
  }

  test('M3 Leseansicht nach dem Speichern gleich Editor', async ({ page }, info) => {
    const handy = istHandy(info.project.name);
    const id = await oeffneBestehendeNotiz(page, 'Titel\neins **zwei** und *drei*', handy);
    await cursorBei(page, 'Titel', 'ende', handy);
    const gespeichert = horche(page, id, 'QQ');
    await tippe(page, 'QQ', handy);
    const server = ausServer(await gespeichert);
    const editor = await sicht(page);
    serverUnverfaelscht(server, editor, { fett: ['zwei'], kursiv: ['drei'], strich: [], code: [] });
    expect((await stil(page, 'zwei')).fett).toBe(true);
    expect((await stil(page, 'drei')).kursiv).toBe(true);
    expect((await stil(page, 'QQ')).fett).toBe(false);
    const lesen = 'header button[aria-label="Read"]';
    if (handy) await tippeAn(page, lesen);
    else await klickeAn(page, lesen);
    await expect(page.locator('.lesetext')).toBeVisible();
    expect(await blockText(page, '.lesetext')).toBe(editor);
    await expect(page.locator('.lesetext strong').getByText('zwei', { exact: true })).toHaveCount(1);
    await expect(page.locator('.lesetext em').getByText('drei', { exact: true })).toHaveCount(1);
    await expect(page.locator('.lesetext strong').getByText('QQ', { exact: true })).toHaveCount(0);
    await expect(page.locator('.lesetext em').getByText('QQ', { exact: true })).toHaveCount(0);
  });
});
