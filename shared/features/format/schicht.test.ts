import { describe, expect, it } from 'vitest';
import { schalteCode, schalteWichtig } from './befehl.ts';
import { leseDokument } from './lesen.ts';
import { STIL_REGISTER, kombiniereStil, stilAttribut, type FormatStil } from './register.ts';
import type { TextWahl } from './ueberschrift.ts';

const CODE: FormatStil = {
  schrift: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
  hintergrund: 'var(--flaeche-2)',
};
const WICHTIG: FormatStil = { hintergrund: '#f3e2a8', farbe: '#1a1a1a' };
const BEIDE: FormatStil = { schrift: CODE.schrift, hintergrund: '#f3e2a8', farbe: '#1a1a1a' };

function wende(wahl: TextWahl, schritt: (text: string, start: number, ende: number) => TextWahl): TextWahl {
  return schritt(wahl.text, wahl.start, wahl.ende);
}

function artenAuf(text: string, wort: string): string[] {
  const bei = text.indexOf(wort);
  const satz = new Set<string>();
  for (const beleg of leseDokument(text).belege) {
    if (bei >= beleg.von && bei < beleg.bis) satz.add(beleg.art);
  }
  return [...satz].sort();
}

describe('combined inline styles', () => {
  it('paints important and code the same in either order', () => {
    expect(kombiniereStil(['code', 'wichtig'])).toEqual(BEIDE);
    expect(kombiniereStil(['wichtig', 'code'])).toEqual(BEIDE);
    expect(stilAttribut(['wichtig', 'code'])).toBe('--stil-hintergrund:#f3e2a8');
    expect(stilAttribut(['code', 'wichtig'])).toBe(stilAttribut(['wichtig', 'code']));
  });

  it('leaves every other pair on the styles of the formats it has', () => {
    for (const art of ['fett', 'kursiv', 'streich']) {
      expect(kombiniereStil([art, 'code'])).toEqual(CODE);
      expect(kombiniereStil(['code', art])).toEqual(CODE);
      expect(kombiniereStil([art, 'wichtig'])).toEqual(WICHTIG);
      expect(kombiniereStil(['wichtig', art])).toEqual(WICHTIG);
      expect(stilAttribut([art, 'code'])).toBeUndefined();
      expect(stilAttribut([art, 'wichtig'])).toBeUndefined();
      expect(kombiniereStil([art])).toEqual({});
    }
    expect(kombiniereStil(['fett', 'kursiv'])).toEqual({});
    expect(kombiniereStil(['code'])).toEqual(CODE);
    expect(kombiniereStil(['wichtig'])).toEqual(WICHTIG);
  });

  it('keeps both formats on the word whichever button comes first', () => {
    const anfang: TextWahl = { text: 'Hi', start: 0, ende: 2 };
    const erstCode = wende(wende(anfang, schalteCode), schalteWichtig);
    const erstWichtig = wende(wende(anfang, schalteWichtig), schalteCode);
    expect(erstCode.text).toBe('!!`Hi`!!');
    expect(erstWichtig.text).toBe('!!`Hi`!!');
    expect(artenAuf(erstCode.text, 'Hi')).toEqual(['code', 'wichtig']);
    expect(artenAuf(erstWichtig.text, 'Hi')).toEqual(['code', 'wichtig']);
    expect(kombiniereStil(artenAuf(erstCode.text, 'Hi'))).toEqual(BEIDE);
    expect(kombiniereStil(['fett', 'kursiv', 'streich', 'wichtig', 'code'])).toEqual(BEIDE);
    expect(kombiniereStil(['code', 'streich', 'fett', 'kursiv', 'wichtig'])).toEqual(BEIDE);
  });

  it('leaves bangs inside a code span as code', () => {
    expect(artenAuf('!!!! `Gold`', 'Gold')).toEqual(['code', 'wichtig']);
    expect(artenAuf('`!!not!!`', 'not')).toEqual(['code']);
    expect(kombiniereStil(artenAuf('`!!not!!`', 'not'))).toEqual(CODE);
    expect(artenAuf('**`Bold`**', 'Bold')).toEqual(['code', 'fett']);
    expect(kombiniereStil(artenAuf('**`Bold`**', 'Bold'))).toEqual(CODE);
    expect(artenAuf('!!Anna!!', 'Anna')).toEqual(['wichtig']);
    expect(kombiniereStil(artenAuf('!!Anna!!', 'Anna'))).toEqual(WICHTIG);
  });

  it('uses the register values that the stylesheet already shows for each format', () => {
    const code = STIL_REGISTER.find((eintrag) => eintrag.art === 'code');
    const wichtig = STIL_REGISTER.find((eintrag) => eintrag.art === 'wichtig');
    expect(code?.stil).toEqual(CODE);
    expect(wichtig?.stil).toEqual(WICHTIG);
  });
});
