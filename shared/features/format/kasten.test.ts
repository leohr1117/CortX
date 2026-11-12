import { describe, expect, it } from 'vitest';
import { ART } from './baum.ts';
import { schalteKasten } from './kasten.ts';
import './modellkasten.ts';
import { formatVon } from './register.ts';

function schalte(text: string, index = 0): string {
  return schalteKasten(text, index);
}

describe('checkbox toggle', () => {
  it('is the register command for a checkbox and for no other format', () => {
    expect(Object.keys(formatVon(ART.haken).kasten ?? {})).toEqual(['modell']);
    expect(typeof formatVon(ART.haken).kasten?.modell).toBe('function');
    expect(formatVon(ART.liste).kasten).toBeUndefined();
    expect(formatVon(ART.fett).kasten).toBeUndefined();
  });

  it('flips only the bracket of the named forms', () => {
    expect(schalte('[] a')).toBe('[x] a');
    expect(schalte('[ ] a')).toBe('[x] a');
    expect(schalte('[x] a')).toBe('[ ] a');
    expect(schalte('[X] a')).toBe('[ ] a');
    expect(schalte('- [ ] a')).toBe('- [x] a');
    expect(schalte('* [x] a')).toBe('* [ ] a');
    expect(schalte('+ [ ] a')).toBe('+ [x] a');
    expect(schalte('[]a')).toBe('[x]a');
    expect(schalte('[x]a')).toBe('[ ]a');
  });

  it('returns the same text when toggled twice for a stable pair', () => {
    for (const text of ['[ ] a', '[x] a', '- [ ] a', '* [x] a', '+ [ ] a']) {
      expect(schalte(schalte(text))).toBe(text);
    }
    expect(schalte(schalte('[] a'))).toBe('[ ] a');
    expect(schalte(schalte('[X] a'))).toBe('[x] a');
  });

  it('changes only the line under the index', () => {
    const text = 'stay\n[] a\n[x] b\nstay';
    const offen = text.indexOf('[]');
    expect(schalte(text, offen)).toBe('stay\n[x] a\n[x] b\nstay');
    const zu = text.indexOf('[x]');
    expect(schalte(text, zu)).toBe('stay\n[] a\n[ ] b\nstay');
    expect(schalte(text, text.indexOf('stay'))).toBe(text);
    expect(schalte('see [x] later', 5)).toBe('see [x] later');
  });

  it('leaves a checkbox inside a code block alone', () => {
    const text = '```\n[] a\n[ ] b\n[X] c\n- [ ] d\n```\n[] e';
    for (const fund of ['[] a', '[ ] b', '[X] c', '- [ ] d']) {
      expect(schalte(text, text.indexOf(fund))).toBe(text);
    }
    const aussen = text.indexOf('[] e');
    expect(schalte(text, aussen)).toBe(text.replace('[] e', '[x] e'));
  });

  it('keeps a carriage return and ignores an index that is not a number', () => {
    expect(schalte('[ ] a\r\n[] b')).toBe('[x] a\r\n[] b');
    expect(schalte('[] a', Number.NaN)).toBe('[] a');
  });
});
