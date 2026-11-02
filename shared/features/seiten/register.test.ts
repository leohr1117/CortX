import { describe, expect, it } from 'vitest';
import { EBENEN, PFAD_PRAEFIX, PFAD_TRENNER, zerlegeZielzeilen } from './register.ts';

const LEONARDO = '#school/Thema1 text1\ntext1 text1\n#school/Thema2 text2\ntext2 text2';

describe('filing register', () => {
  it('keeps the prefix, separator, and levels in one place', () => {
    expect(PFAD_PRAEFIX).toBe('#');
    expect(PFAD_TRENNER).toBe('/');
    expect(EBENEN).toEqual(['thema', 'seite', 'abschnitt']);
  });

  it('splits Leonardo’s note into two pages and drops the paths', () => {
    expect(zerlegeZielzeilen(LEONARDO)).toEqual([
      { pfad: 'school/Thema1', text: 'text1\ntext1 text1' },
      { pfad: 'school/Thema2', text: 'text2\ntext2 text2' },
    ]);
    for (const teil of zerlegeZielzeilen(LEONARDO) ?? []) {
      expect(teil.text.includes(PFAD_PRAEFIX)).toBe(false);
    }
  });

  it('sends text before the first target line to the inbox and keeps a hash inside a line', () => {
    expect(zerlegeZielzeilen('before the path\n#school/Thema1 body #tag\nstill here')).toEqual([
      { pfad: null, text: 'before the path' },
      { pfad: 'school/Thema1', text: 'body #tag\nstill here' },
    ]);
    expect(zerlegeZielzeilen('See #school/Thema1 later')).toEqual([
      { pfad: null, text: 'See #school/Thema1 later' },
    ]);
  });
});
