import { type Node } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { DOKUMENT_SCHEMA_VERSION, pruefeDokument } from './dokument.ts';
import { klartext } from './klartext.ts';
import { modell } from './modell.ts';

type JsonObjekt = Record<string, unknown>;

function muster(): Node {
  const fett = modell.marks.fett!.create();
  const link = modell.marks.link!.create({ ziel: 'https://example.test' });
  return modell.node('doc', null, [
    modell.nodes.absatz!.createChecked(null, [
      modell.text('Hallo '),
      modell.text('fett', [fett, modell.marks.kursiv!.create(), modell.marks.strich!.create()]),
      modell.text(' und '),
      modell.text('Ziel', [link, modell.marks.wichtig!.create(), modell.marks.code!.create()]),
    ]),
    modell.nodes.ueberschrift!.createChecked({ stufe: 2, zeichen: '#' }, modell.text('Titel')),
    modell.nodes.wichtigZeile!.createChecked(null, modell.text('Achtung')),
    modell.nodes.punkt!.createChecked({ art: 'haken', abgehakt: true, zeichen: '[]', einzug: 1 }, modell.text('Tun')),
    modell.nodes.codeblock!.createChecked({ zaun: '~~~' }, modell.text('const a = 1')),
    modell.nodes.leerzeile!.createChecked(),
  ]);
}

function kopieMitVersion(json: unknown): JsonObjekt {
  const kopie = structuredClone(json) as JsonObjekt;
  kopie.schema_version = DOKUMENT_SCHEMA_VERSION;
  return kopie;
}

describe('Klartext', () => {
  it('liest Absaetze nur als Text', () => {
    const doc = modell.node('doc', null, [
      modell.nodes.absatz!.createChecked(null, modell.text('eins')),
      modell.nodes.absatz!.createChecked({ flucht: true, quelle: '**zwei**' }, modell.text('zwei')),
    ]);
    const vorher = JSON.stringify(doc.toJSON());
    expect(klartext(doc)).toBe('eins\nzwei');
    expect(JSON.stringify(doc.toJSON())).toBe(vorher);
  });

  it('liest Ueberschriften ohne Stufe und ohne Zeichen', () => {
    const doc = modell.node('doc', null, [
      modell.nodes.ueberschrift!.createChecked({ stufe: 1, zeichen: '#' }, modell.text('Eins')),
      modell.nodes.ueberschrift!.createChecked({ stufe: 2, zeichen: '##' }, modell.text('Zwei')),
    ]);
    expect(klartext(doc)).toBe('Eins\nZwei');
  });

  it('liest Wichtig-Zeilen ohne Ausrufezeichen', () => {
    const doc = modell.node('doc', null, [
      modell.nodes.wichtigZeile!.createChecked({ quelle: '!!!! Achtung' }, modell.text('Achtung')),
      modell.nodes.wichtigZeile!.createChecked(null, modell.text('Halt')),
    ]);
    expect(klartext(doc)).toBe('Achtung\nHalt');
  });

  it('liest Punkte ohne Listen-, Haken- und Nummernzeichen', () => {
    const doc = modell.node('doc', null, [
      modell.nodes.punkt!.createChecked({ art: 'liste', zeichen: '-', einzug: 0 }, modell.text('Apfel')),
      modell.nodes.punkt!.createChecked(
        { art: 'haken', abgehakt: true, zeichen: '[x]', einzug: 1, nummerArt: '1.', nummer: 2 },
        modell.text('Tun'),
      ),
    ]);
    expect(klartext(doc)).toBe('Apfel\nTun');
  });

  it('liest Codebloecke ohne Zaun', () => {
    const doc = modell.node('doc', null, [
      modell.nodes.codeblock!.createChecked({ zaun: '```' }, modell.text('const a = 1')),
      modell.nodes.codeblock!.createChecked({ zaun: '~~~', quelle: '```\nb\n```' }, modell.text('b')),
    ]);
    expect(klartext(doc)).toBe('const a = 1\nb');
  });

  it('setzt jede Leerzeile als eigene leere Zeile', () => {
    const mitte = modell.node('doc', null, [
      modell.nodes.absatz!.createChecked(null, modell.text('oben')),
      modell.nodes.leerzeile!.createChecked(),
      modell.nodes.leerzeile!.createChecked(),
      modell.nodes.absatz!.createChecked(null, modell.text('unten')),
    ]);
    const ende = modell.node('doc', null, [
      modell.nodes.absatz!.createChecked(null, modell.text('oben')),
      modell.nodes.leerzeile!.createChecked(),
    ]);
    const allein = modell.node('doc', null, [modell.nodes.leerzeile!.createChecked()]);
    expect(klartext(mitte)).toBe('oben\n\n\nunten');
    expect(klartext(ende)).toBe('oben\n');
    expect(klartext(allein)).toBe('');
  });

  it('gibt Marken keine Zeichen und laesst Textzeichen stehen', () => {
    const doc = modell.node('doc', null, [
      modell.nodes.absatz!.createChecked(null, [
        modell.text('Hallo '),
        modell.text('fett', [modell.marks.fett!.create(), modell.marks.kursiv!.create(), modell.marks.strich!.create()]),
        modell.text(' und '),
        modell.text('Ziel', [
          modell.marks.link!.create({ ziel: 'https://example.test' }),
          modell.marks.wichtig!.create(),
          modell.marks.code!.create(),
        ]),
      ]),
      modell.nodes.absatz!.createChecked({ quelle: '**wort**' }, modell.text('**wort**')),
    ]);
    const vorher = JSON.stringify(doc.toJSON());
    expect(klartext(doc)).toBe('Hallo fett und Ziel\n**wort**');
    expect(doc.textContent.includes('https://example.test')).toBe(false);
    expect(JSON.stringify(doc.toJSON())).toBe(vorher);
  });

  it('gibt fuer ein leeres Dokument eine leere Zeichenkette', () => {
    const doc = modell.node('doc', null, []);
    expect(doc.childCount).toBe(0);
    expect(klartext(doc)).toBe('');
    const gelesen = pruefeDokument(kopieMitVersion(doc.toJSON()));
    expect(gelesen).not.toBeNull();
    expect(gelesen!.eq(doc)).toBe(true);
    expect(klartext(gelesen!)).toBe('');
  });

  it('bleibt im Rundlauf gleich', () => {
    const doc = muster();
    const roh = doc.toJSON() as JsonObjekt;
    const kopie = kopieMitVersion(roh);
    expect(kopie).not.toBe(roh);
    expect(Object.hasOwn(roh, 'schema_version')).toBe(false);
    expect(Object.hasOwn(kopie, 'schema_version')).toBe(true);
    expect(kopie.schema_version).toBe(DOKUMENT_SCHEMA_VERSION);
    const gelesen = pruefeDokument(kopie);
    expect(gelesen).not.toBeNull();
    expect(gelesen!.eq(doc)).toBe(true);
    expect(klartext(gelesen!)).toBe(klartext(doc));
    expect(klartext(doc)).toBe('Hallo fett und Ziel\nTitel\nAchtung\nTun\nconst a = 1\n');
    expect(modell.nodeFromJSON(doc.toJSON()).eq(doc)).toBe(true);
    expect(doc.childCount).toBe(6);
  });
});
