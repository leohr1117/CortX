import { describe, expect, it } from 'vitest';
import { exportDateiname } from './exportDateiname.ts';

describe('exportDateiname', () => {
  it('normalizes NFD letters to NFC in the filename', () => {
    const nfd = 'Cafe\u0301'.normalize('NFD');
    expect(nfd).not.toBe('Caf\u00e9');
    expect(exportDateiname(nfd)).toBe('Caf\u00e9.md');
    expect(exportDateiname('Caf\u00e9')).toBe('Caf\u00e9.md');
  });

  it('does not keep emoji in the name and does not split a surrogate pair at the 60 cut', () => {
    const emoji = '\u{1F600}';
    expect(emoji.length).toBe(2);
    expect(Array.from(emoji)).toHaveLength(1);
    expect(exportDateiname(`${'x'.repeat(59)}${emoji}`)).toBe(`${'x'.repeat(59)}.md`);
    expect(exportDateiname(`${'x'.repeat(60)}${emoji}`)).toBe(`${'x'.repeat(60)}.md`);
    const letter = '\u{1D400}';
    expect(letter.length).toBe(2);
    expect(Array.from(letter)).toHaveLength(1);
    expect(exportDateiname(`${'x'.repeat(59)}${letter}`)).toBe(`${'x'.repeat(59)}${letter}.md`);
    expect(exportDateiname(`${'x'.repeat(60)}${letter}`)).toBe(`${'x'.repeat(60)}.md`);
  });

  it('prefixes reserved Windows names in any case', () => {
    expect(exportDateiname('CON')).toBe('note-CON.md');
    expect(exportDateiname('com1')).toBe('note-com1.md');
    expect(exportDateiname('COM9')).toBe('note-COM9.md');
    expect(exportDateiname('prn')).toBe('note-prn.md');
    expect(exportDateiname('AUX')).toBe('note-AUX.md');
    expect(exportDateiname('NUL')).toBe('note-NUL.md');
    expect(exportDateiname('lpt1')).toBe('note-lpt1.md');
    expect(exportDateiname('CON notes')).toBe('CON notes.md');
  });

  it('falls back to note.md when only special characters remain', () => {
    expect(exportDateiname('!!??')).toBe('note.md');
    expect(exportDateiname('***')).toBe('note.md');
    expect(exportDateiname('---')).toBe('note.md');
    expect(exportDateiname('   ')).toBe('note.md');
    expect(exportDateiname('')).toBe('note.md');
  });

  it('keeps letters including umlauts and eszett, digits, spaces, dashes and underscores', () => {
    expect(exportDateiname('Ueberschrift 1_2')).toBe('Ueberschrift 1_2.md');
    expect(exportDateiname('B\u00e4r-\u00dcbung \u00df')).toBe('B\u00e4r-\u00dcbung \u00df.md');
  });

  it('replaces other characters with dashes, collapses dashes and trims edges', () => {
    expect(exportDateiname('A/B::C')).toBe('A-B-C.md');
    expect(exportDateiname('Hello---World')).toBe('Hello-World.md');
    expect(exportDateiname(' - Hello - ')).toBe('Hello.md');
  });

  it('trims to 60 code points and trims new edge dashes after the cut', () => {
    const lang = `${'a'.repeat(59)}!b`;
    expect(exportDateiname(lang)).toBe(`${'a'.repeat(59)}.md`);
  });
});
