import type { Node } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { knotenZuMarkdownOffset } from '../../../../shared/features/format/knotenOffset.ts';
import { speichere } from '../../../../shared/features/format/speichern.ts';
import { tagMarken } from './marken.ts';

function offsetAus(grenze: readonly number[], pos: number): number {
  let fund = 0;
  for (let i = 0; i < grenze.length; i += 1) {
    if (grenze[i] === pos) fund = i;
  }
  return fund;
}

function posAus(doc: Node, text: string, grenze: readonly number[], offset: number): number {
  const safe = Math.max(0, Math.min(offset, text.length));
  const pos = grenze[safe] ?? 0;
  return Math.max(0, Math.min(pos, doc.content.size));
}

export function tagDekoPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        try {
          const text = speichere(state.doc);
          const { grenze } = knotenZuMarkdownOffset(state.doc, text);
          const caret = offsetAus(grenze, state.selection.head);
          const dekos = [];
          for (const marke of tagMarken(text, caret)) {
            const von = posAus(state.doc, text, grenze, marke.start);
            const bis = posAus(state.doc, text, grenze, marke.end);
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
