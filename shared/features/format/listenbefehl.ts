import { closeHistory } from 'prosemirror-history';
import { type Node } from 'prosemirror-model';
import { EditorState, NodeSelection, Selection, TextSelection, type Transaction } from 'prosemirror-state';
import { ART } from './baum.ts';
import { lade } from './laden.ts';
import { modell } from './modell.ts';
import { naechsterMarker, type PunktArt } from './punkt.ts';
import { hakenVon, listenLaenge } from './zeile.ts';

function kernVon(quelle: string): string {
  const ohne = quelle.endsWith('\n') ? quelle.slice(0, -1) : quelle;
  return ohne.endsWith('\r') ? ohne.slice(0, -1) : ohne;
}

function istFortsetzung(node: Node): boolean {
  return node.type.name === 'punkt' && kernVon(String(node.attrs.quelle ?? '')).startsWith(' ');
}

function knotenPos(doc: Node, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
  return pos;
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

function quelleMitUmbruch(quelle: string): string {
  if (quelle.endsWith('\n')) return quelle;
  if (quelle.endsWith('\r')) return `${quelle.slice(0, -1)}\n`;
  return `${quelle}\n`;
}

function mitUmbruch(node: Node): Node {
  const quelle = String(node.attrs.quelle ?? '');
  const neu = quelleMitUmbruch(quelle);
  if (neu === quelle) return node;
  const inhalt = node.content.size > 0 ? node.content : null;
  return node.type.createChecked({ ...node.attrs, quelle: neu }, inhalt);
}

function markerVon(node: Node): string | null {
  const kern = kernVon(String(node.attrs.quelle ?? ''));
  if (kern.startsWith(' ')) return null;
  if (kern.length > 0) {
    const haken = hakenVon(kern);
    if (haken) return kern.slice(0, haken.laenge);
    const laenge = listenLaenge(kern);
    if (laenge > 0) return kern.slice(0, laenge);
  }
  const art = String(node.attrs.art ?? '');
  if (art === ART.haken) {
    const zeichen = String(node.attrs.zeichen ?? (node.attrs.abgehakt === true ? '[x]' : '[]'));
    return zeichen.endsWith(' ') ? zeichen : `${zeichen} `;
  }
  if (art === ART.liste) {
    const zeichen = String(node.attrs.zeichen ?? '-');
    return zeichen === '*' || zeichen === '+' || zeichen === '-' ? `${zeichen} ` : '- ';
  }
  return null;
}

function kopfIndex(doc: Node, index: number): number {
  let cursor = index;
  while (cursor > 0 && istFortsetzung(doc.child(cursor))) cursor -= 1;
  return cursor;
}

function naechsterVon(doc: Node, index: number): string | null {
  const kopf = doc.child(kopfIndex(doc, index));
  const marker = markerVon(kopf);
  if (!marker) return null;
  return naechsterMarker(marker, kopf.attrs.abgehakt === true);
}

function zeileAus(text: string): Node | null {
  try {
    const doc = lade(text);
    return doc.childCount === 1 ? doc.child(0) : null;
  } catch {
    return null;
  }
}

function punktMit(marker: string, ende: string, inhalt: Node['content']): Node | null {
  const vorlage = zeileAus(`${marker}${ende}`);
  if (!vorlage) return null;
  if (inhalt.size === 0) return vorlage;
  return vorlage.type.createChecked({ ...vorlage.attrs, quelle: `${marker}${ende}` }, inhalt);
}

function fortsetzungMit(vorlage: Node, einzug: number, ende: string, inhalt: Node['content']): Node {
  const leer = ' '.repeat(Math.max(1, einzug));
  return vorlage.type.createChecked(
    { ...vorlage.attrs, quelle: `${leer}${ende}` },
    inhalt.size > 0 ? inhalt : null,
  );
}

function cursorIn(doc: Node, index: number, offset: number): number {
  const start = knotenPos(doc, index);
  const node = doc.child(index);
  if (!node.isTextblock || node.isAtom) return start;
  return start + 1 + Math.max(0, Math.min(offset, node.content.size));
}

function schliesse(zustand: EditorState, tr: Transaction, cursor: number): EditorState | null {
  try {
    tr.setSelection(auswahlAn(tr.doc, cursor));
    tr.setStoredMarks([]);
    tr.scrollIntoView();
    return zustand.apply(closeHistory(tr));
  } catch {
    return null;
  }
}

function ersetze(zustand: EditorState, index: number, knoten: readonly Node[], zielIndex: number, offset: number): EditorState | null {
  const doc = zustand.doc;
  const pos = knotenPos(doc, index);
  const alt = doc.child(index);
  const tr = zustand.tr;
  try {
    if (knoten.length === 0) tr.delete(pos, pos + alt.nodeSize);
    else if (knoten.length === 1) tr.replaceWith(pos, pos + alt.nodeSize, knoten[0]!);
    else tr.replaceWith(pos, pos + alt.nodeSize, knoten as Node[]);
  } catch {
    return null;
  }
  if (tr.doc.childCount === 0) return schliesse(zustand, tr, 0);
  const cursor = cursorIn(tr.doc, Math.min(zielIndex, tr.doc.childCount - 1), offset);
  return schliesse(zustand, tr, cursor);
}

function endeDes(doc: Node, index: number): number {
  const node = doc.child(index);
  if (!node.isTextblock || node.isAtom) return knotenPos(doc, index);
  return knotenPos(doc, index) + 1 + node.content.size;
}

function leererAbsatz(): Node {
  return modell.nodes.absatz!.createChecked({ quelle: '' });
}

function leereZeile(): Node | null {
  return zeileAus('\n');
}

function hebe(zustand: EditorState, index: number): EditorState | null {
  const doc = zustand.doc;
  if (doc.childCount === 1) return ersetze(zustand, index, [], 0, 0);
  if (index === doc.childCount - 1) return ersetze(zustand, index, [leererAbsatz()], index, 0);
  const leer = leereZeile();
  if (!leer) return null;
  return ersetze(zustand, index, [leer], index, 0);
}

function folgeEnde(node: Node, letzter: boolean): string {
  if (!letzter) return '\n';
  return String(node.attrs.quelle ?? '').endsWith('\r') ? '\r' : '';
}

function enter(zustand: EditorState): EditorState | null {
  const $from = zustand.selection.$from;
  const node = $from.parent;
  const index = $from.index(0);
  const offset = $from.parentOffset;
  const leer = node.textContent.trim() === '';
  const fort = istFortsetzung(node);
  if (leer && !fort) return hebe(zustand, index);
  const marker = naechsterVon(zustand.doc, index);
  if (!marker) return null;
  const letzter = index === zustand.doc.childCount - 1;
  const ende = folgeEnde(node, letzter);
  if (leer && fort) {
    const neu = punktMit(marker, ende, node.content.cut(0, 0));
    if (!neu) return null;
    return ersetze(zustand, index, [neu], index, 0);
  }
  const linksInhalt = node.content.cut(0, offset);
  const rechtsInhalt = node.content.cut(offset);
  const rechts = punktMit(marker, ende, rechtsInhalt);
  if (!rechts) return null;
  if (offset === node.content.size) {
    const links = letzter ? mitUmbruch(node) : node;
    return ersetze(zustand, index, [links, rechts], index + 1, 0);
  }
  try {
    const links = node.type.createChecked(
      { ...node.attrs, quelle: quelleMitUmbruch(String(node.attrs.quelle ?? '')) },
      linksInhalt.size > 0 ? linksInhalt : null,
    );
    return ersetze(zustand, index, [links, rechts], index + 1, 0);
  } catch {
    return null;
  }
}

function umbruch(zustand: EditorState): EditorState | null {
  const $from = zustand.selection.$from;
  const node = $from.parent;
  const index = $from.index(0);
  const offset = $from.parentOffset;
  const kopf = zustand.doc.child(kopfIndex(zustand.doc, index));
  const einzug = markerVon(kopf)?.length ?? 0;
  if (einzug < 1) return null;
  const letzter = index === zustand.doc.childCount - 1;
  const ende = folgeEnde(node, letzter);
  const rechtsInhalt = node.content.cut(offset);
  const rechts = fortsetzungMit(kopf, einzug, ende, rechtsInhalt);
  if (offset === node.content.size) {
    const links = letzter ? mitUmbruch(node) : node;
    return ersetze(zustand, index, [links, rechts], index + 1, 0);
  }
  const linksInhalt = node.content.cut(0, offset);
  try {
    const links = node.type.createChecked(
      { ...node.attrs, quelle: quelleMitUmbruch(String(node.attrs.quelle ?? '')) },
      linksInhalt.size > 0 ? linksInhalt : null,
    );
    return ersetze(zustand, index, [links, rechts], index + 1, 0);
  } catch {
    return null;
  }
}

function zurueck(zustand: EditorState): EditorState | null {
  const $from = zustand.selection.$from;
  const node = $from.parent;
  if ($from.parentOffset !== 0 || node.textContent.trim() !== '') return null;
  const index = $from.index(0);
  if (!istFortsetzung(node)) return hebe(zustand, index);
  if (zustand.doc.childCount === 1) return ersetze(zustand, index, [], 0, 0);
  const tr = zustand.tr;
  const pos = knotenPos(zustand.doc, index);
  tr.delete(pos, pos + node.nodeSize);
  const ziel = index === 0 ? 0 : endeDes(tr.doc, index - 1);
  return schliesse(zustand, tr, ziel);
}

export function listenTaste(zustand: EditorState, art: PunktArt): EditorState | null {
  if (!zustand.selection.empty || !(zustand.selection instanceof TextSelection)) return null;
  const node = zustand.selection.$from.parent;
  if (node.type.name !== 'punkt' || String(node.attrs.art ?? '') === ART.nummer) return null;
  if (art === 'zurueck') return zurueck(zustand);
  if (art === 'umbruch') return umbruch(zustand);
  return enter(zustand);
}

export function enterTrenntFormat(zustand: EditorState): EditorState | null {
  const auswahl = zustand.selection;
  if (!auswahl.empty || !(auswahl instanceof TextSelection)) return null;
  const $from = auswahl.$from;
  const node = $from.parent;
  if (!node.isTextblock || node.isAtom || node.type.name === 'punkt' || node.type.name === 'codeblock') return null;
  if ($from.parentOffset !== node.content.size) return null;
  if (!$from.marks().some((mark) => mark.type.spec.inclusive !== false)) return null;
  const index = $from.index(0);
  const letzter = index === zustand.doc.childCount - 1;
  const links = letzter ? mitUmbruch(node) : node;
  const neu = node.type.createChecked({ quelle: '' });
  return ersetze(zustand, index, [links, neu], index + 1, 0);
}
