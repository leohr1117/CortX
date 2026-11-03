import { history, undo } from 'prosemirror-history';
import { type Node } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { ART } from './baum.ts';
import { lade } from './laden.ts';
import { modell } from './modell.ts';
import { entferneFormatierung } from './modellbefehl.ts';
import { formatVon, leistenEintraege, type FormatBefehl } from './register.ts';
import { speichere } from './speichern.ts';

const FUENF = [ART.fett, ART.kursiv, 'strich', ART.wichtig, ART.code] as const;

function alles(doc: Node): EditorState {
  return EditorState.create({
    schema: modell,
    doc,
    selection: TextSelection.create(doc, TextSelection.atStart(doc).from, TextSelection.atEnd(doc).to),
  });
}

function ausText(text: string): EditorState {
  return alles(lade(text));
}

function fund(doc: Node, nadel: string): number {
  let pos = -1;
  doc.descendants((node, start) => {
    if (pos >= 0 || !node.isText || !node.text) return;
    const index = node.text.indexOf(nadel);
    if (index >= 0) pos = start + index;
  });
  if (pos < 0) throw new Error('missing text');
  return pos;
}

function cursor(doc: Node, pos: number): EditorState {
  return EditorState.create({ schema: modell, doc, selection: TextSelection.create(doc, pos) });
}

function lauf(id: FormatBefehl, zustand: EditorState, ziel?: string): EditorState {
  const schalt = formatVon(id).modell;
  if (!schalt) throw new Error('missing command');
  return schalt.run(zustand, ziel);
}

function aktiv(id: FormatBefehl, zustand: EditorState): boolean {
  return formatVon(id).modell?.isActive(zustand) ?? false;
}

function marken(doc: Node): string[] {
  const namen = new Set<string>();
  doc.descendants((node) => {
    if (!node.isText) return;
    for (const mark of node.marks) namen.add(mark.type.name);
  });
  return [...namen].sort();
}

