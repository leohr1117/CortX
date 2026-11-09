import { Node } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { DOKUMENT_SCHEMA_VERSION, pruefeDokument } from './dokument.ts';
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

function decoderAufrufe(eingabe: unknown): number {
  const original = Node.fromJSON;
  let aufrufe = 0;
  Node.fromJSON = (schema, json) => {
    aufrufe += 1;
    return original.call(Node, schema, json);
  };
  try {
    pruefeDokument(eingabe);
  } finally {
    Node.fromJSON = original;
  }
  return aufrufe;
}

function friere(wert: unknown): void {
  if (wert === null || typeof wert !== 'object' || Object.isFrozen(wert)) return;
  Object.freeze(wert);
  for (const eintrag of Object.values(wert as JsonObjekt)) friere(eintrag);
}

describe('Dokumentpruefung', () => {
  it('nimmt ein leeres Dokument mit eigener Versionszahl an', () => {
    const zuerst = pruefeDokument({ schema_version: 1, type: 'doc', content: [] });
    const zuletzt = pruefeDokument({ type: 'doc', content: [], schema_version: 1 });
    const nackt = Object.create(null) as JsonObjekt;
    nackt.type = 'doc';
    nackt.content = [];
    nackt.schema_version = 1;
    const ohneInhalt = pruefeDokument(nackt);
    expect(zuerst).not.toBeNull();
    expect(zuletzt).not.toBeNull();
    expect(ohneInhalt).not.toBeNull();
    expect(zuerst!.type).toBe(modell.topNodeType);
    expect(zuerst!.childCount).toBe(0);
    expect(zuletzt!.eq(zuerst!)).toBe(true);
    expect(ohneInhalt!.eq(zuerst!)).toBe(true);
    expect(decoderAufrufe({ schema_version: 1, type: 'doc' })).toBe(1);
  });

  it('nimmt das bestehende Sechs-Knoten-Modell mit Marken unveraendert an', () => {
    const doc = muster();
    const gelesen = pruefeDokument(kopieMitVersion(doc.toJSON()));
    expect(gelesen).not.toBeNull();
    expect(gelesen!.eq(doc)).toBe(true);
    expect(gelesen!.childCount).toBe(6);
    expect(gelesen!.child(3).attrs).toEqual(doc.child(3).attrs);
    expect(gelesen!.child(0).child(1).marks.map((marke) => marke.type.name)).toEqual(
      doc.child(0).child(1).marks.map((marke) => marke.type.name),
    );
    expect(gelesen!.child(0).child(3).marks.map((marke) => marke.type.name)).toEqual(
      doc.child(0).child(3).marks.map((marke) => marke.type.name),
    );
    expect(gelesen!.textContent).toBe(doc.textContent);
  });

  it('nimmt eine frische Kopie von toJSON mit eigener Version an und bleibt gleich', () => {
    const doc = muster();
    const roh = doc.toJSON() as JsonObjekt;
    const kopie = kopieMitVersion(roh);
    const gelesen = pruefeDokument(kopie);
    expect(kopie).not.toBe(roh);
    expect(Object.hasOwn(roh, 'schema_version')).toBe(false);
    expect(Object.hasOwn(kopie, 'schema_version')).toBe(true);
    expect(gelesen).not.toBeNull();
    expect(gelesen!.eq(doc)).toBe(true);
  });

  it('lehnt null, Text, Zahl und Array ab', () => {
    const jsonText = '{"schema_version":1,"type":"doc","content":[]}';
    const liste = [{ schema_version: 1, type: 'doc', content: [] }];
    expect(pruefeDokument(null)).toBeNull();
    expect(pruefeDokument(undefined)).toBeNull();
    expect(pruefeDokument(jsonText)).toBeNull();
    expect(pruefeDokument('1')).toBeNull();
    expect(pruefeDokument(1)).toBeNull();
    expect(pruefeDokument(liste)).toBeNull();
    expect(decoderAufrufe(jsonText)).toBe(0);
    expect(decoderAufrufe(liste)).toBe(0);
    expect(decoderAufrufe(null)).toBe(0);
  });

  it('lehnt ein Dokument ohne schema_version ab', () => {
    const eingabe = { type: 'doc', content: [] };
    expect(pruefeDokument(eingabe)).toBeNull();
    expect(decoderAufrufe(eingabe)).toBe(0);
    expect(pruefeDokument({ type: 'doc', content: [], schema_version: undefined })).toBeNull();
  });

  it('lehnt String, null, 0 und 2 als Version ab', () => {
    for (const version of ['1', null, 0, 2]) {
      const eingabe = { schema_version: version, type: 'doc', content: [] };
      expect(pruefeDokument(eingabe)).toBeNull();
      expect(decoderAufrufe(eingabe)).toBe(0);
    }
  });

  it('lehnt eine Version ab, die nur in attrs steht', () => {
    const eingabe = { type: 'doc', attrs: { schema_version: 1 }, content: [] };
    expect(Object.hasOwn(eingabe, 'schema_version')).toBe(false);
    expect(pruefeDokument(eingabe)).toBeNull();
    expect(decoderAufrufe(eingabe)).toBe(0);
  });

  it('lehnt Absatz und Text als Wurzel ab', () => {
    expect(pruefeDokument({
      schema_version: 1,
      type: 'absatz',
      content: [{ type: 'text', text: 'a' }],
    })).toBeNull();
    expect(pruefeDokument({ schema_version: 1, type: 'text', text: 'a' })).toBeNull();
  });

  it('lehnt unbekannte Knoten und Marken ab', () => {
    expect(pruefeDokument({
      schema_version: 1,
      type: 'doc',
      content: [{ type: 'fremd' }],
    })).toBeNull();
    expect(pruefeDokument({
      schema_version: 1,
      type: 'doc',
      content: [{ type: 'absatz', content: [{ type: 'text', text: 'a', marks: [{ type: 'fremd' }] }] }],
    })).toBeNull();
  });

  it('lehnt Text direkt unter doc ab', () => {
    expect(pruefeDokument({
      schema_version: 1,
      type: 'doc',
      content: [{ type: 'text', text: 'direkt' }],
    })).toBeNull();
  });

  it('lehnt einen Block im Absatz und eine Marke im Codeblock ab', () => {
    expect(pruefeDokument({
      schema_version: 1,
      type: 'doc',
      content: [{ type: 'absatz', content: [{ type: 'absatz' }] }],
    })).toBeNull();
    expect(pruefeDokument({
      schema_version: 1,
      type: 'doc',
      content: [{
        type: 'codeblock',
        attrs: { zaun: '```', quelle: '' },
        content: [{ type: 'text', text: 'a', marks: [{ type: 'fett' }] }],
      }],
    })).toBeNull();
  });

  it('lehnt eine ungueltige Content-Form ab', () => {
    expect(pruefeDokument({ schema_version: 1, type: 'doc', content: 'absatz' })).toBeNull();
    expect(pruefeDokument({
      schema_version: 1,
      type: 'doc',
      content: [{ type: 'absatz', content: 'Hallo' }],
    })).toBeNull();
    expect(pruefeDokument({
      schema_version: 1,
      type: 'doc',
      content: [{ type: 'text' }],
    })).toBeNull();
  });

  it('laesst die Eingabe unveraendert', () => {
    const eingabe = kopieMitVersion(muster().toJSON());
    const vorher = JSON.stringify(eingabe);
    friere(eingabe);
    const gelesen = pruefeDokument(eingabe);
    expect(gelesen).not.toBeNull();
    expect(gelesen!.eq(muster())).toBe(true);
    expect(JSON.stringify(eingabe)).toBe(vorher);
  });

  it('lehnt eine kleine ungueltige Verschachtelung ab', () => {
    expect(pruefeDokument({
      schema_version: 1,
      type: 'doc',
      content: [{ type: 'leerzeile', content: [{ type: 'text', text: 'x' }] }],
    })).toBeNull();
  });

  it('weist unveraendertes toJSON ohne Version ab', () => {
    const doc = muster();
    const roh = doc.toJSON() as JsonObjekt;
    const vorher = JSON.stringify(roh);
    expect(pruefeDokument(roh)).toBeNull();
    expect(JSON.stringify(roh)).toBe(vorher);
    expect(Object.hasOwn(roh, 'schema_version')).toBe(false);
    expect(decoderAufrufe(roh)).toBe(0);
  });

  it('lehnt eine Version ab, die nur am Kind steht', () => {
    const eingabe = {
      type: 'doc',
      content: [{ type: 'absatz', schema_version: 1, content: [{ type: 'text', text: 'x' }] }],
    };
    expect(pruefeDokument(eingabe)).toBeNull();
    expect(decoderAufrufe(eingabe)).toBe(0);
  });

  it('lehnt eine nur geerbte Version vor dem Decoder ab', () => {
    const vorfahr = { schema_version: 1 };
    const kind = Object.create(vorfahr) as JsonObjekt;
    kind.type = 'doc';
    kind.content = [];
    expect(Object.hasOwn(kind, 'schema_version')).toBe(false);
    expect(kind.schema_version).toBe(1);
    expect(pruefeDokument(kind)).toBeNull();
    expect(decoderAufrufe(kind)).toBe(0);
  });

  it('lehnt true, 1.5, NaN und Infinity ab', () => {
    for (const version of [true, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const eingabe = { schema_version: version, type: 'doc', content: [] };
      expect(pruefeDokument(eingabe)).toBeNull();
      expect(decoderAufrufe(eingabe)).toBe(0);
    }
  });

  it('schreibt keine Version in das Laufzeit-JSON zurueck', () => {
    const doc = muster();
    const gelesen = pruefeDokument(kopieMitVersion(doc.toJSON()));
    expect(gelesen).not.toBeNull();
    const roh = gelesen!.toJSON() as JsonObjekt;
    expect(Object.hasOwn(roh, 'schema_version')).toBe(false);
    expect(JSON.stringify(roh).includes('schema_version')).toBe(false);
    expect(pruefeDokument(roh)).toBeNull();
    expect(pruefeDokument(kopieMitVersion(roh))!.eq(doc)).toBe(true);
  });

  it('lehnt einen ungueltigen Kopf vor dem Decoder ab, auch bei ungueltigem Rumpf', () => {
    const eingabe = { schema_version: '1', type: 'doc', content: [{ type: 'gibt-es-nicht' }] };
    expect(pruefeDokument(eingabe)).toBeNull();
    expect(decoderAufrufe(eingabe)).toBe(0);
    expect(decoderAufrufe({ schema_version: 1, type: 'doc', content: [] })).toBe(1);
  });
});
