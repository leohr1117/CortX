import { describe, expect, it } from 'vitest';
import { leseBaum } from './lesen.ts';
import { inlineAn } from './befehl.ts';
import { type InlineArt, type InlineStand } from './register.ts';
import { schalteCode, schalteFett, schalteKursiv, schalteStrich, schalteWichtig } from './befehl.ts';
import type { TextWahl } from './ueberschrift.ts';
import { WICHTIG_ZEILE } from './zeile.ts';

const ARTEN: readonly InlineArt[] = ['fett', 'kursiv', 'streich', 'wichtig', 'code'];

const schalter: Record<InlineArt, (text: string, start: number, ende: number) => TextWahl> = {
  fett: schalteFett,
  kursiv: schalteKursiv,
  streich: schalteStrich,
  wichtig: schalteWichtig,
  code: schalteCode,
};

function paare(): Array<[InlineArt, InlineArt]> {
  const liste: Array<[InlineArt, InlineArt]> = [];
  for (const a of ARTEN) {
    for (const b of ARTEN) {
      if (a < b) liste.push([a, b]);
    }
  }
  return liste;
}

function wende(wahl: TextWahl, art: InlineArt): TextWahl {
  return schalter[art](wahl.text, wahl.start, wahl.ende);
}

function an(wahl: TextWahl): InlineStand {
  return inlineAn(wahl.text, wahl.start, wahl.ende);
}

function zeilenWichtig(text: string): boolean {
  const von = 0;
  const kopf = text.slice(von, text.indexOf('\n') < 0 ? text.length : text.indexOf('\n'));
  return kopf.startsWith(WICHTIG_ZEILE);
}

function knopf(wahl: TextWahl, art: InlineArt): boolean {
  if (art === 'wichtig' && zeilenWichtig(wahl.text)) return true;
  return an(wahl)[art];
}

function aus(wahl: TextWahl, reihe: readonly InlineArt[], erwartung: TextWahl): void {
  let stand = wahl;
  const noch = new Set<InlineArt>(reihe);
  for (const art of reihe) {
    expect(knopf(stand, art)).toBe(true);
    stand = wende(stand, art);
    noch.delete(art);
    expect(knopf(stand, art)).toBe(false);
    for (const andere of noch) expect(knopf(stand, andere)).toBe(true);
  }
  expect(stand.text).toBe(erwartung.text);
  expect(stand.start).toBe(erwartung.start);
  expect(stand.ende).toBe(erwartung.ende);
}

describe('nested inline formats', () => {
  it('keeps a bare star run as text', () => {
    expect(leseBaum('****')).toEqual([{ art: 'absatz', zeilen: [[{ art: 'text', text: '****' }]] }]);
  });

  it.each(paare())('toggles %s and %s around a word in both orders', (a, b) => {
    for (const reihe of [
      [a, b],
      [b, a],
    ] as const) {
      const beide = wende(wende({ text: 'Hi', start: 0, ende: 2 }, reihe[0]), reihe[1]);
      expect(knopf(beide, a)).toBe(true);
      expect(knopf(beide, b)).toBe(true);
      expect(beide.text).toContain('Hi');
      aus(beide, [a, b], { text: 'Hi', start: 0, ende: 2 });
      aus(beide, [b, a], { text: 'Hi', start: 0, ende: 2 });
    }
  });

  it.each(paare())('toggles %s and %s at a bare cursor in both orders', (a, b) => {
    for (const reihe of [
      [a, b],
      [b, a],
    ] as const) {
      const beide = wende(wende({ text: '', start: 0, ende: 0 }, reihe[0]), reihe[1]);
      expect(knopf(beide, a)).toBe(true);
      expect(knopf(beide, b)).toBe(true);
      aus(beide, [a, b], { text: '', start: 0, ende: 0 });
      aus(beide, [b, a], { text: '', start: 0, ende: 0 });
    }
  });

  it('toggles all five around a word in several orders', () => {
    let wahl: TextWahl = { text: 'Hi', start: 0, ende: 2 };
    for (const art of ARTEN) wahl = wende(wahl, art);
    for (const art of ARTEN) expect(knopf(wahl, art)).toBe(true);
    expect(wahl.text).toContain('Hi');
    const folgen: InlineArt[][] = [
      ['code', 'wichtig', 'streich', 'kursiv', 'fett'],
      ['fett', 'kursiv', 'streich', 'wichtig', 'code'],
      ['kursiv', 'code', 'fett', 'streich', 'wichtig'],
      ['streich', 'wichtig', 'fett', 'code', 'kursiv'],
    ];
    for (const reihe of folgen) aus(wahl, reihe, { text: 'Hi', start: 0, ende: 2 });
  });

  it('toggles all five at a bare cursor in several orders', () => {
    let wahl: TextWahl = { text: '', start: 0, ende: 0 };
    for (const art of ARTEN) wahl = wende(wahl, art);
    for (const art of ARTEN) expect(knopf(wahl, art)).toBe(true);
    const folgen: InlineArt[][] = [
      ['code', 'wichtig', 'streich', 'kursiv', 'fett'],
      ['fett', 'code', 'kursiv', 'wichtig', 'streich'],
      ['wichtig', 'streich', 'fett', 'code', 'kursiv'],
    ];
    for (const reihe of folgen) aus(wahl, reihe, { text: '', start: 0, ende: 0 });
  });

  it('turns underscore markers off through the same register', () => {
    expect(schalteFett('__Hi__', 2, 4)).toEqual({ text: 'Hi', start: 0, ende: 2 });
    expect(schalteKursiv('_Hi_', 1, 3)).toEqual({ text: 'Hi', start: 0, ende: 2 });
  });

  it('reads bold and italic from a triple star when the word is selected', () => {
    const wahl = { text: '***Hi***', start: 3, ende: 5 };
    expect(an(wahl).fett).toBe(true);
    expect(an(wahl).kursiv).toBe(true);
    expect(schalteKursiv(wahl.text, wahl.start, wahl.ende).text).toBe('**Hi**');
    expect(schalteFett(wahl.text, wahl.start, wahl.ende).text).toBe('*Hi*');
  });
});
