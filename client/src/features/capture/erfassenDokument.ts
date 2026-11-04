import type { Node } from 'prosemirror-model';
import { TextSelection, type Selection } from 'prosemirror-state';
import { lade } from '../../../../shared/features/format/laden.ts';
import { modell } from '../../../../shared/features/format/modell.ts';

function absatzTyp() {
  const typ = modell.nodes.absatz;
  if (!typ) throw new Error('missing block');
  return typ;
}

function absatzMit(text: string, quelle = ''): Node {
  const attrs = { quelle, flucht: false };
  if (text.length === 0) return absatzTyp().create(attrs);
  return absatzTyp().create(attrs, modell.text(text));
}

function kernQuelle(quelle: string): string {
  const ohne = quelle.endsWith('\n') ? quelle.slice(0, -1) : quelle;
  return ohne.endsWith('\r') ? ohne.slice(0, -1) : ohne;
}

export function textAusDokument(doc: Node): string {
  if (doc.childCount === 0) return '';
  const zeilen: string[] = [];
  for (let i = 0; i < doc.childCount; i += 1) {
    const knoten = doc.child(i);
    zeilen.push(knoten.type.name === 'leerzeile' ? '' : knoten.textContent);
  }
  return zeilen.join('\n');
}

function ohneUeberschrift(doc: Node): Node {
  let anders = false;
  const kinder: Node[] = [];
  doc.forEach((knoten) => {
    if (knoten.type.name !== 'ueberschrift') {
      kinder.push(knoten);
      return;
    }
    anders = true;
    const quelle = String(knoten.attrs.quelle ?? '');
    kinder.push(absatzMit(kernQuelle(quelle), quelle));
  });
  if (!anders) return doc;
  return modell.node('doc', null, kinder);
}

function literal(text: string): Node {
  if (text.length === 0) return modell.node('doc', null, [absatzMit('')]);
  return modell.node('doc', null, text.split('\n').map((zeile) => absatzMit(zeile)));
}

export function dokumentFuer(text: string): Node {
  try {
    const doc = ohneUeberschrift(lade(text));
    if (textAusDokument(doc) === text) {
      if (doc.childCount === 0) return literal('');
      return doc;
    }
  } catch {
    return literal(text);
  }
  return literal(text);
}

function rohGrenzen(doc: Node, text: string): number[] {
  const grenze = new Array<number>(text.length + 1);
  let offset = 0;
  let blockPos = 0;
  for (let i = 0; i < doc.childCount; i += 1) {
    const knoten = doc.child(i);
    const inhalt = knoten.type.name === 'leerzeile' ? '' : knoten.textContent;
    const stellen: number[] = [];
    knoten.descendants((node, rel) => {
      if (!node.isText || !node.text) return;
      for (let k = 0; k < node.text.length; k += 1) stellen.push(blockPos + 1 + rel + k);
    });
    for (let k = 0; k < inhalt.length && offset < text.length; k += 1) {
      grenze[offset] = stellen[k] ?? blockPos + 1;
      offset += 1;
    }
    const nach = stellen.length > 0 ? stellen[stellen.length - 1]! + 1 : blockPos + 1;
    blockPos += knoten.nodeSize;
    if (i < doc.childCount - 1 && offset < text.length && text[offset] === '\n') {
      grenze[offset] = nach;
      offset += 1;
    }
  }
  const ende = TextSelection.atEnd(doc).from;
  for (let i = 0; i <= text.length; i += 1) {
    if (grenze[i] === undefined) grenze[i] = ende;
  }
  grenze[text.length] = ende;
  return grenze;
}

export function rohPos(doc: Node, text: string, offset: number): number {
  const grenze = rohGrenzen(doc, text);
  const safe = Math.max(0, Math.min(offset, text.length));
  return Math.max(0, Math.min(grenze[safe] ?? 0, doc.content.size));
}

export function rohOffset(doc: Node, text: string, pos: number): number {
  const grenze = rohGrenzen(doc, text);
  let fund = 0;
  for (let i = 0; i < grenze.length; i += 1) {
    if (grenze[i] === pos) fund = i;
  }
  return fund;
}

export function auswahlAn(doc: Node, text: string, stelle: number): Selection {
  const pos = rohPos(doc, text, stelle);
  return TextSelection.near(doc.resolve(pos));
}

export function auswahlZwischen(doc: Node, text: string, anchor: number, head: number): Selection {
  try {
    const von = rohPos(doc, text, anchor);
    const bis = rohPos(doc, text, head);
    return TextSelection.between(doc.resolve(von), doc.resolve(bis));
  } catch {
    return auswahlAn(doc, text, head);
  }
}

export function hatUeberschrift(doc: Node): boolean {
  let gefunden = false;
  doc.descendants((knoten) => {
    if (knoten.type.name === 'ueberschrift') gefunden = true;
  });
  return gefunden;
}
