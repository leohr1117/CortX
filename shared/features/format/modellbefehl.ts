import { closeHistory } from 'prosemirror-history';
import { type Mark, type MarkType, type Node, type NodeType, type Schema } from 'prosemirror-model';
import { EditorState, type Transaction } from 'prosemirror-state';
import { ART } from './baum.ts';
import { formatVon, inlineFormate, leistenEintraege, type FormatId } from './register.ts';

export interface ModellSchalt {
  run: (zustand: EditorState, ziel?: string) => EditorState;
  isActive: (zustand: EditorState) => boolean;
}

interface Zeile {
  node: Node;
  pos: number;
}

interface Bereich {
  from: number;
  to: number;
}

function wende(zustand: EditorState, tr: Transaction): EditorState {
  if (!tr.docChanged && !tr.storedMarksSet) return zustand;
  return zustand.apply(closeHistory(tr));
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

function nurCodeblock(zustand: EditorState): boolean {
  const zeilen = zeilenDerAuswahl(zustand);
  return zeilen.length > 0 && zeilen.every((zeile) => zeile.node.type.name === 'codeblock');
}

function wirklicheMarks(zustand: EditorState): readonly Mark[] {
  if (zustand.storedMarks) return zustand.storedMarks;
  return zustand.selection.$from.marks();
}

function vollstaendig(zustand: EditorState, typ: MarkType): boolean {
  const { from, to } = zustand.selection;
  let gesehen = false;
  let fehlt = false;
  zustand.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || !node.text || fehlt) return;
    const start = Math.max(from, pos);
    const ende = Math.min(to, pos + node.nodeSize);
    if (start >= ende) return;
    const stueck = node.text.slice(start - pos, ende - pos);
    if (!/\S/u.test(stueck)) return;
    gesehen = true;
    if (!typ.isInSet(node.marks)) fehlt = true;
  });
  return gesehen && !fehlt;
}

function schneideLeer(doc: Node, from: number, to: number): Bereich {
  const zeichen: Bereich[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || !node.text) return;
    for (let index = 0; index < node.text.length; index += 1) {
      const stelle = pos + index;
      if (stelle < from || stelle >= to) continue;
      const z = node.text[index] ?? '';
      if (/\s/u.test(z)) continue;
      zeichen.push({ from: stelle, to: stelle + 1 });
    }
  });
  const erste = zeichen[0];
  const letzte = zeichen[zeichen.length - 1];
  if (!erste || !letzte) return { from, to: from };
  return { from: erste.from, to: letzte.to };
}

type Verhalten = 'link' | 'code' | 'wichtig' | 'marke' | 'block';

function verhalten(id: FormatId): Verhalten {
  const eintrag = formatVon(id);
  if (eintrag.marken) return 'link';
  if (eintrag.syntax?.zaun) return 'code';
  if (eintrag.inline && eintrag.syntax?.zeile) return 'wichtig';
  if (eintrag.inline) return 'marke';
  return 'block';
}

function istArt(node: Node, id: FormatId): boolean {
  const eintrag = formatVon(id);
  if (!eintrag.knoten || node.type.name !== eintrag.knoten) return false;
  if (eintrag.knoten === 'punkt') return node.attrs.art === id;
  return true;
}

function knotenTyp(schema: Schema, name: string): NodeType {
  const typ = schema.nodes[name];
  if (!typ) throw new Error('missing block');
  return typ;
}

function blockAttrs(node: Node, id: FormatId): Record<string, unknown> {
  const eintrag = formatVon(id);
  const attrs: Record<string, unknown> = { quelle: '' };
  if (eintrag.knoten === 'punkt') {
    const einzug = node.type.name === 'punkt' ? Number(node.attrs.einzug) : 0;
    attrs.art = id;
    attrs.abgehakt = false;
    attrs.zeichen = eintrag.zeichen[0] ?? '';
    attrs.einzug = Number.isFinite(einzug) ? einzug : 0;
  }
  if (eintrag.knoten === 'ueberschrift') {
    attrs.stufe = 0;
    attrs.zeichen = eintrag.zeichen[0] ?? '';
  }
  if (eintrag.knoten === 'codeblock') attrs.zaun = eintrag.zeichen[0] ?? '';
  return attrs;
}

function textZiel(schema: Schema, node: Node): { type: NodeType; attrs: { quelle: string } } {
  if (node.textContent.length === 0) return { type: knotenTyp(schema, 'leerzeile'), attrs: { quelle: '' } };
  return { type: knotenTyp(schema, 'absatz'), attrs: { quelle: '' } };
}

function schalteBlock(zustand: EditorState, id: FormatId): EditorState {
  const eintrag = formatVon(id);
  if (!eintrag.knoten) return zustand;
  const zeilen = zeilenDerAuswahl(zustand);
  if (zeilen.length === 0) return zustand;
  const aus = zeilen.every((zeile) => istArt(zeile.node, id));
  const tr = zustand.tr;
  for (const zeile of zeilen) {
    if (aus) {
      const ziel = textZiel(zustand.schema, zeile.node);
      tr.setNodeMarkup(zeile.pos, ziel.type, ziel.attrs);
      continue;
    }
    tr.setNodeMarkup(zeile.pos, knotenTyp(zustand.schema, eintrag.knoten), blockAttrs(zeile.node, id));
  }
  return wende(zustand, tr);
}