describe('model commands', () => {
  it('gives every bar command a model command and reads isActive from the model', () => {
    for (const eintrag of leistenEintraege()) {
      expect(typeof eintrag.modell?.run).toBe('function');
      expect(typeof eintrag.modell?.isActive).toBe('function');
    }
    expect(formatVon(ART.codeblock).modell).toBeUndefined();
    expect(formatVon(ART.nummer).modell).toBeUndefined();
    expect(modell.marks.code?.spec.inclusive).toBe(false);
    expect(modell.marks.link?.spec.inclusive).toBe(false);
    for (const id of [ART.fett, ART.kursiv, 'strich', ART.wichtig]) {
      expect(modell.marks[id]?.spec.inclusive === false).toBe(false);
    }
  });

  it('bolds a mixed selection and clears it on the second press', () => {
    let zustand = ausText('**a**\n**b**\n**c** d **e**');
    expect(aktiv(ART.fett, zustand)).toBe(false);
    zustand = lauf(ART.fett, zustand);
    expect(speichere(zustand.doc)).toBe('**a**\n**b**\n**c d e**');
    expect(aktiv(ART.fett, zustand)).toBe(true);
    zustand = lauf(ART.fett, zustand);
    expect(speichere(zustand.doc)).toBe('a\nb\nc d e');
    expect(aktiv(ART.fett, zustand)).toBe(false);
  });

  it('removes bold from a fully bold selection and keeps the other formats', () => {
    let zustand = ausText('x');
    zustand = lauf(ART.kursiv, zustand);
    zustand = lauf('strich', zustand);
    zustand = lauf(ART.wichtig, zustand);
    zustand = lauf(ART.fett, zustand);
    expect(marken(zustand.doc)).toEqual([...FUENF].filter((id) => id !== ART.code).sort());
    zustand = lauf(ART.fett, zustand);
    expect(marken(zustand.doc)).toEqual([ART.kursiv, 'strich', ART.wichtig].sort());
    expect(speichere(zustand.doc)).not.toContain('**');
  });

  it('reaches the same five-format combination in any order', () => {
    const folgen = [
      [ART.fett, ART.kursiv, 'strich', ART.wichtig, ART.code],
      [ART.code, ART.wichtig, 'strich', ART.kursiv, ART.fett],
      ['strich', ART.code, ART.fett, ART.wichtig, ART.kursiv],
    ] as const;
    const texte = folgen.map((folge) => {
      let zustand = ausText('x');
      for (const id of folge) zustand = lauf(id, zustand);
      expect(marken(zustand.doc)).toEqual([...FUENF].sort());
      return speichere(zustand.doc);
    });
    expect(new Set(texte).size).toBe(1);
    expect(texte[0]).toContain('`x`');
  });

  it('ignores whitespace when the rest of the selection is bold', () => {
    const fett = modell.marks.fett!.create();
    const doc = modell.node('doc', null, [
      modell.node('absatz', { quelle: '' }, [modell.text('x', [fett]), modell.text(' ')]),
    ]);
    let zustand = alles(doc);
    expect(aktiv(ART.fett, zustand)).toBe(true);
    zustand = lauf(ART.fett, zustand);
    expect(marken(zustand.doc)).toEqual([]);
    expect(zustand.doc.textContent).toBe('x ');
  });

  it('stores a mark for later typing and leaves the word alone', () => {
    const doc = lade('abc');
    let zustand = cursor(doc, fund(doc, 'abc') + 1);
    zustand = lauf(ART.fett, zustand);
    expect(zustand.doc.eq(doc)).toBe(true);
    expect(zustand.storedMarks?.map((mark) => mark.type.name)).toEqual([ART.fett]);
    expect(aktiv(ART.fett, zustand)).toBe(true);
    zustand = lauf(ART.fett, zustand);
    expect(zustand.doc.eq(doc)).toBe(true);
    expect(aktiv(ART.fett, zustand)).toBe(false);
  });

  it('turns a checklist on, off, and on again as one block type', () => {
    let zustand = ausText('Milch');
    zustand = lauf(ART.haken, zustand);
    expect(zustand.doc.child(0).type.name).toBe('punkt');
    expect(zustand.doc.child(0).attrs.art).toBe(ART.haken);
    expect(speichere(zustand.doc)).toBe('[] Milch');
    zustand = lauf(ART.haken, zustand);
    expect(zustand.doc.child(0).type.name).toBe('absatz');
    expect(speichere(zustand.doc)).toBe('Milch');
    zustand = lauf(ART.haken, zustand);
    expect(zustand.doc.childCount).toBe(1);
    expect(zustand.doc.child(0).attrs.art).toBe(ART.haken);
    expect(speichere(zustand.doc)).toBe('[] Milch');
  });

  it('replaces another list type instead of stacking markers', () => {
    let zustand = ausText('a\nb');
    zustand = lauf(ART.liste, zustand);
    expect(speichere(zustand.doc)).toBe('- a\n- b');
    zustand = lauf(ART.haken, zustand);
    expect(zustand.doc.child(0).attrs.art).toBe(ART.haken);
    expect(zustand.doc.child(1).attrs.art).toBe(ART.haken);
    expect(speichere(zustand.doc)).toBe('[] a\n[] b');
    zustand = lauf(ART.liste, zustand);
    expect(speichere(zustand.doc)).toBe('- a\n- b');
  });

  it('toggles a heading and an important line, and an important selection stays inline', () => {
    let kopf = ausText('Titel');
    kopf = lauf(ART.ueberschrift, kopf);
    expect(speichere(kopf.doc)).toBe('= Titel');
    expect(aktiv(ART.ueberschrift, kopf)).toBe(true);
    kopf = lauf(ART.ueberschrift, kopf);
    expect(speichere(kopf.doc)).toBe('Titel');

    const doc = lade('Hinweis');
    let zeile = cursor(doc, fund(doc, 'Hinweis') + 1);
    zeile = lauf(ART.wichtig, zeile);
    expect(zeile.doc.child(0).type.name).toBe('wichtigZeile');
    expect(speichere(zeile.doc)).toBe('!!!! Hinweis');
    expect(aktiv(ART.wichtig, zeile)).toBe(true);
    zeile = lauf(ART.wichtig, zeile);
    expect(speichere(zeile.doc)).toBe('Hinweis');

    let wort = ausText('Hinweis');
    wort = lauf(ART.wichtig, wort);
    expect(wort.doc.child(0).type.name).toBe('absatz');
    expect(marken(wort.doc)).toEqual([ART.wichtig]);
    expect(speichere(wort.doc)).toBe('!!Hinweis!!');
  });

  it('sets, changes, and removes a link', () => {
    let zustand = ausText('Wort');
    expect(lauf(ART.link, zustand)).toBe(zustand);
    zustand = lauf(ART.link, zustand, 'https://example.test');
    expect(speichere(zustand.doc)).toBe('[Wort](https://example.test)');
    expect(aktiv(ART.link, zustand)).toBe(true);
    const doc = zustand.doc;
    let innen = cursor(doc, fund(doc, 'Wort') + 1);
    innen = lauf(ART.link, innen, 'https://neu.test');
    expect(speichere(innen.doc)).toBe('[Wort](https://neu.test)');
    innen = lauf(ART.link, cursor(innen.doc, fund(innen.doc, 'Wort') + 1), '');
    expect(speichere(innen.doc)).toBe('Wort');
  });

  it('clears inline marks and keeps the block type', () => {
    let zustand = ausText('x');
    zustand = lauf(ART.ueberschrift, zustand);
    zustand = lauf(ART.fett, zustand);
    zustand = lauf(ART.kursiv, zustand);
    zustand = entferneFormatierung(zustand);
    expect(zustand.doc.child(0).type.name).toBe('ueberschrift');
    expect(marken(zustand.doc)).toEqual([]);
    expect(speichere(zustand.doc)).toBe('= x');
  });

  it('makes several lines a code block and turns that block back into text', () => {
    let zustand = ausText('a\nb');
    zustand = lauf(ART.code, zustand);
    expect(zustand.doc.child(1).type.name).toBe('codeblock');
    expect(zustand.doc.child(1).textContent).toBe('a');
    expect(speichere(zustand.doc)).toBe('```\na\nb\n```');
    const doc = zustand.doc;
    zustand = lauf(ART.code, cursor(doc, fund(doc, 'a') + 1));
    expect(speichere(zustand.doc)).toBe('a\nb');
    expect(zustand.doc.child(0).type.name).toBe('absatz');
  });

  it('does not format inside a code block', () => {
    const doc = lade('```\ncode\n```');
    const zustand = cursor(doc, fund(doc, 'code') + 1);
    expect(aktiv(ART.fett, zustand)).toBe(false);
    expect(aktiv(ART.kursiv, zustand)).toBe(false);
    expect(aktiv('strich', zustand)).toBe(false);
    expect(aktiv(ART.wichtig, zustand)).toBe(false);
    expect(aktiv(ART.link, zustand)).toBe(false);
    expect(aktiv(ART.code, zustand)).toBe(true);
    expect(lauf(ART.fett, zustand)).toBe(zustand);
    expect(lauf(ART.link, zustand, 'https://example.test')).toBe(zustand);
    expect(lauf(ART.wichtig, zustand).doc.eq(doc)).toBe(true);
  });

  it('keeps each command as one undo step', () => {
    const doc = lade('abc');
    let zustand = EditorState.create({
      schema: modell,
      doc,
      selection: TextSelection.create(doc, fund(doc, 'abc'), fund(doc, 'abc') + 3),
      plugins: [history()],
    });
    zustand = lauf(ART.fett, zustand);
    const fett = speichere(zustand.doc);
    zustand = lauf(ART.kursiv, zustand);
    let zurueck = zustand;
    expect(undo(zustand, (tr) => {
      zurueck = zustand.apply(tr);
    })).toBe(true);
    expect(speichere(zurueck.doc)).toBe(fett);
    zustand = zurueck;
    expect(undo(zustand, (tr) => {
      zurueck = zustand.apply(tr);
    })).toBe(true);
    expect(speichere(zurueck.doc)).toBe('abc');
  });

  it('applies a block marker per line and clears it only when every line has it', () => {
    expect(speichere(lauf(ART.liste, ausText('* one\ntwo')).doc)).toBe('* one\n- two');
    expect(speichere(lauf(ART.liste, ausText('one\n\ntwo')).doc)).toBe('- one\n\n- two');
    expect(speichere(lauf(ART.liste, ausText('* one\n+ two')).doc)).toBe('one\ntwo');
    expect(speichere(lauf(ART.haken, ausText('[] one\ntwo')).doc)).toBe('[] one\n[] two');
    expect(speichere(lauf(ART.haken, ausText('[] one\n[x] two')).doc)).toBe('one\ntwo');
    expect(speichere(lauf(ART.ueberschrift, ausText('= one\ntwo')).doc)).toBe('= one\n= two');
    let wichtig = lauf(ART.wichtig, ausText('one\ntwo'));
    expect(speichere(wichtig.doc)).toBe('!!!! one\n!!!! two');
    expect(aktiv(ART.wichtig, wichtig)).toBe(true);
    wichtig = lauf(ART.wichtig, wichtig);
    expect(speichere(wichtig.doc)).toBe('one\ntwo');
    expect(aktiv(ART.wichtig, wichtig)).toBe(false);
    expect(speichere(lauf(ART.wichtig, ausText('!!!! one\ntwo')).doc)).toBe('!!!! one\n!!!! two');
  });

  it('links each line and clears the link only when every line has it', () => {
    let zustand = lauf(ART.link, ausText('one\ntwo'), 'https://a.test');
    expect(speichere(zustand.doc)).toBe('[one](https://a.test)\n[two](https://a.test)');
    zustand = lauf(ART.link, zustand, 'https://b.test');
    expect(speichere(zustand.doc)).toBe('one\ntwo');
    const gemischt = lauf(ART.link, ausText('[one](https://a.test)\ntwo'), 'https://b.test');
    expect(speichere(gemischt.doc)).toBe('[one](https://a.test)\n[two](https://b.test)');
  });

  it('bolds the words of several list lines and leaves the markers', () => {
    const zustand = lauf(ART.fett, ausText('- one\n- two'));
    expect(speichere(zustand.doc)).toBe('- **one**\n- **two**');
    expect(speichere(lauf(ART.fett, ausText('one\n\ntwo')).doc)).toBe('**one**\n\n**two**');
  });
});
