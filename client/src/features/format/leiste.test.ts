import { describe, expect, it } from 'vitest';
import {
  ART,
  leistenEintraege,
  type FormatBefehl,
} from '../../../../shared/features/format/index.ts';

function befehl(id: FormatBefehl) {
  const eintrag = leistenEintraege().find((kandidat) => kandidat.id === id);
  if (!eintrag) throw new Error('unknown command');
  return eintrag;
}

function leuchtet(id: FormatBefehl, text: string, start: number, ende = start): boolean {
  return befehl(id).isActive(text, start, ende);
}

describe('format bar state', () => {
  it('lights a button only while the caret or the selection sits inside that format', () => {
    for (const eintrag of leistenEintraege()) {
      expect(eintrag.isActive('', 0, 0)).toBe(false);
    }
    expect(leuchtet(ART.fett, '**bold**', 2)).toBe(true);
    expect(leuchtet(ART.fett, '**bold**', 0)).toBe(false);
    expect(leuchtet(ART.fett, '**bold**', 6)).toBe(true);
    expect(leuchtet(ART.fett, '**bold**', 8)).toBe(false);
    expect(leuchtet(ART.fett, '**bold**', 2, 4)).toBe(true);
    expect(leuchtet(ART.fett, '**bold**', 0, 4)).toBe(false);
    expect(leuchtet(ART.kursiv, '*x*', 1)).toBe(true);
    expect(leuchtet(ART.kursiv, '_x_', 1)).toBe(true);
    expect(leuchtet('strich', '~~x~~', 2)).toBe(true);
    expect(leuchtet(ART.code, '`x`', 1)).toBe(true);
    const zaun = '```\n**x**\n```';
    expect(leuchtet(ART.code, zaun, 4)).toBe(true);
    expect(leuchtet(ART.fett, zaun, 4)).toBe(false);
    expect(leuchtet(ART.link, '[a](https://a.test)', 1)).toBe(true);
    expect(leuchtet(ART.link, '[a](https://a.test)', 0, 3)).toBe(false);
    expect(leuchtet(ART.ueberschrift, '= Title', 2)).toBe(true);
    expect(leuchtet(ART.ueberschrift, '# Title', 2)).toBe(true);
    expect(leuchtet(ART.ueberschrift, '#tag', 2)).toBe(false);
    expect(leuchtet(ART.liste, '- a', 2)).toBe(true);
    expect(leuchtet(ART.liste, '* a', 2)).toBe(true);
    expect(leuchtet(ART.liste, '+ a', 2)).toBe(true);
    expect(leuchtet(ART.liste, '12. a', 4)).toBe(true);
    expect(leuchtet(ART.liste, '1.a', 2)).toBe(false);
    expect(leuchtet(ART.haken, '[] a', 3)).toBe(true);
    expect(leuchtet(ART.haken, '[x] a', 4)).toBe(true);
    expect(leuchtet(ART.haken, '- [ ] a', 6)).toBe(true);
    expect(leuchtet(ART.liste, '- [ ] a', 6)).toBe(true);
    expect(leuchtet(ART.haken, '* [x] a', 6)).toBe(true);
    expect(leuchtet(ART.haken, '+ [ ] a', 6)).toBe(true);
    expect(leuchtet(ART.wichtig, '!!a!!', 2)).toBe(true);
    expect(leuchtet(ART.wichtig, '!!!! a', 6)).toBe(true);
    expect(leuchtet(ART.ueberschrift, '= Title\nplain', 0, 14)).toBe(true);
    expect(leuchtet(ART.ueberschrift, 'plain\n= Title', 0, 14)).toBe(false);
  });

  it('follows the command the writing surface just applied', () => {
    const fett = befehl(ART.fett);
    const fettAn = fett.run('Anna', 0, 4);
    expect(fett.isActive(fettAn.text, fettAn.start, fettAn.ende)).toBe(true);
    const fettWeg = fett.run(fettAn.text, fettAn.start, fettAn.ende);
    expect(fett.isActive(fettWeg.text, fettWeg.start, fettWeg.ende)).toBe(false);
    const wichtig = befehl(ART.wichtig);
    const zeile = wichtig.run('Milk', 4, 4);
    expect(wichtig.isActive(zeile.text, zeile.start, zeile.ende)).toBe(true);
    const liste = befehl(ART.liste);
    const listeAn = liste.run('milk', 0, 4);
    expect(liste.isActive(listeAn.text, listeAn.start, listeAn.ende)).toBe(true);
    const haken = befehl(ART.haken);
    const hakenAn = haken.run('call', 0, 4);
    expect(haken.isActive(hakenAn.text, hakenAn.start, hakenAn.ende)).toBe(true);
  });
});
