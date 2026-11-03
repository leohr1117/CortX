import { TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { lade } from '../../../../shared/features/format/laden.ts';
import { grenzen, inhaltZeichen } from './modellStelle.ts';

const PROBEN = [
  '',
  'Hello',
  'Hello\n',
  'Hello\nWorld',
  '**Hello**',
  '***Test***',
  '= Sprint summary',
  '- milk',
  '[] call',
  '- [x] done',
  '**a**\n**b**\n**c** d **e**',
  '- a\n  b',
  '```\nwort\n```',
  '`**not**`',
  '!!`Gold`!!',
  '!!!! **fett**',
  '__alpha__\n__beta__\ngamma',
];

describe('markdown positions in the model', () => {
  it('maps every stored character onto the visible text', () => {
    for (const text of PROBEN) {
      const doc = lade(text);
      expect(inhaltZeichen(text), text).toBe(doc.textContent);
      const grenze = grenzen(doc, text);
      expect(grenze, text).toHaveLength(text.length + 1);
      expect(grenze[text.length], text).toBe(TextSelection.atEnd(doc).from);
      for (const pos of grenze) expect(pos, text).toBeGreaterThanOrEqual(0);
    }
  });

  it('puts the cursor of a wrapped word on the word', () => {
    const text = '**Hello**';
    const doc = lade(text);
    const grenze = grenzen(doc, text);
    expect(grenze[0]).toBe(grenze[2]);
    expect(grenze[text.length]).toBe(TextSelection.atEnd(doc).from);
  });
});
