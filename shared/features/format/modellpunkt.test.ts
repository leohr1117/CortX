import { splitBlock } from 'prosemirror-commands';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { lade } from './laden.ts';
import { enterTrenntFormat } from './listenbefehl.ts';
import { nummerBruch, nummerEnter, nummerZurueck, punktModell, stelleImModell } from './modellpunkt.ts';
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

function auswahl(text: string, von: number, bis: number): EditorState {
  const doc = lade(text);
  const start = stelleImModell(doc, text, von);
  const ende = stelleImModell(doc, text, bis);
  if (start === null || ende === null || start === ende) throw new Error(`no selection in ${JSON.stringify(text)}`);
  const basis = EditorState.create({ doc });
  return basis.apply(basis.tr.setSelection(TextSelection.create(basis.doc, start, ende)));
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

  it('ends an empty point as a paragraph and does not empty the document', () => {
    for (const text of ['1. ', 'A. ', 'a. ', 'I. ', 'i. ']) {
      const naechster = nummerEnter(zustand(text, 3));
      expect(naechster, text).toBeTruthy();
      expect(naechster!.doc.toString()).toBe('doc(absatz)');
      expect(naechster!.selection.$from.parent.type.name).toBe('absatz');
      expect(speichere(naechster!.doc)).toBe('');
    }
    expect(enter('1. eins\n2. ', '1. eins\n2. '.length)).toBe('1. eins\n');
    expect(enter('1. eins\n2. \n3. zwei', '1. eins\n2. '.length)).toBe('1. eins\n\n1. zwei');
    expect(enter('A. eins\nB. \nC. zwei', 'A. eins\nB. '.length)).toBe('A. eins\n\nA. zwei');
    expect(enter('a. eins\nb. \nc. zwei', 'a. eins\nb. '.length)).toBe('a. eins\n\na. zwei');
    expect(enter('I. eins\nII. \nIII. zwei', 'I. eins\nII. '.length)).toBe('I. eins\n\nI. zwei');
    expect(enter('i. eins\nii. \niii. zwei', 'i. eins\nii. '.length)).toBe('i. eins\n\ni. zwei');
    expect(enter('1. \n2. zwei', 3)).toBe('\n1. zwei');
  });

  it('ignores bullets, plain text, a code fence, and a pasted number without a kind', () => {
    expect(nummerEnter(zustand('- milk', 6))).toBeNull();
    expect(nummerEnter(zustand('hello', 5))).toBeNull();
    expect(nummerEnter(zustand('```\n1. a\n```', 7))).toBeNull();
    const roh = zustand('1. milk', 7, false);
    expect(nummerEnter(roh)).toBeNull();
    const bruch = nummerBruch(roh);
    expect(bruch).not.toBeNull();
    expect(speichere(bruch!.doc)).toBe('1. milk\n1. ');
  });
});


describe('numbered backspace', () => {
  it('turns an empty numbered point into a paragraph and does not empty the document', () => {
    for (const text of ['1. ', 'A. ', 'a. ', 'I. ', 'i. ']) {
      const naechster = nummerZurueck(zustand(text, 3));
      expect(naechster, text).toBeTruthy();
      expect(naechster!.doc.toString()).toBe('doc(absatz)');
      expect(naechster!.selection.$from.parent.type.name).toBe('absatz');
      expect(speichere(naechster!.doc)).toBe('');
    }
    const mitte = nummerZurueck(zustand('1. eins\n2. \n3. zwei', '1. eins\n2. '.length));
    expect(mitte).toBeTruthy();
    expect(speichere(mitte!.doc)).toBe('1. eins\n\n1. zwei');
    expect(mitte!.doc.child(1).type.name).toBe('absatz');
  });

  it('leaves a filled point and a mid-item cursor alone', () => {
    expect(nummerZurueck(zustand('1. milk', 7))).toBeNull();
    expect(nummerZurueck(zustand('1. milk', 3))).toBeNull();
    expect(nummerZurueck(zustand('1. milk', 5))).toBeNull();
    expect(nummerZurueck(zustand('- ', 2))).toBeNull();
    expect(nummerZurueck(auswahl('1. milk', 3, 7))).toBeNull();
  });
});

