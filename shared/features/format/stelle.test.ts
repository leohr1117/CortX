import { TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { lade } from './laden.ts';
import { grenzen, inhaltZeichen, offsetFuer, posFuer } from './stelle.ts';

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

describe('model position and text offset', () => {
  it('maps every stored character onto the visible text', () => {
    for (const text of PROBEN) {
      const doc = lade(text);
      expect(inhaltZeichen(text), text).toBe(doc.textContent);
      const grenze = grenzen(doc, text);
      expect(grenze, text).toHaveLength(text.length + 1);
      expect(grenze[text.length], text).toBe(TextSelection.atEnd(doc).from);
      for (let i = 0; i <= text.length; i += 1) {
        const pos = grenze[i] ?? 0;
        expect(pos, text).toBeGreaterThanOrEqual(0);
        expect(posFuer(doc, text, i), text).toBe(Math.max(0, Math.min(pos, doc.content.size)));
        const zurueck = offsetFuer(doc, text, posFuer(doc, text, i));
        expect(grenze[zurueck], text).toBe(posFuer(doc, text, i));
        expect(zurueck, text).toBeGreaterThanOrEqual(i);
      }
    }
  });

  it('puts the cursor of a wrapped word on the word', () => {
    const text = '**Hello**';
    const doc = lade(text);
    const grenze = grenzen(doc, text);
    expect(grenze[0]).toBe(grenze[2]);
    expect(grenze[text.length]).toBe(TextSelection.atEnd(doc).from);
    expect(offsetFuer(doc, text, grenze[0] ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it('turns a text offset back into the same model position', () => {
    const text = 'Hello';
    const doc = lade(text);
    expect(posFuer(doc, text, 0)).not.toBe(0);
    expect(offsetFuer(doc, text, posFuer(doc, text, 0))).toBe(0);
    expect(posFuer(doc, text, offsetFuer(doc, text, posFuer(doc, text, 4)))).toBe(posFuer(doc, text, 4));
  });
});
