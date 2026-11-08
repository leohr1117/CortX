import { inputRules, InputRule } from 'prosemirror-inputrules';
import type { MarkType, Node } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { ART } from '../../../../shared/features/format/baum.ts';
import { formatVon, inlineFormate } from '../../../../shared/features/format/register.ts';
import { kuerzelAn } from './kuerzelSpeicher.ts';

interface Paar {
  marker: string;
  marke: string;
}

const FLUCHT = 'fluchtMark';
const frischKey = new PluginKey<boolean>('inlineFrisch');
const TIPP_PAAR: readonly Paar[] = [{ marker: '==', marke: ART.wichtig }];

function paare(): Paar[] {
  const aus: Paar[] = [];
  for (const format of inlineFormate()) {
    for (const paar of formatVon(format.id).syntax?.paare ?? []) {
      if (!paar.knopf || paar.marker.length === 0) continue;
      aus.push({ marker: paar.marker, marke: format.id });
    }
  }
  for (const paar of TIPP_PAAR) {
    if (paar.marker.length === 0) continue;
    if (aus.some((bekannt) => bekannt.marker === paar.marker)) continue;
    aus.push(paar);
  }
  aus.sort((a, b) => b.marker.length - a.marker.length || a.marke.localeCompare(b.marke));
  return aus;
}

function muster(paar: Paar): RegExp {
  const zeichen = paar.marker[0] ?? '';
  const esc = (wert: string) => wert.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wieder = zeichen ? `(?<!${esc(zeichen)})` : '';
  const anfang = paar.marke === ART.wichtig ? '(?<=^|\\s|\\()' : '';
  return new RegExp(`${anfang}${wieder}${esc(paar.marker)}([^${esc(zeichen)}\\n]+)${esc(paar.marker)}$`);
}

function imCode(state: EditorState, start: number): boolean {
  const $start = state.doc.resolve(start);
  if ($start.parent.type.spec.code) return true;
  return $start.marks().some((mark) => mark.type.name === ART.code || mark.type.spec.code);
}

function wandle(state: EditorState, match: RegExpMatchArray, start: number, end: number, typ: MarkType): Transaction | null {
  const innen = match[1];
  if (!innen || imCode(state, start)) return null;
  let tr = state.tr.insertText(innen, start, end);
  tr = tr.addMark(start, start + innen.length, typ.create());
  return tr.removeStoredMark(typ).setMeta(frischKey, true);
}

function regeln(an: () => boolean): InputRule[] {
  return paare().map((paar) => new InputRule(muster(paar), (state, match, start, end) => {
    if (!an()) return null;
    const typ = state.schema.marks[paar.marke];
    if (!typ) return null;
    return wandle(state, match, start, end, typ);
  }, { undoable: false }));
}

function frischPlugin(): Plugin<boolean> {
  return new Plugin({
    key: frischKey,
    state: {
      init: () => false,
      apply(tr, wert) {
        const marke = tr.getMeta(frischKey);
        if (marke === true) return true;
        if (marke === false) return false;
        if (tr.docChanged || tr.selectionSet) return false;
        return wert;
      },
    },
  });
}

function weiteDavor(knoten: Node, offset: number): number {
  if (offset < 2) return 1;
  const paar = knoten.textBetween(offset - 2, offset);
  if (paar.length !== 2) return 1;
  const hoch = paar.charCodeAt(0);
  const tief = paar.charCodeAt(1);
  if (hoch >= 0xd800 && hoch <= 0xdbff && tief >= 0xdc00 && tief <= 0xdfff) return 2;
  return 1;
}

export function inlineRuecktaste(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (frischKey.getState(state) !== true) return false;
  const sel = state.selection;
  if (!(sel instanceof TextSelection) || !sel.empty) return false;
  const cursor = sel.$cursor;
  if (!cursor || cursor.parentOffset <= 0) return false;
  const weite = weiteDavor(cursor.parent, cursor.parentOffset);
  if (dispatch) dispatch(state.tr.delete(cursor.pos - weite, cursor.pos).setMeta(frischKey, true));
  return true;
}

function markiere(transactions: readonly Transaction[], alt: EditorState, neu: EditorState, an: () => boolean): Transaction | null {
  if (an()) return null;
  if (alt.doc.childCount !== neu.doc.childCount) return null;
  if (transactions.some((tr) => tr.getMeta(FLUCHT))) return null;
  if (!transactions.some((tr) => tr.docChanged && !tr.getMeta('programm'))) return null;
  const stellen: number[] = [];
  neu.doc.forEach((node: Node, offset: number, index: number) => {
    if (node.type.name !== 'absatz' || node.attrs.flucht === true) return;
    if (alt.doc.child(index).eq(node)) return;
    stellen.push(offset);
  });
  if (stellen.length === 0) return null;
  let tr = neu.tr;
  for (const offset of stellen) {
    const node = tr.doc.nodeAt(offset);
    if (!node) continue;
    tr = tr.setNodeMarkup(offset, undefined, { ...node.attrs, flucht: true });
  }
  return tr.setMeta(FLUCHT, true);
}

export function inlinePlugins(an: () => boolean = kuerzelAn): Plugin[] {
  return [
    frischPlugin(),
    inputRules({ rules: regeln(an) }),
    new Plugin({
      appendTransaction(transactions, alt, neu) {
        return markiere(transactions, alt, neu, an);
      },
    }),
  ];
}
