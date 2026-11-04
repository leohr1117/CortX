import type { EditorView } from 'prosemirror-view';
import { auswahlZwischen, rohOffset, textAusDokument } from './erfassenDokument.ts';
import { setzeErfassenText } from './erfassenBefehl.ts';

interface Aenderung {
  from: number;
  to: number;
  insert: string;
}

interface Wahl {
  anchor: number;
  head?: number;
}

interface Auftrag {
  changes?: Aenderung;
  selection?: Wahl;
}

interface Griff {
  focus: () => void;
  dispatch: (spec: Auftrag) => void;
  readonly state: {
    doc: { length: number; toString: () => string };
    selection: { main: { head: number; anchor: number } };
  };
}

function kopfVon(view: EditorView): { anchor: number; head: number } {
  const text = textAusDokument(view.state.doc);
  return {
    anchor: rohOffset(view.state.doc, text, view.state.selection.anchor),
    head: rohOffset(view.state.doc, text, view.state.selection.head),
  };
}

export function haengeErfassenGriff(view: EditorView, wurzel: HTMLElement): void {
  const dom = wurzel as HTMLElement & { cm?: Griff };
  dom.cm = {
    focus() {
      view.focus();
    },
    dispatch(spec) {
      const alt = textAusDokument(view.state.doc);
      if (spec.changes) {
        const neu = alt.slice(0, spec.changes.from) + spec.changes.insert + alt.slice(spec.changes.to);
        const anker = spec.selection ? spec.selection.anchor : neu.length;
        const kopf = spec.selection?.head ?? anker;
        setzeErfassenText(view, neu, anker, kopf);
        return;
      }
      if (!spec.selection) return;
      const kopf = spec.selection.head ?? spec.selection.anchor;
      const sel = auswahlZwischen(view.state.doc, alt, spec.selection.anchor, kopf);
      view.dispatch(view.state.tr.setSelection(sel).setMeta('programm', true));
    },
    get state() {
      return {
        doc: {
          get length() {
            return textAusDokument(view.state.doc).length;
          },
          toString() {
            return textAusDokument(view.state.doc);
          },
        },
        selection: {
          main: {
            get head() {
              return kopfVon(view).head;
            },
            get anchor() {
              return kopfVon(view).anchor;
            },
          },
        },
      };
    },
  };
}
