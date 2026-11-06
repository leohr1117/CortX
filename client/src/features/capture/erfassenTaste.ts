import { chainCommands, deleteSelection, joinBackward, joinForward, selectNodeBackward, selectNodeForward } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import type { Node } from 'prosemirror-model';
import { Plugin, TextSelection, type Command } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { nummerEnter, punktModell } from '../../../../shared/features/format/modellpunkt.ts';
import { punktArt } from '../../../../shared/features/format/punkt.ts';
import { quellWahl, setzeGriff } from '../format/modellGriff.ts';

function buchstabeWeg(rueckwaerts: boolean): Command {
  return (state, dispatch) => {
    const sel = state.selection;
    if (!sel.empty || !(sel instanceof TextSelection) || !sel.$cursor) return false;
    const cursor = sel.$cursor;
    if (rueckwaerts) {
      if (cursor.parentOffset <= 0) return false;
      if (dispatch) dispatch(state.tr.delete(cursor.pos - 1, cursor.pos));
      return true;
    }
    if (cursor.parentOffset >= cursor.parent.content.size) return false;
    if (dispatch) dispatch(state.tr.delete(cursor.pos, cursor.pos + 1));
    return true;
  };
}

const ruecktaste = chainCommands(deleteSelection, buchstabeWeg(true), joinBackward, selectNodeBackward);
const vorwaerts = chainCommands(deleteSelection, buchstabeWeg(false), joinForward, selectNodeForward);

const SPRUNG_MS = 40;

interface Eingabe extends Event {
  inputType?: string;
  data?: string | null;
  isComposing?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

function gesteuert(event: Eingabe): boolean {
  return event.ctrlKey === true || event.metaKey === true || event.altKey === true;
}

type Kanal = 'taste' | 'eingabe';

export function erfassenTasten(): Plugin[] {
  let sprungBis = 0;
  let sprungDoc: Node | null = null;
  let kanal: Kanal | null = null;
  const merke = (view: EditorView, von: Kanal) => {
    sprungBis = Date.now() + SPRUNG_MS;
    sprungDoc = view.state.doc;
    kanal = von;
  };
  const nimm = (view: EditorView, von: Kanal): boolean => {
    if (Date.now() > sprungBis || !sprungDoc || von === kanal) return false;
    if (!view.state.doc.eq(sprungDoc)) return false;
    sprungBis = 0;
    sprungDoc = null;
    kanal = null;
    return true;
  };
  const fremd = (view: EditorView, rueckwaerts: boolean): boolean => {
    if (!rueckwaerts) return false;
    return punktModell(view.state, 'zurueck') !== null;
  };
  const loescheZeichen = (view: EditorView, rueckwaerts: boolean, von: Kanal): boolean => {
    if (view.composing || fremd(view, rueckwaerts)) return false;
    const befehl = rueckwaerts ? ruecktaste : vorwaerts;
    if (!befehl(view.state, view.dispatch, view)) return false;
    merke(view, von);
    return true;
  };
  const enter = (view: EditorView, von: Kanal): boolean => {
    if (view.composing || !nummerEnter(view.state)) return false;
    const wahl = quellWahl(view);
    const start = Math.min(wahl.anchor, wahl.head);
    const ende = Math.max(wahl.anchor, wahl.head);
    setzeGriff(view, `${wahl.text.slice(0, start)}\n${wahl.text.slice(ende)}`, start + 1, start + 1);
    merke(view, von);
    return true;
  };
  const taste = (rueckwaerts: boolean) => (_state: unknown, _dispatch: unknown, view?: EditorView) => {
    if (!view) return false;
    if (nimm(view, 'taste')) return true;
    return loescheZeichen(view, rueckwaerts, 'taste');
  };
  return [
    keymap({
      Backspace: taste(true),
      Delete: taste(false),
      Enter: (_state, _dispatch, view) => {
        if (!view) return false;
        if (nimm(view, 'taste')) return true;
        return enter(view, 'taste');
      },
    }),
    new Plugin({
      props: {
        handleDOMEvents: {
          beforeinput(view, event) {
            const eingabe = event as Eingabe;
            if (view.composing || eingabe.isComposing === true || gesteuert(eingabe)) return false;
            const art = punktArt(String(eingabe.inputType ?? ''), eingabe.data ?? null);
            if (art === 'enter') {
              if (nimm(view, 'eingabe') || enter(view, 'eingabe')) {
                event.preventDefault();
                return true;
              }
              return false;
            }
            if (eingabe.inputType === 'deleteContentBackward' || eingabe.inputType === 'deleteContentForward') {
              const rueckwaerts = eingabe.inputType === 'deleteContentBackward';
              if (nimm(view, 'eingabe') || loescheZeichen(view, rueckwaerts, 'eingabe')) {
                event.preventDefault();
                return true;
              }
            }
            return false;
          },
        },
      },
    }),
  ];
}
