import { type Node } from 'prosemirror-model';
import { keymap } from 'prosemirror-keymap';
import { Plugin, type Command, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { PUNKT_TASTEN, punktArt, type PunktArt } from '../../../../shared/features/format/index.ts';
import { enterTrenntFormat, nummerBruch, nummerEnter, punktModell } from '../../../../shared/features/format/modellpunkt.ts';
import { setzeZustand } from './modellLauf.ts';

const SPRUNG_MS = 40;

interface Eingabe extends Event {
  inputType?: string;
  data?: string | null;
  isComposing?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

function mitSteuerung(event: Eingabe): boolean {
  return event.ctrlKey === true || event.metaKey === true || event.altKey === true;
}

type Kanal = 'taste' | 'eingabe';

export function modellEingabe(): Plugin[] {
  let sprungBis = 0;
  let sprungDoc: Node | null = null;
  let sprungKopf = -1;
  let kanal: Kanal | null = null;
  const merke = (doc: Node, kopf: number, von: Kanal): void => {
    sprungBis = Date.now() + SPRUNG_MS;
    sprungDoc = doc;
    sprungKopf = kopf;
    kanal = von;
  };
  const nimmSprung = (doc: Node, kopf: number, von: Kanal): boolean => {
    if (Date.now() > sprungBis || !sprungDoc) return false;
    if (von === kanal) return false;
    const gleich = doc.eq(sprungDoc) && kopf === sprungKopf;
    if (!gleich) return false;
    sprungBis = 0;
    sprungDoc = null;
    kanal = null;
    return true;
  };
  const naechsterZustand = (state: EditorState, art: PunktArt): EditorState | null => {
    const liste = punktModell(state, art);
    if (liste) return liste;
    if (art !== 'enter') return null;
    return nummerEnter(state) ?? nummerBruch(state) ?? enterTrenntFormat(state);
  };
  const wende = (view: EditorView, art: PunktArt, von: Kanal): boolean => {
    const naechster = naechsterZustand(view.state, art);
    if (!naechster) return false;
    setzeZustand(view, naechster);
    merke(view.state.doc, view.state.selection.head, von);
    return true;
  };
  const taste = (art: PunktArt): Command => (state, dispatch, view) => {
    if (!view || !dispatch) return naechsterZustand(state, art) !== null;
    if (nimmSprung(view.state.doc, view.state.selection.head, 'taste')) return true;
    return wende(view, art, 'taste');
  };
  const tasten: Record<string, Command> = {};
  for (const eintrag of PUNKT_TASTEN) tasten[eintrag.taste] = taste(eintrag.art);
  const eingabe = new Plugin({
    props: {
      handleDOMEvents: {
        beforeinput(view, event) {
          const eingabeEreignis = event as Eingabe;
          if (eingabeEreignis.isComposing || mitSteuerung(eingabeEreignis)) return false;
          if (event.defaultPrevented) return true;
          const art = punktArt(String(eingabeEreignis.inputType ?? ''), eingabeEreignis.data ?? null);
          if (!art) return false;
          if (nimmSprung(view.state.doc, view.state.selection.head, 'eingabe')) {
            event.preventDefault();
            return true;
          }
          if (!wende(view, art, 'eingabe')) return false;
          event.preventDefault();
          return true;
        },
      },
    },
  });
  return [keymap(tasten), eingabe];
}
