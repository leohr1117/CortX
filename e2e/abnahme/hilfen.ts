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
  expect(kasten.width).toBeGreaterThanOrEqual(48);
  expect(kasten.height).toBeGreaterThanOrEqual(48);
  await page.touchscreen.tap(kasten.x + kasten.width / 2, kasten.y + kasten.height / 2);
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
  expect((await sichtbar(page)).replace(/[•\u200b]/g, '').trim()).toBe(text.trim());
}

export function stil(page: Page, wort: string): Promise<Stil> {
  return page.locator(FELD).getByText(wort, { exact: true }).evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      fett: Number(s.fontWeight) >= 600,
      kursiv: s.fontStyle === 'italic',
      strich: s.textDecorationLine.includes('line-through'),
      mono: /mono/i.test(s.fontFamily),
      groesse: Number.parseFloat(s.fontSize),
    };
  });
}
