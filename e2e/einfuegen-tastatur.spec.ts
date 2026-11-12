import { expect, test, type Page } from './ruhe.ts';
import { oeffneFeld } from './abnahme/feldOeffnen.ts';
import { sichereBestand, stelleBestand } from './schau.ts';
import { FELD, editorJson, gboard, klickeAn, modellText, ruhig } from './abnahme/hilfen.ts';

let bestand: ReturnType<typeof sichereBestand> | null = null;

test.beforeEach(() => {
  bestand = sichereBestand();
});

test.afterEach(() => {
  if (bestand) stelleBestand(bestand);
  bestand = null;
});

const ANTWORT = [
  '## Reiseplan',
  '',
  '**Wichtig:** Ticket pruefen',
  '',
  '1. Koffer packen',
  '2. Zug nehmen',
  '',
  '- Pass',
  '- Ladekabel',
  '',
  '---',
  '',
  'Mehr unter [Fahrplan](https://example.com/fahrplan).',
].join('\n');

const ROH = /\*\*|^#{1,6} |^\d+\. |^- |\]\(/m;

interface Knoten {
  type: string;
  content?: Knoten[];
}

async function arten(page: Page): Promise<string[]> {
  const json = (await editorJson(page)) as Knoten;
  return (json.content ?? []).map((knoten) => knoten.type);
}

function zaehle(text: string, teil: string): number {
  return text.split(teil).length - 1;
}

async function erwarteFormatiert(page: Page): Promise<void> {
  await expect.poll(() => modellText(page), { timeout: 3_000 }).not.toMatch(ROH);
  const text = await modellText(page);
  expect(zaehle(text, 'Koffer packen')).toBe(1);
  expect(zaehle(text, 'Ladekabel')).toBe(1);
  expect(zaehle(text, 'Reiseplan')).toBe(1);
  await expect(page.locator(`${FELD} h2`)).toHaveText('Reiseplan');
  await expect(page.locator(`${FELD} strong, ${FELD} .cm-fett`).first()).toContainText('Wichtig');
  await expect(page.locator(`${FELD} hr`)).toHaveCount(1);
  expect((await arten(page)).filter((art) => art === 'punkt')).toHaveLength(4);
}

async function lege(page: Page, merkmal: string): Promise<number> {
  const antwort = page.waitForResponse((r) => r.ok() && r.request().method() === 'POST'
    && new URL(r.url()).pathname === '/api/notes' && (r.request().postData() ?? '').includes(merkmal));
  await page.locator(FELD).focus();
  await page.keyboard.press('ControlOrMeta+Enter');
  const koerper = (await (await antwort).json()) as { id?: number };
  if (!koerper.id) throw new Error('keine Notiz');
  return koerper.id;
}

async function fuegeEinPerEreignis(page: Page, daten: Record<string, string>): Promise<void> {
  await klickeAn(page, FELD);
  await page.locator(FELD).evaluate((el, werte: Record<string, string>) => {
    const ablage = new DataTransfer();
    for (const [art, wert] of Object.entries(werte)) ablage.setData(art, wert);
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: ablage });
    el.dispatchEvent(event);
  }, daten);
  await ruhig(page);
}

async function protokolliere(page: Page): Promise<void> {
  await page.evaluate(() => {
    const fenster = window as Window & { __eingaben?: Array<{ art: string; abbrechbar: boolean }>; __einfuegen?: number };
    fenster.__eingaben = [];
    fenster.__einfuegen = 0;
    document.addEventListener('beforeinput', (event) => {
      fenster.__eingaben!.push({ art: (event as InputEvent).inputType, abbrechbar: event.cancelable });
    }, true);
    document.addEventListener('paste', () => {
      fenster.__einfuegen! += 1;
    }, true);
  });
}

async function eingaben(page: Page): Promise<{ arten: string[]; einfuegen: number }> {
  return page.evaluate(() => {
    const fenster = window as Window & { __eingaben?: Array<{ art: string }>; __einfuegen?: number };
    return { arten: (fenster.__eingaben ?? []).map((eintrag) => eintrag.art), einfuegen: fenster.__einfuegen ?? 0 };
  });
}

