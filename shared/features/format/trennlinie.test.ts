import { describe, expect, it } from 'vitest';
import { lade } from './laden.ts';
import { modell } from './modell.ts';
import { speichere } from './speichern.ts';

function arten(text: string): string[] {
  const doc = lade(text);
  const aus: string[] = [];
  doc.forEach((knoten) => aus.push(knoten.textContent ? `${knoten.type.name}:${knoten.textContent}` : knoten.type.name));
  return aus;
}

function rund(text: string): string {
  return speichere(lade(text));
}

describe('trennlinie', () => {
  it('reads --- after a blank line as a divider', () => {
    expect(arten('a\n\n---')).toEqual(['absatz:a', 'leerzeile', 'trennlinie']);
  });

  it('keeps --- directly under text without losing text', () => {
    expect(arten('a\n---')).toEqual(['absatz:a', 'absatz:---']);
    expect(rund('a\n---')).toBe('a\n---');
  });

  it('reads *** ___ and spaced variants', () => {
    expect(arten('***')).toEqual(['trennlinie']);
    expect(arten('* * * *')).toEqual(['trennlinie']);
    expect(arten('x\n\n___')).toEqual(['absatz:x', 'leerzeile', 'trennlinie']);
    expect(arten('x\n\n- - -')).toEqual(['absatz:x', 'leerzeile', 'trennlinie']);
    expect(arten('x\n\n  -----')).toEqual(['absatz:x', 'leerzeile', 'trennlinie']);
  });

  it('leaves code, indented code and short runs alone', () => {
    expect(arten('```\n---\n```')).not.toContain('trennlinie');
    expect(arten('    ---')).toEqual(['absatz:    ---']);
    expect(arten('--')).toEqual(['absatz:--']);
  });

  it('parses an hr element', () => {
    const typ = modell.nodes.trennlinie;
    expect(typ?.isAtom).toBe(true);
    expect(typ?.spec.parseDOM?.[0]?.tag).toBe('hr');
  });

  it('keeps an untouched note byte for byte', () => {
    expect(rund('a\n\n***\nb')).toBe('a\n\n***\nb');
    expect(rund('---\nb')).toBe('---\nb');
  });

  it('keeps four plain stars as text', () => {
    expect(arten('****')).toEqual(['absatz:****']);
  });

  it('exports a changed note with --- and blank lines', () => {
    const doc = lade('a\n\n***\nb');
    const kinder = [doc.child(0), doc.child(1), doc.child(2), modell.nodes.absatz!.create(null, modell.text('bc'))];
    expect(speichere(doc.type.create(null, kinder))).toBe('a\n\n---\n\nbc');
  });

  it('exports editor-built dividers with blank lines', () => {
    const k = modell.nodes;
    const doc = k.doc!.create(null, [
      k.absatz!.create(null, modell.text('oben')),
      k.trennlinie!.create(),
      k.absatz!.create(null, modell.text('unten')),
    ]);
    expect(speichere(doc)).toBe('oben\n\n---\n\nunten');
  });

  it('is a fixpoint', () => {
    for (const text of ['a\n\n---', 'a\n\n***\nb', '- a\n\n---\n- b', 'x\n\n---\n']) {
      const einmal = rund(text);
      expect(rund(einmal)).toBe(einmal);
    }
  });

  describe('text lines that look like a divider (Lena 12.11. 15:42)', () => {
    const faelle: Array<[string, string]> = [
      ['---', '\\---'],
      ['***', '\\***'],
      ['___', '\\___'],
      ['- - -', '\\- - -'],
      ['* * *', '\\* * *'],
      ['_ _ _', '\\_ _ _'],
      ['  ---', '  \\---'],
      ['****', '\\*\\*\\*\\*'],
    ];
    const k = modell.nodes;

    for (const [zeile, flucht] of faelle) {
      it(`writes a changed text line ${JSON.stringify(zeile)} escaped and reads it back as text`, () => {
        const doc = k.doc!.create(null, [k.absatz!.create(null, modell.text('a')), k.absatz!.create(null, modell.text(zeile))]);
        const einmal = speichere(doc);
        expect(einmal).toBe(`a\n${flucht}`);
        expect(arten(einmal)).toEqual(['absatz:a', `absatz:${zeile}`]);
        expect(speichere(lade(einmal))).toBe(einmal);
      });

      it(`keeps ${JSON.stringify(zeile)} text after a blank line`, () => {
        const doc = k.doc!.create(null, [k.absatz!.create(null, modell.text('a')), k.leerzeile!.create(), k.absatz!.create(null, modell.text(zeile))]);
        const einmal = speichere(doc);
        expect(arten(einmal)).toEqual(['absatz:a', 'leerzeile', `absatz:${zeile}`]);
        expect(speichere(lade(einmal))).toBe(einmal);
      });
    }

    it('keeps untouched notes byte for byte', () => {
      for (const text of ['a\n---', 'a\n***', 'a\n___', '****', 'a\n\\---', 'a\n\\***']) expect(rund(text)).toBe(text);
    });
  });
});
