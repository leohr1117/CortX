import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { DecorationSet } from 'prosemirror-view';
import { exportiere, importiere } from '../../../../shared/features/format/md.ts';
import { planeAblage } from '../../../../shared/features/tags/index.ts';
import { tagDekoPlugin } from './tagDeko.ts';

// Today's behavior, pinned before the node rebuild (Clara, 12.11.2026 05:57: highlight and preview stay as they are).
// Columns: text, highlighted ranges in the capture field, targets of the filing preview.
const FAELLE: Array<[string, string[], string[]]> = [
  ['a **#fett** b', ['#fett'], ['Inbox']],
  ['a `#code` b', ['#code'], ['Inbox']],
  ['a *#kursiv* b', ['#kursiv'], ['Inbox']],
  ['a _#unter_ b', [], ['Inbox']],
  ['x**y**#z', ['#z'], ['Inbox']],
  ['x`y`#z', ['#z'], ['Inbox']],
  ['\\#kein', ['#kein'], ['Inbox']],
  ['a [#link](https://x.de) b', ['#link'], ['Inbox']],
  ['**a#b**', [], ['Inbox']],
  ['a ~~#durch~~ b', ['#durch'], ['Inbox']],
  ['# Titel #tag', ['#tag'], ['Inbox']],
  ['- [ ] #kasten', ['#kasten'], ['Inbox']],
  ['1. #nummer', ['#nummer'], ['Inbox']],
  ['**#fett/unter** x', ['#fett/unter'], ['Inbox']],
  ['#a`b`', ['#a'], ['Inbox']],
  ['`x`#a', ['#a'], ['Inbox']],
];

function markiert(text: string): string[] {
  const plugin = tagDekoPlugin();
  const doc = importiere(text);
  const state = EditorState.create({ doc, plugins: [plugin], selection: TextSelection.atStart(doc) });
  const set = plugin.props.decorations?.call(plugin, state) as DecorationSet | null | undefined;
  if (!set) return [];
  return set.find().map((deko) => state.doc.textBetween(deko.from, deko.to));
}

function vorschau(text: string): string[] {
  return planeAblage(exportiere(importiere(text)), [], [])?.ziele.map((ziel) => ziel.topicName) ?? [];
}

describe('tags in the capture field stay as today', () => {
  it('covers all sixteen cases', () => {
    expect(FAELLE).toHaveLength(16);
  });

  it.each(FAELLE)('%s', (text, erwartetMarkiert, erwartetVorschau) => {
    expect(markiert(text)).toEqual(erwartetMarkiert);
    expect(vorschau(text)).toEqual(erwartetVorschau);
  });
});
