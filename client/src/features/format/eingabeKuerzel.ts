import { closeHistory, isHistoryTransaction } from 'prosemirror-history';
import { inputRules, InputRule, undoInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import type { Attrs, NodeType } from 'prosemirror-model';
import { Plugin, TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { ART } from '../../../../shared/features/format/baum.ts';
import { importiere } from '../../../../shared/features/format/md.ts';
import { modell } from '../../../../shared/features/format/modell.ts';
import { KUERZEL_ART, formatVon, kuerzelEintraege } from '../../../../shared/features/format/register.ts';
import { kuerzelAn } from './kuerzelSpeicher.ts';

const SELBST = 'eingabeZurueck';
const FENSTER = 500;
const DOPPEL_MS = 40;

interface Ziel {
  typ: NodeType;
  attrs: Attrs;
}

interface Gebaut {
  muster: RegExp;
  rule: InputRule;
  wende: (state: EditorState, match: RegExpMatchArray, start: number, end: number) => Transaction | null;
}

function esc(wert: string): string {
  return wert.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function blockCode(state: EditorState, pos: number): boolean {
  return state.doc.resolve(pos).parent.type.spec.code === true;
}

function istCodeMarke(mark: { type: { name: string; spec: { code?: unknown } } }): boolean {
  return mark.type.name === ART.code || mark.type.spec.code === true;
}

function bereichHatCode(state: EditorState, von: number, bis: number): boolean {
  if (bis <= von) return false;
  let code = false;
  state.doc.nodesBetween(von, bis, (node) => {
    if (node.isText && node.marks.some(istCodeMarke)) code = true;
  });
  return code;
}

function ganzCode(state: EditorState, von: number, bis: number): boolean {
  if (bis <= von) return false;
  let gesehen = false;
  let luecke = false;
  state.doc.nodesBetween(von, bis, (node) => {
    if (!node.isText) return;
    gesehen = true;
    if (!node.marks.some(istCodeMarke)) luecke = true;
  });
  return gesehen && !luecke;
}

function schon(node: EditorState['doc'], ziel: Ziel, pos: number): boolean {
  const knoten = node.resolve(pos).parent;
  if (knoten.type !== ziel.typ) return false;
  for (const [name, wert] of Object.entries(ziel.attrs)) {
    if (name === 'quelle') continue;
    if (knoten.attrs[name] !== wert) return false;
  }
  return true;
}

function wandleBlock(state: EditorState, start: number, end: number, ziel: Ziel): Transaction | null {
  const $start = state.doc.resolve(start);
  if (!$start.parent.isTextblock || $start.parent.type.spec.code || $start.parentOffset !== 0) return null;
  if (schon(state.doc, ziel, start)) return null;
  const davor = state.doc.resolve($start.before());
  if (!davor.parent.canReplaceWith(davor.index(), davor.index() + 1, ziel.typ)) return null;
  const tr = state.tr.delete(start, end).setBlockType(start, start, ziel.typ, ziel.attrs);
  const innen = tr.mapping.map(start);
  if (tr.doc.resolve(innen).parent.type !== ziel.typ) return null;
  return closeHistory(tr);
}

function wortGebaut(ende: string, marke: string): Gebaut {
  const zeichen = ende[0] ?? '';
  const muster = new RegExp(`(?:^|[\\s(\\[])([^\\s${esc(zeichen)}]+)${esc(ende)}$`);
  const wende = (state: EditorState, match: RegExpMatchArray, start: number, end: number): Transaction | null => {
    if (!kuerzelAn() || end - start < match[0].length) return null;
    const wort = match[1];
    if (!wort || wort.includes('#')) return null;
    const typ = state.schema.marks[marke];
    if (!typ) return null;
    const abstand = match[0].length - wort.length - ende.length;
    const von = start + abstand;
    if (blockCode(state, von)) return null;
    if (state.doc.textBetween(von, end) !== `${wort}${ende}`) return null;
    if (bereichHatCode(state, von, von + wort.length)) {
      if (ganzCode(state, von, end)) return null;
      const code = state.schema.marks[ART.code];
      if (!code) return null;
      return state.tr.addMark(von, end, code.create()).setMeta('addToHistory', false).setMeta('codeRand', true);
    }
    let tr = state.tr.insertText(wort, von, end);
    tr = tr.addMark(von, von + wort.length, typ.create());
    return closeHistory(tr.removeStoredMark(typ));
  };
  return { muster, rule: new InputRule(muster, wende), wende };
}

function zeileGebaut(genau: string, ziel: Ziel): Gebaut {
  const muster = new RegExp(`^${esc(genau)}$`);
  const wende = (state: EditorState, match: RegExpMatchArray, start: number, end: number): Transaction | null => {
    if (!kuerzelAn() || end - start < match[0].length) return null;
    return wandleBlock(state, start, end, ziel);
  };
  return { muster, rule: new InputRule(muster, wende), wende };
}

function knoten(name: string): NodeType {
  const typ = modell.nodes[name];
  if (!typ) throw new Error('missing block');
  return typ;
}

function baueRegeln(): Gebaut[] {
  const regeln: Gebaut[] = [];
  for (const eintrag of kuerzelEintraege()) {
    const regel = eintrag.kuerzel;
    if (regel?.art === KUERZEL_ART.zeile && eintrag.id === ART.haken && eintrag.knoten === 'punkt') {
      const haken = formatVon(ART.haken);
      regeln.push(zeileGebaut(regel.genau, {
        typ: knoten('punkt'),
        attrs: { art: ART.haken, abgehakt: false, zeichen: haken.zeichen[0] ?? '', einzug: 0, quelle: '' },
      }));
    }
    if (regel?.art === KUERZEL_ART.wort) regeln.push(wortGebaut(regel.ende, eintrag.id));
  }
  return regeln;
}

function textDavor(state: EditorState): { text: string; ende: number } | null {
  if (!state.selection.empty) return null;
  const $k = state.selection.$head;
  if (!$k.parent.isTextblock || $k.parent.type.spec.code) return null;
  const bis = $k.parentOffset;
  const text = $k.parent.textBetween(Math.max(0, bis - FENSTER), bis, undefined, '\ufffc');
  return { text, ende: $k.pos };
}

function wendePassend(state: EditorState, regeln: readonly Gebaut[]): Transaction | null {
  if (!kuerzelAn()) return null;
  const lage = textDavor(state);
  if (!lage) return null;
  for (const gebaut of regeln) {
    const match = gebaut.muster.exec(lage.text);
    if (!match) continue;
    const start = lage.ende - match[0].length;
    const tr = gebaut.wende(state, match, start, lage.ende);
    if (tr) return tr;
  }
  return null;
}

function gesperrt(tr: Transaction): boolean {
  return isHistoryTransaction(tr)
    || tr.getMeta(SELBST) === true
    || tr.getMeta('programm') === true
    || tr.getMeta('composition') != null;
}

function nachtrag(
  transactions: readonly Transaction[],
  neu: EditorState,
  regeln: readonly Gebaut[],
  spur: Plugin,
): Transaction | null {
  if (!kuerzelAn()) return null;
  if (transactions.some((tr) => gesperrt(tr) || tr.getMeta(spur) || tr.getMeta('codeRand'))) return null;
  if (!transactions.some((tr) => tr.docChanged)) return null;
  const tr = wendePassend(neu, regeln);
  if (!tr) return null;
  if (tr.getMeta('codeRand')) return tr;
  const kopf = neu.selection.head;
  tr.setMeta(spur, { transform: tr, from: kopf, to: kopf, text: '' });
  return tr;
}

let zaunBis = 0;

function zaunFrisch(): boolean {
  return Date.now() <= zaunBis;
}

function baueZaun(state: EditorState, zaun: string): Transaction | null {
  const { $from } = state.selection;
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  if ($from.parent.textContent !== zaun) return null;
  const inhalt = importiere(`${zaun}\n\n${zaun}`);
  const von = $from.before();
  let tr = state.tr.replaceWith(von, $from.after(), inhalt.content);
  const cursor = von + inhalt.child(0).nodeSize + 1;
  tr = tr.setSelection(TextSelection.near(tr.doc.resolve(cursor)));
  return closeHistory(tr);
}

function zaunBefehl(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!kuerzelAn() || !state.selection.empty) return false;
  const { $from } = state.selection;
  if ($from.parent.type.spec.code && $from.parent.content.size === 0 && zaunFrisch()) return true;
  const zaun = formatVon(ART.codeblock).zeichen.find((zeichen) => zeichen === $from.parent.textContent);
  if (!zaun) return false;
  const tr = baueZaun(state, zaun);
  if (!tr) return false;
  if (!dispatch) return true;
  zaunBis = Date.now() + DOPPEL_MS;
  dispatch(tr);
  return true;
}

interface Eingabe extends Event {
  inputType?: string;
  shiftKey?: boolean;
  isComposing?: boolean;
}

function zaunEingabe(view: EditorView, event: Event): boolean {
  const eingabe = event as Eingabe;
  if (eingabe.inputType !== 'insertParagraph' || eingabe.shiftKey || eingabe.isComposing || view.composing) return false;
  if (!zaunBefehl(view.state, (tr) => view.dispatch(tr))) return false;
  event.preventDefault();
  return true;
}

function zurueckBefehl(spur: Plugin): Command {
  return (state, dispatch) => {
    if (!spur.getState(state)) return false;
    return undoInputRule(state, dispatch && ((tr) => {
      dispatch(tr.setMeta(SELBST, true));
    }));
  };
}

export function eingabePlugins(): Plugin[] {
  const regeln = baueRegeln();
  const spur = inputRules({ rules: regeln.map((gebaut) => gebaut.rule) });
  return [
    keymap({ Backspace: zurueckBefehl(spur), Enter: zaunBefehl }),
    spur,
    new Plugin({
      appendTransaction(transactions, _alt, neu) {
        return nachtrag(transactions, neu, regeln, spur);
      },
      props: {
        handleDOMEvents: {
          beforeinput: zaunEingabe,
        },
      },
    }),
  ];
}
