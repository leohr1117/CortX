import { describe, expect, it } from 'vitest';
import { SUCH_MAX, planeSuche, suchMeldung } from './index.ts';

describe('search query', () => {
  it('asks for text and refuses a blank or oversized query', () => {
    expect(planeSuche('')).toEqual({ ok: false, grund: 'leer' });
    expect(planeSuche('   \n\t  ')).toEqual({ ok: false, grund: 'leer' });
    expect(planeSuche('a'.repeat(SUCH_MAX + 1))).toEqual({ ok: false, grund: 'lang' });
    expect(suchMeldung('leer')).toBe('The search is missing or invalid.');
    expect(suchMeldung('lang')).toBe('The search is too long.');
  });

  it('quotes every word so operators and punctuation stay literal', () => {
    expect(planeSuche('  lantern   budget  ')).toEqual({ ok: true, ausdruck: '"lantern" "budget"' });
    expect(planeSuche('say "hi"')).toEqual({ ok: true, ausdruck: '"say" """hi"""' });
    expect(planeSuche('hello OR "world"')).toEqual({ ok: true, ausdruck: '"hello" "OR" """world"""' });
    expect(planeSuche('text:secret')).toEqual({ ok: true, ausdruck: '"text:secret"' });
    expect(planeSuche('*** (" :')).toEqual({ ok: true, ausdruck: '"***" "(""" ":"' });
    expect(planeSuche('a'.repeat(SUCH_MAX))).toEqual({ ok: true, ausdruck: `"${'a'.repeat(SUCH_MAX)}"` });
  });
});