test.describe('Gboard clipboard strip', () => {
  test('a cancelable insertText without paste event is formatted once', async ({ page }) => {
    await oeffneFeld(page, 'erfassen');
    await protokolliere(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.insertText', { text: ANTWORT });
    await ruhig(page);
    const log = await eingaben(page);
    expect(log.einfuegen).toBe(0);
    expect(log.arten).toContain('insertText');
    await erwarteFormatiert(page);
  });

  test('a commit during a running composition is formatted once', async ({ page }) => {
    await oeffneFeld(page, 'erfassen');
    await protokolliere(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: 'Not', selectionStart: 3, selectionEnd: 3 });
    await ruhig(page);
    await cdp.send('Input.insertText', { text: ANTWORT });
    await ruhig(page);
    const log = await eingaben(page);
    expect(log.einfuegen).toBe(0);
    expect(log.arten).toContain('insertCompositionText');
    await erwarteFormatiert(page);
    expect(await modellText(page)).not.toContain('Not');
  });

  test('a composition with line breaks that ends without commit is formatted once', async ({ page }) => {
    await oeffneFeld(page, 'erfassen');
    await protokolliere(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: ANTWORT, selectionStart: ANTWORT.length, selectionEnd: ANTWORT.length });
    await ruhig(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await ruhig(page);
    const log = await eingaben(page);
    expect(log.einfuegen).toBe(0);
    expect(log.arten).toContain('insertCompositionText');
    expect(log.arten).not.toContain('insertText');
    await erwarteFormatiert(page);
  });

  test('pasting in the middle of a note keeps the text around it', async ({ page }) => {
    await oeffneFeld(page, 'erfassen');
    const cdp = await page.context().newCDPSession(page);
    await gboard({ page, cdp }, 'Vorher');
    await page.keyboard.press('Enter');
    await ruhig(page);
    await cdp.send('Input.insertText', { text: ANTWORT });
    await ruhig(page);
    await erwarteFormatiert(page);
    expect(zaehle(await modellText(page), 'Vorher')).toBe(1);
  });

  test('normal typing with the keyboard stays as typed', async ({ page }) => {
    await oeffneFeld(page, 'erfassen');
    const cdp = await page.context().newCDPSession(page);
    await gboard({ page, cdp }, 'Erste Zeile\nzweite Zeile mit Wort');
    await expect.poll(() => modellText(page)).toBe('Erste Zeile\nzweite Zeile mit Wort');
    await expect(page.locator(`${FELD} hr`)).toHaveCount(0);
  });
});

test.describe('clipboard data', () => {
  test('HTML only with literal Markdown is formatted', async ({ page }) => {
    await oeffneFeld(page, 'erfassen');
    const html = ANTWORT.split('\n').map((zeile) => (zeile === '' ? '<div><br></div>' : `<div>${zeile}</div>`)).join('');
    await fuegeEinPerEreignis(page, { 'text/html': `<meta charset="utf-8">${html}` });
    await erwarteFormatiert(page);
  });

  test('plain text and HTML with literal Markdown are formatted', async ({ page }) => {
    await oeffneFeld(page, 'erfassen');
    const html = ANTWORT.split('\n').map((zeile) => `<p>${zeile}</p>`).join('');
    await fuegeEinPerEreignis(page, { 'text/plain': ANTWORT, 'text/html': html });
    await erwarteFormatiert(page);
  });

  test('a real paste is inserted exactly once', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permission only in Chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await oeffneFeld(page, 'erfassen');
    await protokolliere(page);
    await page.evaluate((text) => navigator.clipboard.writeText(text), ANTWORT);
    await page.keyboard.press('ControlOrMeta+V');
    await ruhig(page);
    expect((await eingaben(page)).einfuegen).toBe(1);
    await erwarteFormatiert(page);
  });
});

