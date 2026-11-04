import { history, undo } from 'prosemirror-history';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { ART } from './baum.ts';
import { lade } from './laden.ts';
import { modell } from './modell.ts';
import { nummerAktiv, wechselNummer } from './modellart.ts';
import './modellbefehl.ts';
import { NUMMER_ART, type NummerArt } from './nummer.ts';
import { formatVon } from './register.ts';
import { speichere } from './speichern.ts';

function alles(text: string): EditorState {
  const doc = lade(text);
  return EditorState.create({
    schema: modell,
    doc,
    selection: TextSelection.create(doc, TextSelection.atStart(doc).from, TextSelection.atEnd(doc).to),
  });
}

function inZeile(text: string, index: number): EditorState {
  const doc = lade(text);
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
  const node = doc.child(index);
  const innen = Math.min(pos + 1, pos + node.nodeSize - 1);
  return EditorState.create({ schema: modell, doc, selection: TextSelection.create(doc, innen) });
}

function mitVerlauf(text: string): EditorState {
  const doc = lade(text);
  return EditorState.create({
    schema: modell,
    doc,
    selection: TextSelection.create(doc, TextSelection.atStart(doc).from, TextSelection.atEnd(doc).to),
    plugins: [history()],
  });
}

function liste(zustand: EditorState, id: typeof ART.liste | typeof ART.haken): EditorState {
  const schalt = formatVon(id).modell;
  if (!schalt) throw new Error('missing command');
  return schalt.run(zustand);
}

const ARTEN: readonly (readonly [NummerArt, string])[] = [
  [NUMMER_ART.zahl, '1. milk'],
  [NUMMER_ART.gross, 'A. milk'],
  [NUMMER_ART.klein, 'a. milk'],
  [NUMMER_ART.roemisch, 'I. milk'],
  [NUMMER_ART.roemischKlein, 'i. milk'],
];

describe('numbered list kind', () => {
  it('replaces the marker for every kind and leaves no old character in the text', () => {
    for (const [art, text] of ARTEN) {
      const start = art === NUMMER_ART.zahl ? 'A. milk' : '1. milk';
      const zustand = wechselNummer(alles(start), art);
      expect(zustand.doc.textContent).toBe('milk');
      expect(speichere(zustand.doc)).toBe(text);
      expect(nummerAktiv(zustand, art)).toBe(true);
      for (const [andere] of ARTEN) {
        if (andere !== art) expect(nummerAktiv(zustand, andere)).toBe(false);
      }
    }
    let kette = alles('- milk');
    for (const [art, text] of ARTEN) {
      kette = wechselNummer(kette, art);
      expect(kette.doc.textContent).toBe('milk');
      expect(speichere(kette.doc)).toBe(text);
    }
    const aufgabe = wechselNummer(alles('[x] milk'), NUMMER_ART.roemisch);
    expect(aufgabe.doc.textContent).toBe('milk');
    expect(speichere(aufgabe.doc)).toBe('I. milk');
    const fett = wechselNummer(alles('1. **milk**'), NUMMER_ART.klein);
    expect(speichere(fett.doc)).toBe('a. **milk**');
  });

  it('numbers every selected line and turns the same kind back into text', () => {
    const gross = wechselNummer(alles('1. milk\n2. bread'), NUMMER_ART.gross);
    expect(gross.doc.textContent).toBe('milkbread');
    expect(speichere(gross.doc)).toBe('A. milk\nB. bread');
    expect(nummerAktiv(gross, NUMMER_ART.gross)).toBe(true);
    const text = wechselNummer(gross, NUMMER_ART.gross);
    expect(speichere(text.doc)).toBe('milk\nbread');
    expect(text.doc.child(0).type.name).toBe('absatz');
    expect(nummerAktiv(text, NUMMER_ART.gross)).toBe(false);
  });

  it('replaces a number with a bullet or a task and keeps an untouched line', () => {
    const aufzaehlung = liste(inZeile('1. milk\n* bread', 0), ART.liste);
    expect(aufzaehlung.doc.child(0).textContent).toBe('milk');
    expect(aufzaehlung.doc.child(1).textContent).toBe('bread');
    expect(speichere(aufzaehlung.doc)).toBe('- milk\n* bread');
    const aufgabe = liste(inZeile('A. milk\n* bread', 0), ART.haken);
    expect(aufgabe.doc.child(0).textContent).toBe('milk');
    expect(speichere(aufgabe.doc)).toBe('[] milk\n* bread');
    expect(speichere(liste(alles('I. one\nII. two'), ART.liste).doc)).toBe('- one\n- two');
    expect(speichere(liste(alles('i. one\nii. two'), ART.haken).doc)).toBe('[] one\n[] two');
    const eine = wechselNummer(inZeile('1. milk\n* bread', 0), NUMMER_ART.gross);
    expect(eine.doc.child(0).textContent).toBe('milk');
    expect(speichere(eine.doc)).toBe('A. milk\n* bread');
    const weiter = wechselNummer(inZeile('A. a\nplain', 1), NUMMER_ART.gross);
    expect(speichere(weiter.doc)).toBe('A. a\nB. plain');
  });

  it('keeps one undo step', () => {
    let zustand = mitVerlauf('1. milk');
    zustand = wechselNummer(zustand, NUMMER_ART.gross);
    expect(speichere(zustand.doc)).toBe('A. milk');
    let zurueck = zustand;
    expect(undo(zustand, (tr) => {
      zurueck = zustand.apply(tr);
    })).toBe(true);
    expect(speichere(zurueck.doc)).toBe('1. milk');
  });
});
