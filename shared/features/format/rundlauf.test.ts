import { type Mark, type Node } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { exportiere, importiere } from './md.ts';
import { modell } from './modell.ts';

const FAELLE = [
  'Hello',
  '# Title\n\nA paragraph.',
  '- a\n- b',
  '1. one\n2. two',
  '**bold** and `code` and #tag',
  '# Ueberschrift\n- Liste\n**fett** and `code` and #tag',
  'A line with ~~strike~~ and *italic*.',
  '- [ ] open\n- [x] done',
];

function ohneQuelle(wert: unknown): unknown {
  if (Array.isArray(wert)) return wert.map(ohneQuelle);
  if (!wert || typeof wert !== 'object') return wert;
  const aus: Record<string, unknown> = {};
  for (const [key, eintrag] of Object.entries(wert)) {
    if (key === 'quelle') continue;
    aus[key] = ohneQuelle(eintrag);
  }
  return aus;
}

function doc(kinder: Node[]): Node {
  return modell.node('doc', null, kinder);
}

function absatz(text: string, marks: readonly Mark[] = []): Node {
  const inhalt = text.length > 0 ? modell.text(text, marks) : null;
  return modell.nodes.absatz!.createChecked({ quelle: '' }, inhalt);
}

function ohneKursiv(knoten: Node): void {
  knoten.descendants((eintrag) => {
    if (eintrag.isText) expect(eintrag.marks.some((mark) => mark.type.name === 'kursiv')).toBe(false);
  });
}

function nest(): Node {
  const wichtig = modell.marks.wichtig!.create();
  const fett = modell.marks.fett!.create();
  return doc([
    modell.nodes.absatz!.createChecked(null, [
      modell.text('fett ', [wichtig]),
      modell.text('innen', [wichtig, fett]),
    ]),
  ]);
}

describe('markdown roundtrip', () => {
  it('keeps the eight sentences under the write rules', () => {
    expect(FAELLE).toHaveLength(8);
    for (const text of FAELLE) {
      const geladen = importiere(text);
      const seriell = exportiere(geladen);
      expect(seriell, text).toBe(text);
      expect(importiere(seriell).eq(geladen), text).toBe(true);
      expect(seriell.includes('\\#'), text).toBe(false);
    }
  });

  it('does not turn snake_case into asterisks', () => {
    expect(exportiere(importiere('snake_case'))).toBe('snake_case');
    const seriell = exportiere(doc([absatz('snake_case')]));
    expect(seriell).toBe('snake_case');
    expect(seriell.includes('*')).toBe(false);
    const zurueck = importiere(seriell);
    expect(zurueck.textContent).toBe('snake_case');
    ohneKursiv(zurueck);
  });

  it('never escapes #thema', () => {
    for (const text of ['#thema', '#thema/seite', '#thema/seite/abschnitt']) {
      expect(exportiere(importiere(text)), text).toBe(text);
      const seriell = exportiere(doc([absatz(text)]));
      expect(seriell, text).toBe(text);
      expect(seriell.includes('\\#'), text).toBe(false);
    }
  });

  it('keeps escaped asterisks and may escape a*b without a source', () => {
    expect(exportiere(importiere('a\\*b'))).toBe('a\\*b');
    expect(exportiere(importiere('\\*'))).toBe('\\*');
    const seriell = exportiere(doc([absatz('a*b')]));
    expect(seriell === 'a*b' || seriell === 'a\\*b').toBe(true);
    const zurueck = importiere(seriell);
    expect(zurueck.textContent).toBe('a*b');
    ohneKursiv(zurueck);
    expect(exportiere(zurueck)).toBe(seriell);
  });

  it('writes one outer pair and keeps !!fett **innen**!!', () => {
    const gebaut = nest();
    const seriell = exportiere(gebaut);
    expect(seriell).toBe('!!fett **innen**!!');
    expect(ohneQuelle(importiere(seriell).toJSON())).toEqual(ohneQuelle(gebaut.toJSON()));
    expect(exportiere(importiere('!!fett **innen**!!'))).toBe('!!fett **innen**!!');
  });

  it('reaches a fixed point', () => {
    const knoten = [doc([absatz('a*b')]), nest()];
    for (const text of [...FAELLE, 'snake_case', '#thema']) knoten.push(importiere(text));
    for (const eintrag of knoten) {
      const seriell = exportiere(eintrag);
      expect(exportiere(importiere(seriell)), seriell).toBe(seriell);
    }
  });
});
