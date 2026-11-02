import { describe, expect, it } from 'vitest';
import { caretNachAblageRueck, textNachAblageRueck } from './rueck.ts';

describe('filing undo text', () => {
  it('puts the filed text back unchanged, with the cursor at the end', () => {
    const roh = '#school/Thema1 text1\ntext1 text1\n#school/Thema2 text2';
    expect(textNachAblageRueck(roh, 'anders')).toBe(roh);
    expect(caretNachAblageRueck(roh)).toBe(roh.length);
  });

  it('keeps the remembered text when the server has none', () => {
    const roh = 'Buy milk';
    expect(textNachAblageRueck(null, roh)).toBe(roh);
    expect(caretNachAblageRueck(roh)).toBe(roh.length);
  });

  it('returns nothing when neither side kept the text', () => {
    expect(textNachAblageRueck(null, null)).toBeNull();
  });
});
