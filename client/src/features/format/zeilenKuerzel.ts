import { inputRules, InputRule, undoInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import type { Attrs, Node, NodeType } from 'prosemirror-model';
import { Plugin, TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { ART } from '../../../../shared/features/format/baum.ts';
import { lade } from '../../../../shared/features/format/laden.ts';
import { modell } from '../../../../shared/features/format/modell.ts';
import { istNummerArt } from '../../../../shared/features/format/nummer.ts';
import { formatVon } from '../../../../shared/features/format/register.ts';
import { kopfZeichen } from '../../../../shared/features/format/zeile.ts';
import { inlineRuecktaste } from './inlineKuerzel.ts';
import { kuerzelAn } from './kuerzelSpeicher.ts';

interface Ziel {
  muster: string;
  typ: NodeType;
  attrs: Attrs;
}

function knoten(name: string): NodeType {
  const typ = modell.nodes[name];
  if (!typ) throw new Error('missing block');
  return typ;
}

function ziele(): readonly Ziel[] {
  const liste = formatVon(ART.liste);
  const haken = formatVon(ART.haken);
  const kopf = formatVon(ART.ueberschrift);
  const punkt = knoten('punkt');
  return [
    {
      muster: liste.syntax?.einsetzen ?? '',
      typ: punkt,
      attrs: { art: ART.liste, abgehakt: false, zeichen: liste.zeichen[0] ?? '', einzug: 0, quelle: '' },
    },
    {
      muster: haken.syntax?.einsetzen ?? '',
      typ: punkt,
      attrs: { art: ART.haken, abgehakt: false, zeichen: haken.zeichen[0] ?? '', einzug: 0, quelle: '' },
    },
    {
      muster: kopfZeichen(1),
      typ: knoten('ueberschrift'),
      attrs: { stufe: 1, zeichen: kopf.zeichen[1] ?? '#', quelle: '' },
    },
  ].filter((ziel) => ziel.muster.length > 0);
}

function muster(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

function schon(node: Node, ziel: Ziel): boolean {
  if (node.type !== ziel.typ) return false;
  for (const [name, wert] of Object.entries(ziel.attrs)) {
    if (name === 'quelle') continue;
    if (node.attrs[name] !== wert) return false;
  }
  return true;
}

function wandle(state: EditorState, start: number, end: number, ziel: Ziel): Transaction | null {
  const $start = state.doc.resolve(start);
  if (!$start.parent.isTextblock || $start.parent.type.spec.code || $start.parentOffset !== 0) return null;
  if (schon($start.parent, ziel)) return null;
  const davor = state.doc.resolve($start.before());
  if (!davor.parent.canReplaceWith(davor.index(), davor.index() + 1, ziel.typ)) return null;
  const tr = state.tr.delete(start, end).setBlockType(start, start, ziel.typ, ziel.attrs);
  const innen = tr.mapping.map(start);
  if (tr.doc.resolve(innen).parent.type !== ziel.typ) return null;
  return tr;
}

const NUMMER_ZEILE = /^\d{1,9}\. $/;

function nummerKnoten(text: string): Node | null {
  if (!NUMMER_ZEILE.test(text)) return null;
  let doc: Node;
  try {
    doc = lade(text);
  } catch {
    return null;
  }
  if (doc.childCount !== 1) return null;
  const knoten = doc.child(0);
  if (knoten.type.name !== 'punkt' || knoten.attrs.art !== ART.nummer) return null;
  if (!istNummerArt(String(knoten.attrs.nummerArt ?? ''))) return null;
  return knoten;
}

function wandleNummer(state: EditorState): Transaction | null {
  const { $from } = state.selection;
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  if ($from.parentOffset !== $from.parent.content.size) return null;
  const knoten = nummerKnoten($from.parent.textContent);
  if (!knoten || $from.parent.attrs.art === ART.nummer) return null;
  const vor = $from.before();
  const tr = state.tr.replaceWith(vor, $from.after(), knoten);
  return tr.setSelection(TextSelection.create(tr.doc, vor + 1));
}

function zeilenRegeln(an: () => boolean): InputRule[] {
  const nummer = new InputRule(NUMMER_ZEILE, (state, _treffer, start) => {
    if (!an()) return null;
    if (state.doc.resolve(start).parentOffset !== 0) return null;
    return wandleNummer(state);
  });
  const zeilen = ziele().map((ziel) => new InputRule(muster(ziel.muster), (state, _treffer, start, end) => {
    if (!an()) return null;
    return wandle(state, start, end, ziel);
  }));
  return [nummer, ...zeilen];
}

const ZURUECK = 'zeilenZurueck';

const nimmZurueck: Command = (state, dispatch) => {
  if (inlineRuecktaste(state, dispatch)) return true;
  return undoInputRule(state, dispatch && ((tr) => {
    dispatch(tr.setMeta(ZURUECK, true));
  }));
};

function nachtrag(transactions: readonly Transaction[], neu: EditorState, eingabe: Plugin, an: () => boolean): Transaction | null {
  if (!an()) return null;
  if (transactions.some((tr) => tr.getMeta(ZURUECK) || tr.getMeta(eingabe) || tr.getMeta('programm'))) return null;
  if (!transactions.some((tr) => tr.docChanged)) return null;
  const { $head } = neu.selection;
  if (!$head.parent.isTextblock || $head.parent.type.spec.code) return null;
  if ($head.parentOffset !== $head.parent.content.size) return null;
  const nummer = wandleNummer(neu);
  if (nummer) {
    const start = $head.start();
    nummer.setMeta(eingabe, { transform: nummer, from: start, to: start, text: '' });
    return nummer;
  }
  const ziel = ziele().find((eintrag) => eintrag.muster === $head.parent.textContent);
  if (!ziel) return null;
  const start = $head.start();
  const tr = wandle(neu, start, $head.end(), ziel);
  if (!tr) return null;
  tr.setMeta(eingabe, { transform: tr, from: start, to: start, text: '' });
  return tr;
}

interface Eingabe extends Event {
  inputType?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

function ruecktaste(view: EditorView, event: Event): boolean {
  const eingabe = event as Eingabe;
  if (eingabe.inputType !== 'deleteContentBackward' || view.composing) return false;
  if (eingabe.ctrlKey || eingabe.metaKey || eingabe.altKey) return false;
  if (!nimmZurueck(view.state, (tr) => view.dispatch(tr))) return false;
  event.preventDefault();
  return true;
}

export function zeilenPlugins(an: () => boolean = kuerzelAn): Plugin[] {
  const eingabe = inputRules({ rules: zeilenRegeln(an) });
  return [
    keymap({ Backspace: nimmZurueck }),
    new Plugin({
      appendTransaction(transactions, _alt, neu) {
        return nachtrag(transactions, neu, eingabe, an);
      },
      props: {
        handleDOMEvents: {
          beforeinput: ruecktaste,
        },
      },
    }),
    eingabe,
  ];
}
