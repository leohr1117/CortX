import { TEXTE } from '../shared/kern/texte.ts';
import { expect, festeZeit, test, type Page } from './ruhe.ts';
import { meldeAn } from './anmelden.ts';
import { erwarteQuelle, setzeQuelle } from './feld.ts';
import { leereLokal, liesNotizEntwurf } from './lokal.ts';
import { sichereBestand, setzeSchauspiel, stelleBestand, type Bestand } from './schau.ts';

const ALT = 'Shared plan\n\nFirst line';
const ERSTER = 'Shared plan\n\nAlpha from the first tab';
const ZWEITER = 'Shared plan\n\nBeta from the second tab';
const KOPIE = /^Shared plan \(Conflict \u00b7 \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2}\)\n\nBeta from the second tab$/;

let bestand: Bestand;

test.beforeEach(async ({ page }) => {
  bestand = sichereBestand();
  setzeSchauspiel([{ name: 'Work', notizen: [{ text: ALT, created: festeZeit(0, 9, 0) }] }]);
  await meldeAn(page);
  await leereLokal(page);
});

test.afterEach(() => {
  stelleBestand(bestand);
});

function notizId(): number {
  return sichereBestand().notes[0]!.id;
}

function serverText(id: number): string | undefined {
  return sichereBestand().notes.find((notiz) => notiz.id === id)?.text;
}

async function schreibe(page: Page, id: number): Promise<void> {
  await page.goto(`/library/note?id=${id}`);
  await page.getByRole('button', { name: 'Edit' }).click();
  await erwarteQuelle(page, ALT);
}

async function konflikt(page: Page, id: number): Promise<{ zweite: Page; posts: string[] }> {
  const zweite = await page.context().newPage();
  await schreibe(page, id);
  await schreibe(zweite, id);
  await setzeQuelle(page, ERSTER);
  await expect.poll(() => serverText(id)).toBe(ERSTER);
  const posts: string[] = [];
  zweite.on('request', (anfrage) => {
    if (anfrage.method() === 'POST' && new URL(anfrage.url()).pathname === `/api/notes/${id}`) posts.push(anfrage.url());
  });
  await setzeQuelle(zweite, ZWEITER);
  await expect(zweite.getByRole('status')).toHaveText(TEXTE.seiteNeuGeladen);
  return { zweite, posts };
}

test('a second tab that loses the race keeps its text, its draft and the server copy of the first tab', async ({ page }) => {
  test.setTimeout(60_000);
  const id = notizId();
  const { zweite, posts } = await konflikt(page, id);
  await erwarteQuelle(zweite, ZWEITER);
  await expect.poll(() => liesNotizEntwurf(zweite, id)).toBe(ZWEITER);
  expect(serverText(id)).toBe(ERSTER);
  const gesendet = posts.length;
  await setzeQuelle(zweite, `${ZWEITER}, longer`);
  await zweite.waitForTimeout(1500);
  expect(posts).toHaveLength(gesendet);
  expect(serverText(id)).toBe(ERSTER);
  await setzeQuelle(zweite, ZWEITER);

  await zweite.getByRole('button', { name: TEXTE.alsKopie }).click();
  await expect(zweite).not.toHaveURL(new RegExp(`id=${id}$`));
  const kopieId = Number(new URL(zweite.url()).searchParams.get('id'));
  const jetzt = sichereBestand();
  const kopie = jetzt.notes.find((notiz) => notiz.id === kopieId);
  expect(kopie?.text).toMatch(KOPIE);
  expect(kopie?.topic_id).toBe(jetzt.notes.find((notiz) => notiz.id === id)?.topic_id);
  expect(jetzt.notes).toHaveLength(2);
  expect(serverText(id)).toBe(ERSTER);
  expect(await liesNotizEntwurf(zweite, id)).toBe('');
  await zweite.close();
});

test('a failed copy keeps the hint, the draft and the page, and a second try saves it once', async ({ page }) => {
  test.setTimeout(60_000);
  const id = notizId();
  const { zweite } = await konflikt(page, id);
  await zweite.route(`**/api/notes/${id}/copy`, (route) => route.abort());
  await zweite.getByRole('button', { name: TEXTE.alsKopie }).click();
  await expect(zweite.getByRole('alert')).toHaveText(TEXTE.kopieFehl);
  await expect(zweite.getByRole('status')).toHaveText(TEXTE.seiteNeuGeladen);
  await expect(zweite).toHaveURL(new RegExp(`id=${id}$`));
  await erwarteQuelle(zweite, ZWEITER);
  expect(await liesNotizEntwurf(zweite, id)).toBe(ZWEITER);
  expect(sichereBestand().notes).toHaveLength(1);

  await zweite.unroute(`**/api/notes/${id}/copy`);
  await zweite.getByRole('button', { name: TEXTE.alsKopie }).click();
  await expect(zweite).not.toHaveURL(new RegExp(`id=${id}$`));
  const notizen = sichereBestand().notes;
  expect(notizen).toHaveLength(2);
  expect(notizen.filter((notiz) => KOPIE.test(notiz.text))).toHaveLength(1);
  await zweite.close();
});

test('leaving half a second after typing still saves the text', async ({ page }) => {
  test.setTimeout(60_000);
  const id = notizId();
  const TEXT = 'Shared plan\n\nTyped right before leaving';
  await schreibe(page, id);
  let gehalten = 0;
  await page.route(`**/api/notes/${id}`, async (route) => {
    if (route.request().method() === 'POST' && route.request().resourceType() === 'fetch') {
      gehalten += 1;
      return;
    }
    await route.continue();
  });
  await setzeQuelle(page, TEXT);
  await page.waitForTimeout(500);
  await page.goto('/library');
  await expect.poll(() => serverText(id), { timeout: 10_000 }).toBe(TEXT);
  expect(gehalten).toBeLessThanOrEqual(1);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
