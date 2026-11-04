import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { lade } from './laden.ts';
import { nummerBruch, nummerEnter, stelleImModell } from './modellpunkt.ts';
import { NUMMER_ART } from './nummer.ts';
import { speichere } from './speichern.ts';

function zustand(text: string, index: number, arten = true): EditorState {
  const doc = lade(text, arten);
  const pos = stelleImModell(doc, text, index);
  if (pos === null) throw new Error(`no position for ${index} in ${JSON.stringify(text)}`);
  const basis = EditorState.create({ doc });
  const $pos = basis.doc.resolve(pos);
  const auswahl = $pos.parent.inlineContent ? TextSelection.create(basis.doc, pos) : TextSelection.near($pos);
  return basis.apply(basis.tr.setSelection(auswahl));
}

function enter(text: string, index: number): string {
  const naechster = nummerEnter(zustand(text, index));
  if (!naechster) throw new Error(`enter did nothing in ${JSON.stringify(text)}`);
  return speichere(naechster.doc);
}

describe('numbered enter', () => {
  it('adds the next point of the same kind', () => {
    expect(enter('1. milk', 7)).toBe('1. milk\n2. ');
    expect(enter('A. milk', 7)).toBe('A. milk\nB. ');
    expect(enter('a. milk', 7)).toBe('a. milk\nb. ');
    expect(enter('I. milk', 7)).toBe('I. milk\nII. ');
    expect(enter('i. milk', 7)).toBe('i. milk\nii. ');
    const roman = nummerEnter(zustand('I. milk', 7));
    expect(roman?.doc.child(1).attrs).toMatchObject({ nummerArt: NUMMER_ART.roemisch, nummer: 2 });
    expect(nummerEnter(zustand('i. eins', 7))?.doc.child(1).attrs).toMatchObject({ nummerArt: NUMMER_ART.roemischKlein, nummer: 2 });
    expect(nummerEnter(zustand('A. eins', 7))?.doc.child(1).attrs).toMatchObject({ nummerArt: NUMMER_ART.gross, nummer: 2 });
    expect(nummerEnter(zustand('a. eins', 7))?.doc.child(1).attrs).toMatchObject({ nummerArt: NUMMER_ART.klein, nummer: 2 });
  });

  it('splits at the cursor and keeps the following numbers in order', () => {
    expect(enter('1. hello', 6)).toBe('1. hel\n2. lo');
    expect(enter('1. eins\n2. zwei', 7)).toBe('1. eins\n2. \n3. zwei');
    expect(enter('A. eins\nB. zwei', 7)).toBe('A. eins\nB. \nC. zwei');
    expect(enter('a. eins\nb. zwei', 7)).toBe('a. eins\nb. \nc. zwei');
    expect(enter('I. eins\nII. zwei', 7)).toBe('I. eins\nII. \nIII. zwei');
    expect(enter('i. eins\nii. zwei', 7)).toBe('i. eins\nii. \niii. zwei');
    expect(enter('1. eins\n9. zwei', 7)).toBe('1. eins\n2. \n3. zwei');
    expect(enter('Y. eins\nZ. zwei', 7)).toBe('Y. eins\nB. \nC. zwei');
  });

  it('leaves untouched lines byte for byte when their place does not change', () => {
    expect(enter('A. eins\nC. zwei', 'A. eins\nC. zwei'.length)).toBe('A. eins\nC. zwei\nC. ');
    expect(enter('1. eins\n9. zwei', '1. eins\n9. zwei'.length)).toBe('1. eins\n9. zwei\n3. ');
    expect(enter('I. eins\nIII. zwei', 'I. eins\nIII. zwei'.length)).toBe('I. eins\nIII. zwei\nIII. ');
    expect(enter('A. eins\n1. zwei', 7)).toBe('A. eins\nB. \n1. zwei');
  });

  it('ends an empty point and closes the following numbers', () => {
    expect(enter('1. ', 3)).toBe('');
    expect(enter('A. ', 3)).toBe('');
    expect(enter('a. ', 3)).toBe('');
    expect(enter('I. ', 3)).toBe('');
    expect(enter('i. ', 3)).toBe('');
    expect(enter('1. eins\n2. ', '1. eins\n2. '.length)).toBe('1. eins\n');
    expect(enter('1. eins\n2. \n3. zwei', '1. eins\n2. '.length)).toBe('1. eins\n2. zwei');
    expect(enter('A. eins\nB. \nC. zwei', 'A. eins\nB. '.length)).toBe('A. eins\nB. zwei');
    expect(enter('a. eins\nb. \nc. zwei', 'a. eins\nb. '.length)).toBe('a. eins\nb. zwei');
    expect(enter('I. eins\nII. \nIII. zwei', 'I. eins\nII. '.length)).toBe('I. eins\nII. zwei');
    expect(enter('i. eins\nii. \niii. zwei', 'i. eins\nii. '.length)).toBe('i. eins\nii. zwei');
    expect(enter('1. \n2. zwei', 3)).toBe('1. zwei');
  });

  it('ignores bullets, plain text, a code fence, and a pasted number without a kind', () => {
    expect(nummerEnter(zustand('- milk', 6))).toBeNull();
    expect(nummerEnter(zustand('hello', 5))).toBeNull();
    expect(nummerEnter(zustand('```\n1. a\n```', 7))).toBeNull();
    const roh = zustand('1. milk', 7, false);
    expect(nummerEnter(roh)).toBeNull();
    const bruch = nummerBruch(roh);
    expect(bruch).not.toBeNull();
    expect(speichere(bruch!.doc)).toBe('1. milk\n\n');
  });
});
