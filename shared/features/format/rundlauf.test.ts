import { describe, expect, it } from 'vitest';
import { exportiere, importiere } from './md.ts';

const KORPUS = [
  'Hello',
  '# Title\n\nA paragraph.',
  '- a\n- b',
  '1. one\n2. two',
  '**bold** and `code` and #tag',
  '# Ueberschrift\n- Liste\n**fett** and `code` and #tag',
  'A line with ~~strike~~ and *italic*.',
  '- [ ] open\n- [x] done',
];

describe('markdown roundtrip', () => {
  it('keeps importiere(exportiere(doc)) equal to doc for the corpus', () => {
    for (const text of KORPUS) {
      const doc = importiere(text);
      expect(importiere(exportiere(doc)).eq(doc), text).toBe(true);
    }
  });
});
