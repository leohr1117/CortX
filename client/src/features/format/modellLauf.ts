import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { nummerAktiv, wechselNummer } from '../../../../shared/features/format/modellart.ts';
import type { ModellSchalt } from '../../../../shared/features/format/modellbefehl.ts';
import type { NummerArt } from '../../../../shared/features/format/nummer.ts';
import '../../../../shared/features/format/modellbefehl.ts';

const SCHRITT = 'modellZustand';

export function setzeZustand(view: EditorView, zustand: EditorState): void {
  if (zustand === view.state) return;
  view.dispatch(view.state.tr.setMeta(SCHRITT, zustand));
}

export function wendeModell(view: EditorView, schalt: ModellSchalt | undefined): void {
  if (!schalt) return;
  const naechster = schalt.run(view.state);
  if (naechster === view.state) return;
  setzeZustand(view, naechster);
}

export function wendeNummer(view: EditorView, art: NummerArt): void {
  const naechster = wechselNummer(view.state, art);
  if (naechster === view.state) return;
  setzeZustand(view, naechster);
}

export function nummerAn(zustand: EditorState, art: NummerArt): boolean {
  return nummerAktiv(zustand, art);
}

export function zustandNach(tr: Transaction): EditorState | null {
  const ersetzt = tr.getMeta(SCHRITT);
  if (!ersetzt || typeof ersetzt !== 'object' || !('doc' in ersetzt)) return null;
  return ersetzt as EditorState;
}
