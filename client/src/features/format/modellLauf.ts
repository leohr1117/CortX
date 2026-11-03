import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { ModellSchalt } from '../../../../shared/features/format/modellbefehl.ts';
import '../../../../shared/features/format/modellbefehl.ts';

const SCHRITT = 'modellZustand';

export function wendeModell(view: EditorView, schalt: ModellSchalt | undefined): void {
  if (!schalt) return;
  const naechster = schalt.run(view.state);
  if (naechster === view.state) return;
  view.dispatch(view.state.tr.setMeta(SCHRITT, naechster));
}

export function zustandNach(tr: Transaction): EditorState | null {
  const ersetzt = tr.getMeta(SCHRITT);
  if (!ersetzt || typeof ersetzt !== 'object' || !('doc' in ersetzt)) return null;
  return ersetzt as EditorState;
}
