import { type Node } from 'prosemirror-model';
import { closeHistory } from 'prosemirror-history';
import { EditorState, NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import { ART, type Beleg } from './baum.ts';
import { lade } from './laden.ts';
import { leseDokument } from './lesen.ts';
import { punktInhalt, punktTaste, type PunktArt } from './punkt.ts';
import { speichere } from './speichern.ts';

interface Spanne {
  von: number;
  bis: number;
}

function quellzeilen(text: string): Spanne[] {
  if (text.length === 0) return [];
  const aus: Spanne[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '\n') continue;
    aus.push({ von: start, bis: i + 1 });
    start = i + 1;
  }
  if (start < text.length) aus.push({ von: start, bis: text.length });
  return aus;
}

function kernBis(text: string, zeile: Spanne): number {
  let bis = zeile.bis;
  if (bis > zeile.von && text[bis - 1] === '\n') bis -= 1;
  if (bis > zeile.von && text[bis - 1] === '\r') bis -= 1;
  return bis;
}

function markerIn(belege: readonly Beleg[], von: number, bis: number): Array<[number, number]> {
  const aus: Array<[number, number]> = [];
  for (const beleg of belege) {
    for (const spanne of beleg.marker) {
      if (spanne[1] <= von || spanne[0] >= bis) continue;
      aus.push(spanne);
    }
  }
  return aus;
}

function verdeckt(spannen: ReadonlyArray<readonly [number, number]>, index: number): boolean {
  for (const [von, bis] of spannen) {
    if (index >= von && index < bis) return true;
  }
  return false;
}

function grenzen(text: string, zeile: Spanne): Spanne {
  const bis = kernBis(text, zeile);
  const probe = zeile.von < text.length ? zeile.von : text.length;
  const ort = probe < text.length ? punktInhalt(text, probe) : null;
  if (!ort || ort.von < zeile.von || ort.von > bis) return { von: zeile.von, bis };
  return { von: ort.von, bis: Math.min(ort.bis, bis) };
}

function indexBeiOffset(text: string, belege: readonly Beleg[], zeile: Spanne, offset: number): number {
  const feld = grenzen(text, zeile);
  const spannen = markerIn(belege, feld.von, feld.bis);
  const ziel = Math.max(0, offset);
  let gesehen = 0;
  let letzte = feld.von;
  for (let i = feld.von; i < feld.bis; i += 1) {
    if (verdeckt(spannen, i)) continue;
    if (gesehen === ziel) return i;
    gesehen += 1;
    letzte = i + 1;
  }
  return letzte;
}

function offsetBeiIndex(text: string, belege: readonly Beleg[], zeile: Spanne, index: number): number {
  const feld = grenzen(text, zeile);
  if (index <= feld.von) return 0;
  const spannen = markerIn(belege, feld.von, feld.bis);
  let gesehen = 0;
  for (let i = feld.von; i < feld.bis && i < index; i += 1) {
    if (!verdeckt(spannen, i)) gesehen += 1;
  }
  return gesehen;
}

function zeileAn(zeilen: readonly Spanne[], index: number, text: string): number {
  for (let i = 0; i < zeilen.length; i += 1) {
    const zeile = zeilen[i]!;
    const letzte = i === zeilen.length - 1 && index === text.length;
    if (index >= zeile.von && (index < zeile.bis || letzte)) return i;
  }
  return -1;
}

function knotenPos(doc: Node, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
  return pos;
}

function kindAn(doc: Node, pos: number): { index: number; rel: number } | null {
  let nodePos = 0;
  for (let i = 0; i < doc.childCount; i += 1) {
    const node = doc.child(i);
    const ende = nodePos + node.nodeSize;
    if (pos === nodePos || (pos > nodePos && pos < ende) || (i === doc.childCount - 1 && pos === ende)) {
      return { index: i, rel: pos - nodePos };
    }
    nodePos = ende;
  }
  return null;
}

export function stelleImModell(doc: Node, text: string, index: number): number | null {
  const zeilen = quellzeilen(text);
  if (zeilen.length !== doc.childCount) return null;
  if (doc.childCount === 0) return index === 0 ? 0 : null;
  const nummer = zeileAn(zeilen, index, text);
  if (nummer < 0) return null;
  const node = doc.child(nummer);
  const pos = knotenPos(doc, nummer);
  if (node.isLeaf) return pos;
  const belege = leseDokument(text).belege;
  const offset = offsetBeiIndex(text, belege, zeilen[nummer]!, index);
  return pos + 1 + Math.min(offset, node.content.size);
}

function quelleAn(doc: Node, text: string, pos: number): number | null {
  const zeilen = quellzeilen(text);
  if (zeilen.length !== doc.childCount) return null;
  if (doc.childCount === 0) return 0;
  const fund = kindAn(doc, pos);
  if (!fund) return null;
  const node = doc.child(fund.index);
  const zeile = zeilen[fund.index]!;
  if (node.isLeaf) return zeile.von;
  const belege = leseDokument(text).belege;
  return indexBeiOffset(text, belege, zeile, Math.max(0, fund.rel - 1));
}

export function stelleInQuelle(doc: Node, text: string, selection: Selection): number | null {
  const pos = selection instanceof NodeSelection ? selection.from : selection.head;
  return quelleAn(doc, text, pos);
}

function auswahlAn(doc: Node, pos: number): Selection {
  if (doc.childCount === 0) return Selection.atStart(doc);
  const ziel = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(ziel);
  if ($pos.parent.inlineContent) return TextSelection.create(doc, ziel);
  const knoten = $pos.nodeAfter;
  if (knoten?.isAtom && NodeSelection.isSelectable(knoten)) return NodeSelection.create(doc, ziel);
  return Selection.near($pos);
}

function wende(zustand: EditorState, text: string, doc: Node, index: number): EditorState | null {
  const pos = stelleImModell(doc, text, index);
  if (pos === null) return null;
  const tr = zustand.tr.replaceWith(0, zustand.doc.content.size, doc.content);
  tr.setSelection(auswahlAn(tr.doc, pos));
  tr.scrollIntoView();
  return zustand.apply(closeHistory(tr));
}

export function punktModell(zustand: EditorState, art: PunktArt): EditorState | null {
  if (!zustand.selection.empty) return null;
  const text = speichere(zustand.doc);
  const index = stelleInQuelle(zustand.doc, text, zustand.selection);
  if (index === null) return null;
  const wahl = punktTaste(text, index, index, art);
  if (!wahl) return null;
  let doc: Node;
  try {
    doc = lade(wahl.text);
  } catch {
    return null;
  }
  return wende(zustand, wahl.text, doc, wahl.start);
}

export function nummerBruch(zustand: EditorState): EditorState | null {
  const { selection } = zustand;
  if (!(selection instanceof TextSelection)) return null;
  const eltern = selection.$from.parent;
  if (eltern.type.name !== 'punkt' || eltern.attrs.art !== ART.nummer) return null;
  if (!selection.empty && selection.$to.parent !== eltern) return null;
  const text = speichere(zustand.doc);
  const von = quelleAn(zustand.doc, text, selection.from);
  const bis = quelleAn(zustand.doc, text, selection.to);
  if (von === null || bis === null || bis < von) return null;
  let neu = `${text.slice(0, von)}\n${text.slice(bis)}`;
  if (quellzeilen(neu).length === quellzeilen(text).length) neu = `${neu}\n`;
  let doc: Node;
  try {
    doc = lade(neu);
  } catch {
    return null;
  }
  return wende(zustand, neu, doc, von + 1);
}