test.describe('divider', () => {
  test('--- after a blank line becomes a divider, --- under text stays text', async ({ page }) => {
    await oeffneFeld(page, 'erfassen');
    await fuegeEinPerEreignis(page, { 'text/plain': 'oben\n\n---\n\nunten\nmitte\n---' });
    await expect(page.locator(`${FELD} hr`)).toHaveCount(1);
    await expect(page.getByRole('separator')).toHaveCount(1);
    const text = await modellText(page);
    expect(text).toContain('oben');
    expect(text).toContain('unten');
    expect(text).toContain('mitte\n---');
  });

  test('a text line --- under text is exported escaped and stays text', async ({ page }) => {
    await oeffneFeld(page, 'erfassen');
    await fuegeEinPerEreignis(page, { 'text/plain': 'Fluchtprobe\n---\n\n***' });
    await expect(page.locator(`${FELD} hr`)).toHaveCount(1);
    const id = await lege(page, 'Fluchtprobe');
    const antwort = await page.request.get(`/api/notes/${id}`);
    const notiz = (await antwort.json()) as { text: string };
    expect(notiz.text).toBe('Fluchtprobe\n\\---\n\n---');
    await page.goto(`/library/note?id=${id}`);
    await expect(page.locator('.lesetext hr')).toHaveCount(1);
    await expect(page.locator('.lesetext')).toContainText('---');
    await expect(page.locator('.lesetext')).not.toContainText('\\');
  });

  test('*** and ___ become dividers too', async ({ page }) => {
    await oeffneFeld(page, 'erfassen');
    await fuegeEinPerEreignis(page, { 'text/plain': 'a\n\n***\n\nb\n\n___\n\nc' });
    await expect(page.locator(`${FELD} hr`)).toHaveCount(2);
  });

  test('--- and Enter turn into a divider and undo brings --- back', async ({ page }) => {
    await oeffneFeld(page, 'erfassen');
    await page.keyboard.type('oben');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('---');
    await page.keyboard.press('Enter');
    await ruhig(page);
    await expect(page.locator(`${FELD} hr`)).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+Z');
    await ruhig(page);
    await expect(page.locator(`${FELD} hr`)).toHaveCount(0);
    await expect.poll(() => modellText(page)).toMatch(/---$/);
  });

  test('the divider is selectable, deletable and arrow keys jump over it', async ({ page }) => {
    await oeffneFeld(page, 'erfassen');
    await fuegeEinPerEreignis(page, { 'text/plain': 'oben\n\n---\n\nunten' });
    const linie = page.locator(`${FELD} hr`);
    await expect(linie).toHaveCount(1);
    await linie.click();
    await expect(linie).toHaveClass(/ProseMirror-selectednode/);
    const ring = await linie.evaluate((el) => {
      const stil = getComputedStyle(el);
      return { breite: stil.outlineWidth, art: stil.outlineStyle };
    });
    expect(ring).toEqual({ breite: '2px', art: 'solid' });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.type('X');
    await expect.poll(() => modellText(page)).toContain('Xunten');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.type('Y');
    await expect.poll(() => modellText(page)).toContain('obenY');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.type('Z');
    await expect.poll(() => modellText(page)).toContain('Zunten');
    await page.keyboard.press('Backspace');
    await expect(linie).toHaveCount(1);
    await linie.click();
    await expect(linie).toHaveClass(/ProseMirror-selectednode/);
    await page.keyboard.press('Backspace');
    await expect(linie).toHaveCount(0);
    await fuegeEinPerEreignis(page, { 'text/plain': '\n\n---\n\nnoch' });
    await expect(linie).toHaveCount(1);
    await linie.click();
    await page.keyboard.press('Delete');
    await expect(linie).toHaveCount(0);
  });

  test('looks like Lena\'s divider in editor and reading view and exports ---', async ({ page }, testInfo) => {
    await oeffneFeld(page, 'erfassen');
    await fuegeEinPerEreignis(page, { 'text/plain': 'Trennprobe oben\n\n***\nunten' });
    const linie = page.locator(`${FELD} hr`);
    await expect(linie).toHaveCount(1);
    const stil = () => linie.evaluate((el) => {
      const s = getComputedStyle(el);
      const eltern = el.parentElement!.getBoundingClientRect();
      const kasten = el.getBoundingClientRect();
      const innen = parseFloat(getComputedStyle(el.parentElement!).paddingLeft);
      return {
        oben: s.borderTopWidth, art: s.borderTopStyle, farbe: s.borderTopColor,
        abstandOben: s.marginTop, abstandUnten: s.marginBottom, hoehe: kasten.height,
        links: Math.round(kasten.left - eltern.left - innen), bild: s.backgroundImage,
      };
    });
    const editor = await stil();
    expect(editor).toEqual({
      oben: '1px', art: 'solid', farbe: 'rgb(58, 58, 58)', abstandOben: '24px', abstandUnten: '24px', hoehe: 1, links: 0, bild: 'none',
    });
    await page.screenshot({ path: `tmp-test/screens/${testInfo.project.name}-trennlinie-editor.png` });
    const id = await lege(page, 'Trennprobe');
    const antwort = await page.request.get(`/api/notes/${id}`);
    const notiz = (await antwort.json()) as { text: string };
    expect(notiz.text).toBe('Trennprobe oben\n\n---\n\nunten');
    await page.goto(`/library/note?id=${id}`);
    const lese = page.locator('.lesetext hr');
    await expect(lese).toHaveCount(1);
    const lesen = await lese.evaluate((el) => {
      const s = getComputedStyle(el);
      return { oben: s.borderTopWidth, art: s.borderTopStyle, farbe: s.borderTopColor, abstandOben: s.marginTop, abstandUnten: s.marginBottom, hoehe: el.getBoundingClientRect().height };
    });
    expect(lesen).toEqual({ oben: '1px', art: 'solid', farbe: 'rgb(58, 58, 58)', abstandOben: '24px', abstandUnten: '24px', hoehe: 1 });
    await page.screenshot({ path: `tmp-test/screens/${testInfo.project.name}-trennlinie-lesen.png` });
  });
});
