import { type Node } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { ART } from './baum.ts';
import { lade } from './laden.ts';
import { leseBaum } from './lesen.ts';
import { exportiere, importiere } from './md.ts';
import { modell } from './modell.ts';
import { NUMMER_ART, erkenne, naechste, nummerLauf, nummeriere, schreibeNummer } from './nummer.ts';
import { speichere } from './speichern.ts';

function ohne(text: string, index: number): Node {
  const geladen = lade(text);
  const kinder: Node[] = [];
  geladen.forEach((knoten, _offset, stelle) => {
    kinder.push(stelle === index ? knoten.type.create({ ...knoten.attrs, quelle: '' }, knoten.content) : knoten);
  });
  return modell.node('doc', null, kinder);
}

describe('numbered list kinds', () => {
  it('recognizes each kind at the start of a line', () => {
    expect(erkenne('1. eins')).toEqual({ art: NUMMER_ART.zahl, gelesen: 1, laenge: 3 });
    expect(erkenne('9. eins')).toEqual({ art: NUMMER_ART.zahl, gelesen: 9, laenge: 3 });
    expect(erkenne('A. eins')).toEqual({ art: NUMMER_ART.gross, gelesen: 1, laenge: 3 });
    expect(erkenne('a. eins')).toEqual({ art: NUMMER_ART.klein, gelesen: 1, laenge: 3 });
    expect(erkenne('I. eins')).toEqual({ art: NUMMER_ART.roemisch, gelesen: 1, laenge: 3 });
    expect(erkenne('i. eins')).toEqual({ art: NUMMER_ART.roemischKlein, gelesen: 1, laenge: 3 });
    expect(erkenne('AA. eins')).toEqual({ art: NUMMER_ART.gross, gelesen: 27, laenge: 4 });
    expect(erkenne('III. eins')).toEqual({ art: NUMMER_ART.roemisch, gelesen: 3, laenge: 5 });
    expect(erkenne('iv. eins')).toEqual({ art: NUMMER_ART.roemischKlein, gelesen: 4, laenge: 4 });
    expect(erkenne('Note. hallo')).toBeNull();
    expect(erkenne('See. you')).toBeNull();
    expect(erkenne('1.kein')).toBeNull();
    expect(erkenne('  A. nein')).toBeNull();
  });

  it('keeps a letter list together when a later marker also looks roman', () => {
    const lauf = nummerLauf(['B. eins', 'C. zwei', 'I. drei', 'J. vier']);
    expect(lauf.map((zeile) => zeile?.art)).toEqual([NUMMER_ART.gross, NUMMER_ART.gross, NUMMER_ART.gross, NUMMER_ART.gross]);
    expect(lauf.map((zeile) => zeile?.nummer)).toEqual([1, 2, 3, 4]);
    expect(nummerLauf(['I. eins', 'II. zwei', 'J. drei']).map((zeile) => zeile?.art)).toEqual([
      NUMMER_ART.roemisch,
      NUMMER_ART.roemisch,
      NUMMER_ART.gross,
    ]);
  });

  it('counts forward, including the end of the alphabet and roman four', () => {
    expect(naechste(NUMMER_ART.gross, 26)).toBe('AA');
    expect(naechste(NUMMER_ART.klein, 26)).toBe('aa');
    expect(naechste(NUMMER_ART.roemisch, 3)).toBe('IV');
    expect(naechste(NUMMER_ART.roemischKlein, 3)).toBe('iv');
    expect(naechste(NUMMER_ART.zahl, 9)).toBe('10');
    expect(schreibeNummer(NUMMER_ART.gross, 1)).toBe('A');
    expect(schreibeNummer(NUMMER_ART.roemisch, 4)).toBe('IV');
    expect(nummeriere(NUMMER_ART.gross, 25, 3)).toEqual(['Y.', 'Z.', 'AA.']);
    expect(nummeriere(NUMMER_ART.klein, 25, 3)).toEqual(['y.', 'z.', 'aa.']);
    expect(nummeriere(NUMMER_ART.roemisch, 3, 2)).toEqual(['III.', 'IV.']);
    expect(nummeriere(NUMMER_ART.roemischKlein, 3, 2)).toEqual(['iii.', 'iv.']);
    expect(nummeriere(NUMMER_ART.zahl, 1, 3)).toEqual(['1.', '2.', '3.']);
  });

  it('stores kind and counted number, and writes an edited line in order', () => {
    const gross = lade('A. eins\nC. zwei');
    expect(gross.child(0).attrs).toMatchObject({ art: ART.nummer, nummerArt: NUMMER_ART.gross, nummer: 1, zeichen: '1.' });
    expect(gross.child(1).attrs).toMatchObject({ art: ART.nummer, nummerArt: NUMMER_ART.gross, nummer: 2 });
    expect(speichere(ohne('A. eins\nC. zwei', 1))).toBe('A. eins\nB. zwei');

    const roman = lade('I. eins\nIII. zwei\nIV. drei');
    expect(roman.child(2).attrs).toMatchObject({ nummerArt: NUMMER_ART.roemisch, nummer: 3 });
    expect(speichere(ohne('I. eins\nIII. zwei', 1))).toBe('I. eins\nII. zwei');
    expect(speichere(ohne('i. eins\niv. zwei', 1))).toBe('i. eins\nii. zwei');
    expect(speichere(ohne('1. eins\n9. zwei', 1))).toBe('1. eins\n2. zwei');
    expect(speichere(ohne('a. eins\nc. zwei', 1))).toBe('a. eins\nb. zwei');
    expect(speichere(ohne('Y. eins\nAA. zwei', 1))).toBe('Y. eins\nB. zwei');
  });

  it('round-trips every kind and keeps untouched lines byte for byte', () => {
    const texte = [
      '1. eins\n2. zwei',
      '1. eins\n9. zwei',
      'A. eins\nC. zwei',
      'a. eins\nc. zwei',
      'I. eins\nIII. zwei\nIV. drei',
      'i. eins\niv. zwei',
      'Y. eins\nAA. zwei',
      'y. eins\naa. zwei',
      'A. eins\r\nC. zwei\n- milk\n[] open\nI. rom\n1. zahl\na. klein',
      '```\nA. nicht\nI. nicht\n```',
      'Note. hallo\nSee. you',
      '- milk\n* bread\n- [ ] open\n- [x] done',
    ];
    for (const text of texte) {
      expect(speichere(lade(text)), text).toBe(text);
      expect(exportiere(importiere(text)), text).toBe(text);
    }
    expect(lade('```\nA. nicht\n```').child(1).textContent).toBe('A. nicht');
    expect(lade('Note. hallo').child(0).type.name).toBe('absatz');
    expect(lade('A. eins', false).child(0).type.name).toBe('absatz');
    expect(lade('1. eins', false).child(0).attrs).toMatchObject({ art: ART.nummer, nummer: 0, nummerArt: '' });
    expect(leseBaum('A. eins')[0]).toMatchObject({ art: ART.absatz });
    expect(leseBaum('A. eins\nB. zwei', true)[0]).toMatchObject({ art: ART.liste, geordnet: true, schrift: NUMMER_ART.gross });
    expect(leseBaum('- milk\n1. eins', true).map((block) => block.art)).toEqual([ART.liste, ART.liste]);
  });
});
