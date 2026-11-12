import { type Node } from 'prosemirror-model';
import { closeHistory } from 'prosemirror-history';
import { EditorState, NodeSelection, Selection, TextSelection, type Transaction } from 'prosemirror-state';
import { ART, type Beleg } from './baum.ts';
import { leseDokument } from './lesen.ts';
import { istNummerArt } from './nummer.ts';
import { enterTrenntFormat, listenTaste } from './listenbefehl.ts';
import { punktInhalt, type PunktArt } from './punkt.ts';

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

export function punktModell(zustand: EditorState, art: PunktArt): EditorState | null {
  return listenTaste(zustand, art);
}

export { enterTrenntFormat };

function istNummer(node: Node): boolean {
  return node.type.name === 'punkt' && node.attrs.art === ART.nummer && istNummerArt(String(node.attrs.nummerArt ?? ''));
}

function istNummerPunkt(node: Node): boolean {
  return node.type.name === 'punkt' && node.attrs.art === ART.nummer;
}

function kindIndex(doc: Node, pos: number): number {
  let lauf = 0;
  for (let i = 0; i < doc.childCount; i += 1) {
    if (lauf === pos) return i;
    lauf += doc.child(i).nodeSize;
  }
  return -1;
}

function zeilenEnde(quelle: unknown): string {
  const text = String(quelle ?? '');
  if (text.endsWith('\r\n')) return '\r\n';
  if (text.endsWith('\n')) return '\n';
  return '';
}

function renummeriere(tr: Transaction): void {
  const doc = tr.doc;
  const aenderungen: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
  let index = 0;
  let pos = 0;
  while (index < doc.childCount) {
    const start = doc.child(index);
    if (!istNummer(start)) {
      pos += start.nodeSize;
      index += 1;
      continue;
    }
    const art = String(start.attrs.nummerArt);
    let nummer = 1;
    while (index < doc.childCount) {
      const node = doc.child(index);
      if (!istNummer(node) || String(node.attrs.nummerArt) !== art) break;
      if (Number(node.attrs.nummer) !== nummer) {
        aenderungen.push({ pos, attrs: { ...node.attrs, nummer, quelle: zeilenEnde(node.attrs.quelle) } });
      }
      pos += node.nodeSize;
      nummer += 1;
      index += 1;
    }
  }
  for (const aenderung of aenderungen) tr.setNodeMarkup(aenderung.pos, undefined, aenderung.attrs);
}

function schliesse(zustand: EditorState, tr: Transaction, pos: number): EditorState {
  renummeriere(tr);
  tr.setSelection(auswahlAn(tr.doc, pos));
  tr.scrollIntoView();
  return zustand.apply(closeHistory(tr));
}

function leerenPunkt(zustand: EditorState, tr: Transaction, start: number): EditorState | null {
  const node = tr.doc.nodeAt(start);
  const index = kindIndex(tr.doc, start);
  if (!node || index < 0) return null;
  tr.delete(start, start + node.nodeSize);
  return schliesse(zustand, tr, Math.min(start, tr.doc.content.size));
}

function teilePunkt(zustand: EditorState, tr: Transaction): EditorState | null {
  const $pos = tr.selection.$from;
  const node = $pos.parent;
  if (!istNummerPunkt(node)) return null;
  const start = $pos.before();
  const offset = $pos.parentOffset;
  const davor = node.content.cut(0, offset);
  const danach = node.content.cut(offset);
  const attrs = node.attrs as Record<string, unknown>;
  const alt = node.type.createChecked(
    { ...attrs, quelle: offset === node.content.size ? attrs.quelle : '' },
    davor.size > 0 ? davor : null,
  );
  const neu = node.type.createChecked(
    { ...attrs, quelle: '', nummer: Number(attrs.nummer) + 1 },
    danach.size > 0 ? danach : null,
  );
  tr.replaceWith(start, start + node.nodeSize, [alt, neu]);
  return schliesse(zustand, tr, start + alt.nodeSize + 1);
}

function beendeListe(zustand: EditorState, tr: Transaction): EditorState | null {
  const absatz = tr.doc.type.schema.nodes.absatz;
  if (!absatz) return null;
  const start = tr.selection.$from.before();
  const node = tr.doc.nodeAt(start);
  if (!node) return null;
  tr.replaceWith(start, start + node.nodeSize, absatz.create());
  return schliesse(zustand, tr, start + 1);
}

export function nummerEnter(zustand: EditorState): EditorState | null {
  const { selection } = zustand;
  if (!(selection instanceof TextSelection)) return null;
  const eltern = selection.$from.parent;
  if (!istNummer(eltern)) return null;
  if (!selection.empty && selection.$to.parent !== eltern) return null;
  const tr = zustand.tr;
  if (!selection.empty) tr.delete(selection.from, selection.to);
  const node = tr.selection.$from.parent;
  if (!istNummer(node)) return null;
  if (node.textContent.trim() === '') return leerenPunkt(zustand, tr, tr.selection.$from.before());
  return teilePunkt(zustand, tr);
}

export function nummerBruch(zustand: EditorState): EditorState | null {
  const { selection } = zustand;
  if (!(selection instanceof TextSelection)) return null;
  const eltern = selection.$from.parent;
  if (!istNummerPunkt(eltern) || istNummer(eltern)) return null;
  if (!selection.empty && selection.$to.parent !== eltern) return null;
  const tr = zustand.tr;
  if (!selection.empty) tr.delete(selection.from, selection.to);
  const node = tr.selection.$from.parent;
  if (istNummerPunkt(node) && node.textContent.trim() === '') return beendeListe(zustand, tr);
  return teilePunkt(zustand, tr);
}
