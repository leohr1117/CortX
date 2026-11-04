import { expect, type CDPSession, type Page } from '@playwright/test';

export const FELD = '.schreib .ProseMirror';

const FORMATZEICHEN =
  /\*\*|(^|[^\\])\*[^\s*]|~~|==|!!|`|^#{1,6}\s|^=\s|^[-*+]\s|^\d+\.\s|^[A-Za-z]\.\s|^\[[ x]?\]/m;

export interface Feld {
  page: Page;
  cdp: CDPSession;
}

export interface Stil {
  fett: boolean;
  kursiv: boolean;
  strich: boolean;
  mono: boolean;
  groesse: number;
}

export async function gboard({ page, cdp }: Feld, text: string): Promise<void> {
  for (const teil of text.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]/gu) ?? []) {
    if (teil === '\n') {
      await page.keyboard.press('Enter');
      continue;
    }
    if (/^[\p{L}\p{N}]+$/u.test(teil)) {
      for (let i = 1; i <= teil.length; i += 1) {
        await cdp.send('Input.imeSetComposition', {
          text: teil.slice(0, i),
          selectionStart: i,
          selectionEnd: i,
        });
      }
    }
    await cdp.send('Input.insertText', { text: teil });
  }
}

export async function tippeAn(page: Page, selektor: string): Promise<void> {
  const kasten = await page.locator(selektor).first().boundingBox();
  if (!kasten) throw new Error(`kein ${selektor}`);
  await page.touchscreen.tap(kasten.x + kasten.width / 2, kasten.y + kasten.height / 2);
}

export async function knopf(page: Page, name: string): Promise<void> {
  const ziel = page.getByRole('toolbar', { name: 'Format' }).getByRole('button', { name, exact: true });
  const kasten = await ziel.boundingBox();
  if (!kasten) throw new Error(`kein ${name}`);
  await page.touchscreen.tap(kasten.x + kasten.width / 2, kasten.y + kasten.height / 2);
}

export async function leereAuswahl(page: Page): Promise<void> {
  await waehleSichtbar(page, 0, 99_999);
  await page.keyboard.press('Backspace');
}

export async function waehleSichtbar(page: Page, von: number, bis: number): Promise<void> {
  await page.evaluate(
    ({ sel, von: start, bis: ende }) => {
      const pm = document.querySelector(sel);
      if (!pm) return;
      const stellen: Array<[Node, number]> = [];
      const bloecke = [...pm.children];
      bloecke.forEach((block, index) => {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
          acceptNode(knoten) {
            const eltern = knoten.parentElement?.closest('.cm-marker-weg,.cm-placeholder,[contenteditable=false]');
            return eltern ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
          },
        });
        let knoten = walker.nextNode();
        let letzte: Text | null = null;
        while (knoten) {
          const text = knoten as Text;
          for (let i = 0; i < text.data.length; i += 1) stellen.push([text, i]);
          letzte = text;
          knoten = walker.nextNode();
        }
        if (letzte) stellen.push([letzte, letzte.data.length]);
        if (index < bloecke.length - 1 && !letzte) stellen.push([block, 0]);
      });
      if (stellen.length === 0) return;
      const anfang = stellen[Math.min(start, stellen.length - 1)];
      const schluss = stellen[Math.min(ende, stellen.length - 1)];
      if (!anfang || !schluss) return;
      const auswahl = getSelection();
      auswahl?.setBaseAndExtent(anfang[0], anfang[1], schluss[0], schluss[1]);
    },
    { sel: FELD, von, bis },
  );
  await page.waitForTimeout(150);
}

export function sichtbar(page: Page): Promise<string> {
  return page.locator(FELD).innerText();
}

export function modellText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const haken = (window as Window & { __cortxModell?: { klartext: () => string } }).__cortxModell;
    return haken?.klartext() ?? '';
  });
}

export async function invarianten(page: Page): Promise<void> {
  const text = await modellText(page);
  expect(text, 'Formatzeichen im Dokumenttext').not.toMatch(FORMATZEICHEN);
  expect(await page.locator(`${FELD} .cm-marker-weg, ${FELD} [style*="font-size: 0"]`).count()).toBe(0);
  const zeilen = await page.locator(FELD).evaluate((el) =>
    [...el.children]
      .map((kind) => (kind as HTMLElement).innerText.replace(/[•\u200b]/g, '').replace(/\n+$/g, ''))
      .join('\n')
      .trim(),
  );
  expect(zeilen, 'sichtbarer Text').toBe(text.trim());
}

export async function tippeBeschriftung(page: Page, name: string): Promise<void> {
  const ziel = page.getByRole('button', { name });
  const kasten = await ziel.boundingBox();
  if (!kasten) throw new Error(`kein ${name}`);
  await page.touchscreen.tap(kasten.x + kasten.width / 2, kasten.y + kasten.height / 2);
}

export function editorJson(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const haken = (window as Window & { __cortxModell?: { json: () => unknown } }).__cortxModell;
    return haken?.json() ?? null;
  });
}

export async function waehleSichtbarenText(page: Page, anfang: string, ende: string): Promise<void> {
  await page.evaluate(
    ({ sel, anfang: vonText, ende: bisText }) => {
      const pm = document.querySelector(sel);
      if (!pm) throw new Error('kein Feld');
      type Stelle = { node: Text; index: number };
      const stellen: Array<Stelle | 'nl'> = [];
      const bloecke = [...pm.children];
      bloecke.forEach((block, index) => {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
          acceptNode(knoten) {
            const eltern = knoten.parentElement?.closest('.cm-marker-weg,.cm-placeholder,[contenteditable=false]');
            return eltern ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
          },
        });
        let knoten = walker.nextNode();
        while (knoten) {
          const text = knoten as Text;
          for (let i = 0; i < text.data.length; i += 1) stellen.push({ node: text, index: i });
          knoten = walker.nextNode();
        }
        if (index < bloecke.length - 1) stellen.push('nl');
      });
      const sichtbar = stellen
        .map((eintrag) => (eintrag === 'nl' ? '\n' : (eintrag.node.data[eintrag.index] ?? '')))
        .join('');
      const von = sichtbar.indexOf(vonText);
      const bisTextStart = von < 0 ? -1 : sichtbar.indexOf(bisText, von);
      if (von < 0 || bisTextStart < 0) throw new Error(`nicht gefunden in ${JSON.stringify(sichtbar)}`);
      const bis = bisTextStart + bisText.length;
      const grenze = (index: number): [Node, number] => {
        if (index >= stellen.length) {
          for (let i = stellen.length - 1; i >= 0; i -= 1) {
            const eintrag = stellen[i];
            if (eintrag && eintrag !== 'nl') return [eintrag.node, eintrag.index + 1];
          }
          throw new Error('leer');
        }
        const eintrag = stellen[index];
        if (eintrag && eintrag !== 'nl') return [eintrag.node, eintrag.index];
        for (let i = index - 1; i >= 0; i -= 1) {
          const vor = stellen[i];
          if (vor && vor !== 'nl') return [vor.node, vor.index + 1];
        }
        throw new Error('zeilenanfang');
      };
      const start = grenze(von);
      const schluss = grenze(bis);
      const auswahl = getSelection();
      auswahl?.setBaseAndExtent(start[0], start[1], schluss[0], schluss[1]);
    },
    { sel: FELD, anfang, ende },
  );
  await page.waitForTimeout(150);
}

function notizPfad(url: string, id: number | null): boolean {
  let pfad = '';
  try {
    pfad = new URL(url).pathname;
  } catch {
    return false;
  }
  if (id === null) return pfad === '/api/notes';
  return pfad === `/api/notes/${id}`;
}

export async function ablegenOderSpeichern(
  page: Page,
  feld: 'erfassen' | 'notiz',
  notizId: number | null,
  merkmal: string,
): Promise<number> {
  const antwort = page.waitForResponse((r) => {
    if (!r.ok() || r.request().method() !== 'POST') return false;
    if (!notizPfad(r.url(), feld === 'erfassen' ? null : notizId)) return false;
    return (r.request().postData() ?? '').includes(merkmal);
  });
  if (feld === 'erfassen') await tippeBeschriftung(page, 'File');
  const koerper = (await (await antwort).json()) as { id?: number };
  const id = koerper.id ?? notizId;
  if (!id) throw new Error('keine Notiz');
  return id;
}

export function istListenzeile(page: Page, wort: string): Promise<boolean> {
  return page.locator(FELD).evaluate((wurzel, gesucht) => {
    for (const block of wurzel.children) {
      const sichtbar = (block as HTMLElement).innerText.replace(/\u00a0/g, ' ');
      if (!sichtbar.includes(gesucht)) continue;
      for (const kind of block.querySelectorAll('[aria-hidden="true"]')) {
        const namen = (kind as HTMLElement).className.split(/\s+/);
        if (namen.some((name) => name.includes('placeholder'))) continue;
        return true;
      }
      return false;
    }
    return false;
  }, wort);
}

export async function enterDann(feld: Feld, text: string): Promise<void> {
  await feld.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    text: '\r',
  });
  await feld.cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
  for (const zeichen of text) {
    await feld.cdp.send('Input.insertText', { text: zeichen });
  }
}

export function stil(page: Page, wort: string): Promise<Stil> {
  return page.locator(FELD).evaluate((wurzel, gesucht) => {
    const filter = {
      acceptNode(knoten: Node) {
        const eltern = knoten.parentElement?.closest('.cm-marker-weg,.cm-placeholder,[contenteditable=false]');
        return eltern ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    };
    const walker = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT, filter);
    let knoten = walker.nextNode();
    while (knoten) {
      const text = knoten as Text;
      if (text.data.includes(gesucht) && text.parentElement) {
        const s = getComputedStyle(text.parentElement);
        return {
          fett: Number(s.fontWeight) >= 600,
          kursiv: s.fontStyle === 'italic',
          strich: s.textDecorationLine.includes('line-through'),
          mono: /mono/i.test(s.fontFamily),
          groesse: Number.parseFloat(s.fontSize),
        };
      }
      knoten = walker.nextNode();
    }
    throw new Error(`kein ${gesucht}`);
  }, wort);
}