function schalteMarke(zustand: EditorState, id: FormatId): EditorState {
  if (nurCodeblock(zustand)) return zustand;
  const typ = zustand.schema.marks[id];
  if (!typ) return zustand;
  if (zustand.selection.empty) {
    const tr = zustand.tr;
    if (typ.isInSet(wirklicheMarks(zustand))) tr.removeStoredMark(typ);
    else tr.addStoredMark(typ.create());
    return wende(zustand, tr);
  }
  const { from, to } = zustand.selection;
  const tr = zustand.tr;
  if (vollstaendig(zustand, typ)) tr.removeMark(from, to, typ);
  else {
    const bereich = schneideLeer(zustand.doc, from, to);
    if (bereich.from >= bereich.to) return zustand;
    tr.addMark(bereich.from, bereich.to, typ.create());
  }
  return wende(zustand, tr);
}

function codeGruppe(doc: Node, gewaehlt: readonly Zeile[]): Zeile[] {
  const alle: Zeile[] = [];
  doc.forEach((node, offset) => alle.push({ node, pos: offset }));
  let start = alle.findIndex((zeile) => zeile.pos === gewaehlt[0]?.pos);
  let ende = alle.findIndex((zeile) => zeile.pos === gewaehlt[gewaehlt.length - 1]?.pos);
  if (start < 0 || ende < 0) return [];
  while (start > 0 && alle[start - 1]?.node.type.name === 'codeblock') start -= 1;
  while (ende + 1 < alle.length && alle[ende + 1]?.node.type.name === 'codeblock') ende += 1;
  return alle.slice(start, ende + 1);
}

function codeAus(zustand: EditorState): EditorState {
  const gruppe = codeGruppe(zustand.doc, zeilenDerAuswahl(zustand));
  const erste = gruppe[0];
  const letzte = gruppe[gruppe.length - 1];
  if (!erste || !letzte) return zustand;
  const knoten = gruppe.flatMap((zeile, index) => {
    const rand = index === 0 || index === gruppe.length - 1;
    if (rand && zeile.node.textContent.length === 0) return [];
    const text = zeile.node.textContent;
    if (text.length === 0) return [knotenTyp(zustand.schema, 'leerzeile').create({ quelle: '' })];
    return [knotenTyp(zustand.schema, 'absatz').create({ quelle: '' }, zustand.schema.text(text))];
  });
  return wende(zustand, zustand.tr.replaceWith(erste.pos, letzte.pos + letzte.node.nodeSize, knoten));
}

function codeAn(zustand: EditorState): EditorState {
  const zeilen = zeilenDerAuswahl(zustand);
  const erste = zeilen[0];
  const letzte = zeilen[zeilen.length - 1];
  if (!erste || !letzte) return zustand;
  const typ = knotenTyp(zustand.schema, 'codeblock');
  const zaun = formatVon(ART.codeblock).zeichen[0] ?? '';
  const inhalt = zeilen.map((zeile) => {
    const text = zeile.node.textContent;
    return text.length === 0 ? typ.create({ zaun, quelle: '' }) : typ.create({ zaun, quelle: '' }, zustand.schema.text(text));
  });
  const knoten = [typ.create({ zaun, quelle: '' }), ...inhalt, typ.create({ zaun, quelle: '' })];
  return wende(zustand, zustand.tr.replaceWith(erste.pos, letzte.pos + letzte.node.nodeSize, knoten));
}

function schalteCode(zustand: EditorState): EditorState {
  if (nurCodeblock(zustand)) return codeAus(zustand);
  if (zeilenDerAuswahl(zustand).length > 1) return codeAn(zustand);
  return schalteMarke(zustand, ART.code);
}

function zielName(): string {
  const name = Object.keys(formatVon(ART.link).marken ?? {})[0];
  if (!name) throw new Error('missing attribute');
  return name;
}

function markenSpanne(zustand: EditorState, typ: MarkType): Bereich | null {
  if (!zustand.selection.empty) return null;
  const $pos = zustand.selection.$from;
  const mark = typ.isInSet($pos.marks());
  if (!mark) return null;
  let cursor = $pos.start();
  let laufVon = -1;
  let laufBis = -1;
  let treffer: Bereich | null = null;
  $pos.parent.forEach((kind) => {
    const start = cursor;
    const ende = start + kind.nodeSize;
    cursor = ende;
    const vorhanden = kind.isText ? typ.isInSet(kind.marks) : undefined;
    if (vorhanden?.eq(mark)) {
      if (laufVon < 0) laufVon = start;
      laufBis = ende;
      return;
    }
    if (laufVon >= 0 && laufVon <= $pos.pos && $pos.pos <= laufBis) treffer = { from: laufVon, to: laufBis };
    laufVon = -1;
  });
  if (laufVon >= 0 && laufVon <= $pos.pos && $pos.pos <= laufBis) treffer = { from: laufVon, to: laufBis };
  return treffer;
}

