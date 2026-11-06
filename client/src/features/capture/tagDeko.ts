import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { speichere } from '../../../../shared/features/format/speichern.ts';
import { offsetFuer, posFuer } from '../../../../shared/features/format/stelle.ts';
import { tagMarken } from './marken.ts';

export function tagDekoPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        try {
          const text = speichere(state.doc);
          const caret = offsetFuer(state.doc, text, state.selection.head);
          const dekos = [];
          for (const marke of tagMarken(text, caret)) {
            const von = posFuer(state.doc, text, marke.start);
            const bis = posFuer(state.doc, text, marke.end);
            if (bis <= von) continue;
            if (state.doc.resolve(von).parent !== state.doc.resolve(bis).parent) continue;
            dekos.push(Decoration.inline(von, bis, { class: marke.hier ? 'tag hier' : 'tag' }));
          }
          dekos.sort((a, b) => a.from - b.from || a.to - b.to);
          return dekos.length === 0 ? null : DecorationSet.create(state.doc, dekos);
        } catch {
          return null;
        }
      },
    },
  });
}
