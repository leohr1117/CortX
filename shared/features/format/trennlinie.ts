import type { Node } from 'prosemirror-model';
import { modell } from './modell.ts';

export const TRENNLINIE = 'trennlinie';
export const TRENNLINIE_ZEICHEN = '---';

const TRENN_ZEILE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

const STERN_LAUF = /^ {0,3}\*{4,}[ \t]*$/;

const FLUCHT_TRENN = /^( {0,3})\\([-*_](?:[ \t]*[-*_]){2,}[ \t]*)$/;

export function istTrennZeile(kern: string): boolean {
  return TRENN_ZEILE.test(kern) && !STERN_LAUF.test(kern);
}

export function trennTextAusFlucht(kern: string): string | null {
  const treffer = FLUCHT_TRENN.exec(kern);
  if (!treffer || !TRENN_ZEILE.test(treffer[1]! + treffer[2]!)) return null;
  return treffer[1]! + treffer[2]!;
}

export function trennFlucht(text: string): string | null {
  if (STERN_LAUF.test(text)) return text.replace(/\*/g, '\\*');
  if (!TRENN_ZEILE.test(text)) return null;
  const rand = /^ */.exec(text)![0];
  return `${rand}\\${text.slice(rand.length)}`;
}

function ende(quelle: string): string {
  if (quelle.endsWith('\r\n')) return '\r\n';
  if (quelle.endsWith('\n')) return '\n';
  return '';
}

export function trennlinieAus(quelle: string): Node {
  return modell.nodes.trennlinie!.createChecked({ quelle });
}

function leerzeile(): Node {
  return modell.nodes.leerzeile!.createChecked({ quelle: '\n' });
}

export function mitTrennAbstand(doc: Node): Node {
  let gefunden = false;
  doc.forEach((knoten) => {
    if (knoten.type.name === TRENNLINIE) gefunden = true;
  });
  if (!gefunden) return doc;
  const kinder: Node[] = [];
  const anzahl = doc.childCount;
  for (let i = 0; i < anzahl; i += 1) {
    const knoten = doc.child(i);
    if (knoten.type.name !== TRENNLINIE) {
      kinder.push(knoten);
      continue;
    }
    const davor = kinder.at(-1);
    if (davor && davor.type.name !== 'leerzeile') kinder.push(leerzeile());
    const letzte = i === anzahl - 1;
    const alt = String(knoten.attrs.quelle ?? '');
    kinder.push(modell.nodes.trennlinie!.createChecked({ quelle: TRENNLINIE_ZEICHEN + (letzte ? ende(alt) : '\n') }));
    const danach = letzte ? null : doc.child(i + 1);
    if (danach && danach.type.name !== 'leerzeile') kinder.push(leerzeile());
  }
  return doc.type.create(doc.attrs, kinder);
}