describe('bullet keys', () => {
  it('leaves a selection, a bare indent, and italic stars alone', () => {
    expect(punktModell(auswahl('- milk', 2, 4), 'enter')).toBeNull();
    expect(punktModell(auswahl('- milk', 2, 4), 'zurueck')).toBeNull();
    expect(punktModell(zustand('  world', 3), 'enter')).toBeNull();
    expect(punktModell(zustand('*test*', 6), 'enter')).toBeNull();
    expect(punktModell(zustand('*test*', 0), 'zurueck')).toBeNull();
  });
});

function weiter(zustand: EditorState): EditorState {
  const kette = punktModell(zustand, 'enter') ?? nummerEnter(zustand) ?? nummerBruch(zustand) ?? enterTrenntFormat(zustand);
  if (kette) return kette;
  let geteilt: EditorState | null = null;
  splitBlock(zustand, (tr) => {
    geteilt = zustand.apply(tr);
  });
  if (!geteilt) throw new Error('enter did nothing');
  return geteilt;
}

describe('enter splits in the model (Clara, 12.11.2026 04:15, variant A)', () => {
  it('keeps bold and code running on both sides of the break', () => {
    const fett = weiter(zustand('1. mi **bo** lk', 9, false)).doc;
    expect(fett.toString()).toBe('doc(punkt("mi ", fett("b")), punkt(fett("o"), " lk"))');
    const code = weiter(zustand('1. a `cd` e', 7, false)).doc;
    expect(code.toString()).toBe('doc(punkt("a ", code("c")), punkt(code("d"), " e"))');
  });

  it('leaves "# " and "- " at the start of the rest as plain text', () => {
    const kopf = weiter(zustand('1. foo # bar', 7, false)).doc;
    expect(kopf.childCount).toBe(2);
    expect(kopf.child(1).type.name).toBe('punkt');
    expect(kopf.child(1).attrs.art).toBe('nummer');
    expect(kopf.child(1).textContent).toBe('# bar');
    const strich = weiter(zustand('1. foo - bar', 7, false)).doc;
    expect(strich.child(1).attrs.art).toBe('nummer');
    expect(strich.child(1).textContent).toBe('- bar');
    expect(strich.child(1).marks).toEqual([]);
  });

  it('turns the rest of a list or number point into the next point of the same kind with the next number', () => {
    const roh = weiter(zustand('1. milk', 5, false)).doc;
    expect(roh.childCount).toBe(2);
    expect(roh.child(1).attrs).toMatchObject({ art: 'nummer', nummerArt: '', nummer: Number(roh.child(0).attrs.nummer) + 1 });
    expect(roh.child(0).textContent).toBe('mi');
    expect(roh.child(1).textContent).toBe('lk');
    expect(speichere(weiter(zustand('1. eins\n2. zwei', 5)).doc)).toBe('1. ei\n2. ns\n3. zwei');
    expect(speichere(weiter(zustand('- milk', 4)).doc)).toBe('- mi\n- lk');
  });

  it('ends the list on enter in an empty number point without a kind, like every editor', () => {
    const allein = weiter(zustand('1. ', 3, false));
    expect(allein.doc.toString()).toBe('doc(absatz)');
    expect(allein.selection.$from.parent.type.name).toBe('absatz');
    const danach = weiter(zustand('1. eins\n2. ', 11, false));
    expect(danach.doc.childCount).toBe(2);
    expect(danach.doc.child(0).textContent).toBe('eins');
    expect(danach.doc.child(1).type.name).toBe('absatz');
    expect(danach.doc.child(1).content.size).toBe(0);
    expect(danach.selection.$from.parent).toBe(danach.doc.child(1));
  });

  it('turns the rest outside a list into a normal paragraph', () => {
    const doc = weiter(zustand('hello', 3)).doc;
    expect(doc.toString()).toBe('doc(absatz("hel"), absatz("lo"))');
    expect(nummerBruch(zustand('hello', 3))).toBeNull();
  });
});
