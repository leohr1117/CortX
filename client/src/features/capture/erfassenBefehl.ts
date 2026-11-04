import { closeHistory } from 'prosemirror-history';
import { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { rufBefehl, type FormatBefehl } from '../../../../shared/features/format/index.ts';
import { auswahlZwischen, dokumentFuer, rohOffset, textAusDokument } from './erfassenDokument.ts';

export function setzeErfassenText(view: EditorView, text: string, anchor: number, head: number): void {
  const doc = dokumentFuer(text);
  let tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
  const sel = auswahlZwischen(tr.doc, text, anchor, head);
  tr = closeHistory(tr.setSelection(sel).setMeta('programm', true));
  view.dispatch(tr);
}

export function wendeBefehl(view: EditorView, id: FormatBefehl, ziel: string | null): 'ziel' | 'text' {
  const text = textAusDokument(view.state.doc);
  const anchor = rohOffset(view.state.doc, text, view.state.selection.anchor);
  const head = rohOffset(view.state.doc, text, view.state.selection.head);
  const ergebnis = rufBefehl(id, text, Math.min(anchor, head), Math.max(anchor, head), ziel);
  if (ergebnis.art === 'ziel') return 'ziel';
  setzeErfassenText(view, ergebnis.wahl.text, ergebnis.wahl.start, ergebnis.wahl.ende);
  view.focus();
  return 'text';
}

export function zustandOhneHistorie(view: EditorView, text: string, stelle: number): void {
  const doc = dokumentFuer(text);
  const sel = auswahlZwischen(doc, text, stelle, stelle);
  const zustand = EditorState.create({ doc, plugins: view.state.plugins });
  view.updateState(zustand.apply(zustand.tr.setSelection(sel).setMeta('addToHistory', false)));
}