function einzigesZiel(zustand: EditorState, typ: MarkType, name: string): string | null {
  const { from, to } = zustand.selection;
  let ziel: string | null = null;
  let gemischt = false;
  zustand.doc.nodesBetween(from, to, (node) => {
    if (!node.isText || gemischt) return;
    const mark = typ.isInSet(node.marks);
    if (!mark) return;
    const wert = String(mark.attrs[name] ?? '');
    if (ziel === null) ziel = wert;
    else if (ziel !== wert) gemischt = true;
  });
  return gemischt ? null : ziel;
}

function schalteLink(zustand: EditorState, ziel: string | undefined): EditorState {
  if (nurCodeblock(zustand)) return zustand;
  const typ = zustand.schema.marks[ART.link];
  if (!typ) return zustand;
  const name = zielName();
  if (zustand.selection.empty) {
    const spanne = markenSpanne(zustand, typ);
    if (spanne && ziel === '') return wende(zustand, zustand.tr.removeMark(spanne.from, spanne.to, typ));
    if (spanne && ziel) {
      const tr = zustand.tr;
      tr.removeMark(spanne.from, spanne.to, typ);
      tr.addMark(spanne.from, spanne.to, typ.create({ [name]: ziel }));
      return wende(zustand, tr);
    }
    if (!spanne && ziel) return wende(zustand, zustand.tr.addStoredMark(typ.create({ [name]: ziel })));
    return zustand;
  }
  const { from, to } = zustand.selection;
  const voll = vollstaendig(zustand, typ);
  if (voll && (ziel === undefined || ziel === '' || ziel === einzigesZiel(zustand, typ, name))) {
    return wende(zustand, zustand.tr.removeMark(from, to, typ));
  }
  if (!ziel) return zustand;
  const bereich = schneideLeer(zustand.doc, from, to);
  if (bereich.from >= bereich.to) return zustand;
  const tr = zustand.tr;
  tr.removeMark(bereich.from, bereich.to, typ);
  tr.addMark(bereich.from, bereich.to, typ.create({ [name]: ziel }));
  return wende(zustand, tr);
}

function schalteWichtig(zustand: EditorState): EditorState {
  if (nurCodeblock(zustand)) return zustand;
  if (zustand.selection.empty) return schalteBlock(zustand, ART.wichtig);
  return schalteMarke(zustand, ART.wichtig);
}

function markeAktiv(zustand: EditorState, id: FormatId): boolean {
  if (nurCodeblock(zustand)) return false;
  const typ = zustand.schema.marks[id];
  if (!typ) return false;
  if (zustand.selection.empty) return typ.isInSet(wirklicheMarks(zustand)) != null;
  return vollstaendig(zustand, typ);
}

function istAktiv(id: FormatId, zustand: EditorState): boolean {
  const art = verhalten(id);
  if (art === 'block') {
    const zeilen = zeilenDerAuswahl(zustand);
    return zeilen.length > 0 && zeilen.every((zeile) => istArt(zeile.node, id));
  }
  if (art === 'code') {
    if (zeilenDerAuswahl(zustand).some((zeile) => zeile.node.type.name === 'codeblock')) return nurCodeblock(zustand);
    if (zeilenDerAuswahl(zustand).length > 1) return false;
    return markeAktiv(zustand, id);
  }
  if (art === 'wichtig') {
    if (nurCodeblock(zustand)) return false;
    if (zustand.selection.empty && zeilenDerAuswahl(zustand).every((zeile) => istArt(zeile.node, id)) && zeilenDerAuswahl(zustand).length > 0) {
      return true;
    }
  }
  return markeAktiv(zustand, id);
}

export function entferneFormatierung(zustand: EditorState): EditorState {
  const tr = zustand.tr;
  if (!zustand.selection.empty) {
    const { from, to } = zustand.selection;
    for (const format of inlineFormate()) {
      const typ = zustand.schema.marks[format.id];
      if (typ) tr.removeMark(from, to, typ);
    }
  }
  tr.setStoredMarks([]);
  return wende(zustand, tr);
}

export function modellSchalt(id: FormatId): ModellSchalt {
  return {
    run(zustand, ziel) {
      const art = verhalten(id);
      if (art === 'link') return schalteLink(zustand, ziel);
      if (art === 'code') return schalteCode(zustand);
      if (art === 'wichtig') return schalteWichtig(zustand);
      if (art === 'block') return schalteBlock(zustand, id);
      return schalteMarke(zustand, id);
    },
    isActive(zustand) {
      return istAktiv(id, zustand);
    },
  };
}

for (const eintrag of leistenEintraege()) {
  Object.defineProperty(eintrag, 'modell', {
    enumerable: true,
    get() {
      return modellSchalt(eintrag.id);
    },
  });
}
