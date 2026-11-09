import type { Command } from 'prosemirror-state';
import { formatImCodeblockGesperrt } from '../../../../shared/features/format/modellbefehl.ts';
import { leistenEintraege } from '../../../../shared/features/format/index.ts';
import { setzeZustand } from './modellLauf.ts';
import { WICHTIG_TASTE } from './wichtigTaste.ts';

export function formatTasten(onLink: () => void): Record<string, Command> {
  const tasten: Record<string, Command> = {};
  for (const eintrag of leistenEintraege()) {
    const taste = eintrag.knopf.taste;
    const schalt = eintrag.modell;
    if (!taste || !schalt || taste === WICHTIG_TASTE) continue;
    tasten[taste] = (state, _dispatch, view) => {
      if (formatImCodeblockGesperrt(eintrag.id, state)) return true;
      if (eintrag.knopf.ziel) {
        onLink();
        return true;
      }
      if (!view) return true;
      const naechster = schalt.run(state);
      if (naechster !== state) setzeZustand(view, naechster);
      return true;
    };
  }
  return tasten;
}
