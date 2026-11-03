import { keymap } from 'prosemirror-keymap';
import { Plugin, type Command, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { PUNKT_TASTEN, punktArt, type PunktArt } from '../../../../shared/features/format/index.ts';
import { nummerBruch, punktModell } from '../../../../shared/features/format/modellpunkt.ts';
import { speichere } from '../../../../shared/features/format/speichern.ts';
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

export function modellEingabe(): Plugin[] {
  let sprungBis = 0;
  let sprungText = '';
  let sprungKopf = -1;
  const merke = (text: string, kopf: number): void => {
    sprungBis = Date.now() + SPRUNG_MS;
    sprungText = text;
    sprungKopf = kopf;
  };
  const nimmSprung = (text: string, kopf: number): boolean => {
    if (Date.now() > sprungBis) return false;
    const gleich = text === sprungText && kopf === sprungKopf;
    sprungBis = 0;
    return gleich;
  };
  const wende = (view: EditorView, art: PunktArt): boolean => {
    if (view.composing) return false;
    const naechster = punktModell(view.state, art) ?? (art === 'enter' ? nummerBruch(view.state) : null);
    if (!naechster) return false;
    setzeZustand(view, naechster);
    merke(speichere(view.state.doc), view.state.selection.head);
    return true;
  };
  const lage = (state: EditorState): [string, number] => [speichere(state.doc), state.selection.head];
  const taste = (art: PunktArt): Command => (state, dispatch, view) => {
    if (!view || !dispatch) return punktModell(state, art) !== null || (art === 'enter' && nummerBruch(state) !== null);
    const [text, kopf] = lage(view.state);
    if (nimmSprung(text, kopf)) return true;
    return wende(view, art);
  };
  const tasten: Record<string, Command> = {};
  for (const eintrag of PUNKT_TASTEN) tasten[eintrag.taste] = taste(eintrag.art);
  const eingabe = new Plugin({
    props: {
      handleDOMEvents: {
        beforeinput(view, event) {
          const eingabeEreignis = event as Eingabe;
          if (eingabeEreignis.isComposing || view.composing || mitSteuerung(eingabeEreignis)) return false;
          if (event.defaultPrevented) return true;
          const art = punktArt(String(eingabeEreignis.inputType ?? ''), eingabeEreignis.data ?? null);
          if (!art) return false;
          const [text, kopf] = lage(view.state);
          if (nimmSprung(text, kopf)) {
            event.preventDefault();
            return true;
          }
          if (!wende(view, art)) return false;
          event.preventDefault();
          return true;
        },
      },
    },
  });
  return [keymap(tasten), eingabe];
}
