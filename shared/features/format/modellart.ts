import { closeHistory } from 'prosemirror-history';
import type { Node, NodeType } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { ART } from './baum.ts';
import { type NummerArt } from './nummer.ts';
import { formatVon } from './register.ts';

interface Zeile {
  node: Node;
  pos: number;
}

function wende(zustand: EditorState, tr: Transaction): EditorState {
  if (!tr.docChanged) return zustand;
  return zustand.apply(closeHistory(tr));
}

function knotenTyp(zustand: EditorState, name: string): NodeType {
  const typ = zustand.schema.nodes[name];
  if (!typ) throw new Error('missing block');
  return typ;
}

function zeilenDerAuswahl(zustand: EditorState): Zeile[] {
  const { doc, selection } = zustand;
  const { from, to } = selection;
  const aus: Zeile[] = [];
  doc.forEach((node, offset) => {
    const ende = offset + node.nodeSize;
    const trifft = from === to ? from > offset && from < ende : from < ende && to > offset;
    if (trifft) aus.push({ node, pos: offset });
  });
  return aus;
}

function istArt(node: Node, art: NummerArt): boolean {
  return node.type.name === 'punkt' && node.attrs.art === ART.nummer && String(node.attrs.nummerArt ?? '') === art;
}

function alsText(zustand: EditorState, tr: Transaction, zeile: Zeile): void {
  const leer = zeile.node.textContent.length === 0;
  tr.setNodeMarkup(tr.mapping.map(zeile.pos), knotenTyp(zustand, leer ? 'leerzeile' : 'absatz'), { quelle: '' });
}

export function nummerAktiv(zustand: EditorState, art: NummerArt): boolean {
  const zeilen = zeilenDerAuswahl(zustand);
  return zeilen.length > 0 && zeilen.every((zeile) => istArt(zeile.node, art));
}

export function wechselNummer(zustand: EditorState, art: NummerArt): EditorState {
  const zeilen = zeilenDerAuswahl(zustand);
  if (zeilen.length === 0) return zustand;
  const tr = zustand.tr;
  if (zeilen.every((zeile) => istArt(zeile.node, art))) {
    for (const zeile of zeilen) alsText(zustand, tr, zeile);
    return wende(zustand, tr);
  }
  const gewaehlt = new Set(zeilen.map((zeile) => zeile.pos));
  const zeichen = formatVon(ART.nummer).zeichen[0] ?? '';
  const punkt = knotenTyp(zustand, 'punkt');
  let nummer = 0;
  let pos = 0;
  zustand.doc.forEach((node) => {
    const dabei = gewaehlt.has(pos);
    const leer = node.textContent.length === 0;
    const wird = dabei ? !leer : istArt(node, art);
    if (!wird) nummer = 0;
    else {
      nummer += 1;
      const schon = istArt(node, art) && Number(node.attrs.nummer) === nummer;
      if (dabei && !schon) {
        const einzug = node.type.name === 'punkt' ? Number(node.attrs.einzug) : 0;
        tr.setNodeMarkup(tr.mapping.map(pos), punkt, {
          art: ART.nummer,
          abgehakt: false,
          zeichen,
          einzug: Number.isFinite(einzug) ? einzug : 0,
          nummerArt: art,
          nummer,
          quelle: '',
        });
      }
    }
    pos += node.nodeSize;
  });
  return wende(zustand, tr);
}
