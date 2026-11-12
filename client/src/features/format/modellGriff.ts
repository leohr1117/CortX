import { closeHistory } from 'prosemirror-history';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { exportiere, importiere } from '../../../../shared/features/format/md.ts';
import { grenzen } from './modellStelle.ts';
import { klartextVon } from './modellHaken.ts';

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

interface Merk {
  anchorPos: number;
  anchor: number;
  headPos: number;
  head: number;
}

const merk = new WeakMap<EditorView, Merk>();

function klemme(index: number, laenge: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.floor(index), laenge));
}

function stelle(doc: EditorView['state']['doc'], pos: number): number {
  const safe = Math.max(0, Math.min(pos, doc.content.size));
  return TextSelection.near(doc.resolve(safe)).from;
}

export function merkeEnde(view: EditorView, text: string): void {
  const sel = view.state.selection;
  merk.set(view, {
    anchorPos: sel.anchor,
    anchor: text.length,
    headPos: sel.head,
    head: text.length,
  });
}

export function merkeWahl(view: EditorView, anchor: number, head: number): void {
  const sel = view.state.selection;
  merk.set(view, { anchorPos: sel.anchor, anchor, headPos: sel.head, head });
}

function offset(view: EditorView, text: string, pos: number, welches: 'head' | 'anchor'): number {
  const eintrag = merk.get(view);
  if (eintrag && eintrag[welches === 'head' ? 'headPos' : 'anchorPos'] === pos) {
    return welches === 'head' ? eintrag.head : eintrag.anchor;
  }
  const grenze = grenzen(view.state.doc, text);
  let fund = 0;
  for (let i = 0; i < grenze.length; i += 1) {
    if (grenze[i] === pos) fund = i;
  }
  return fund;
}

function waehle(view: EditorView, text: string, anchor: number, head: number): void {
  const grenze = grenzen(view.state.doc, text);
  const doc = view.state.doc;
  const von = stelle(doc, grenze[klemme(anchor, text.length)] ?? 0);
  const bis = stelle(doc, grenze[klemme(head, text.length)] ?? von);
  const tr = view.state.tr.setSelection(TextSelection.between(doc.resolve(von), doc.resolve(bis)));
  view.dispatch(tr.setMeta('programm', true));
  merkeWahl(view, anchor, head);
}

export function quellWahl(view: EditorView): { text: string; anchor: number; head: number } {
  const text = exportiere(view.state.doc);
  return {
    text,
    anchor: offset(view, text, view.state.selection.anchor, 'anchor'),
    head: offset(view, text, view.state.selection.head, 'head'),
  };
}

export function setzeGriff(view: EditorView, text: string, anchor: number, head: number): void {
  ersetze(view, text, anchor, head, true);
}

function ersetze(view: EditorView, text: string, anchor: number, head: number, neuGruppe = false): void {
  const doc = importiere(text);
  let tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
  const grenze = grenzen(tr.doc, text);
  const von = stelle(tr.doc, grenze[klemme(anchor, text.length)] ?? 0);
  const bis = stelle(tr.doc, grenze[klemme(head, text.length)] ?? von);
  tr = tr.setSelection(TextSelection.between(tr.doc.resolve(von), tr.doc.resolve(bis)));
  if (neuGruppe) tr = closeHistory(tr);
  view.dispatch(tr.setMeta('programm', true));
  merkeWahl(view, anchor, head);
}

function quelleLeererMarken(view: EditorView): string | null {
  if (!view.dom.classList.contains('cm-content')) return null;
  const marks = view.state.storedMarks;
  if (!marks || marks.length === 0) return null;
  if (klartextVon(view.state.doc) !== '') return null;
  const absatz = view.state.schema.nodes.absatz;
  if (!absatz) return null;
  try {
    const probe = view.state.schema.text('x', [...marks]);
    const knoten = absatz.create({ quelle: '' }, probe);
    const doc = view.state.schema.topNodeType.create(null, knoten);
    const seriell = exportiere(doc);
    if (seriell.split('x').length !== 2) return null;
    return seriell.replace('x', '');
  } catch {
    return null;
  }
}

export function haengeGriff(view: EditorView): void {
  const dom = view.dom as HTMLElement & { cm?: Griff };
  dom.cm = {
    focus() {
      view.focus();
    },
    dispatch(spec) {
      const alt = exportiere(view.state.doc);
      if (spec.changes) {
        const neu = alt.slice(0, spec.changes.from) + spec.changes.insert + alt.slice(spec.changes.to);
        const anker = spec.selection ? spec.selection.anchor : neu.length;
        const kopf = spec.selection?.head ?? anker;
        ersetze(view, neu, anker, kopf, true);
        return;
      }
      if (!spec.selection) return;
      waehle(view, alt, spec.selection.anchor, spec.selection.head ?? spec.selection.anchor);
    },
    get state() {
      const text = exportiere(view.state.doc);
      return {
        doc: {
          get length() {
            return exportiere(view.state.doc).length;
          },
          toString() {
            const text = exportiere(view.state.doc);
            if (text.length > 0) return text;
            return quelleLeererMarken(view) ?? text;
          },
        },
        selection: {
          main: {
            get head() {
              return offset(view, text, view.state.selection.head, 'head');
            },
            get anchor() {
              return offset(view, text, view.state.selection.anchor, 'anchor');
            },
          },
        },
      };
    },
  };
}
