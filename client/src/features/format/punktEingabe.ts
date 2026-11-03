import type { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type KeyBinding } from '@codemirror/view';
import { PUNKT_TASTEN, punktArt, punktTaste, type PunktArt } from '../../../../shared/features/format/index.ts';

const SPRUNG_MS = 40;

function mitSteuerung(event: Event): boolean {
  const taste = event as Event & { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean };
  return taste.ctrlKey === true || taste.metaKey === true || taste.altKey === true;
}

export function bauePunktEingabe(): { tasten: readonly KeyBinding[]; eingabe: Extension } {
  let sprungBis = 0;
  let sprungLaenge = -1;
  let sprungKopf = -1;
  const merke = (view: EditorView): void => {
    sprungBis = Date.now() + SPRUNG_MS;
    sprungLaenge = view.state.doc.length;
    sprungKopf = view.state.selection.main.head;
  };
  const nimmSprung = (view: EditorView): boolean => {
    if (Date.now() > sprungBis) return false;
    const sel = view.state.selection.main;
    const gleich = view.state.doc.length === sprungLaenge && sel.head === sprungKopf && sel.anchor === sprungKopf;
    sprungBis = 0;
    return gleich;
  };
  const wende = (view: EditorView, art: PunktArt): boolean => {
    if (view.composing || view.state.selection.ranges.length !== 1) return false;
    const sel = view.state.selection.main;
    const text = view.state.doc.toString();
    const wahl = punktTaste(text, sel.from, sel.to, art);
    if (!wahl) return false;
    view.dispatch({
      changes: { from: 0, to: text.length, insert: wahl.text },
      selection: { anchor: wahl.start, head: wahl.ende },
      userEvent: 'input',
      filter: false,
      scrollIntoView: true,
    });
    merke(view);
    return true;
  };
  const tasten: KeyBinding[] = PUNKT_TASTEN.map((eintrag) => ({
    key: eintrag.taste,
    run: (view) => (nimmSprung(view) ? true : wende(view, eintrag.art)),
  }));
  const eingabe = ViewPlugin.fromClass(
    class {
      private dom: HTMLElement;
      private handler: (event: Event) => void;

      constructor(view: EditorView) {
        this.dom = view.contentDOM;
        this.handler = (event: Event) => {
          if (!(event instanceof InputEvent) || event.isComposing || view.composing) return;
          if (mitSteuerung(event)) return;
          if (event.defaultPrevented) return;
          const art = punktArt(event.inputType, event.data);
          if (!art) return;
          if (nimmSprung(view)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
          if (!wende(view, art)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
        };
        this.dom.addEventListener('beforeinput', this.handler, true);
      }

      destroy(): void {
        this.dom.removeEventListener('beforeinput', this.handler, true);
      }
    },
  );
  return { tasten, eingabe };
}
