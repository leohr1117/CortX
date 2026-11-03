import { readFileSync } from 'node:fs';
import { type Node } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { ART, type Beleg, type BelegArt } from './baum.ts';
import { lade } from './laden.ts';
import { leseDokument } from './lesen.ts';
import { suchtext } from './suchtext.ts';

const ERWARTET: Record<BelegArt, { knoten?: string; marke?: string; art?: string }> = {
  [ART.fett]: { marke: ART.fett },
  [ART.kursiv]: { marke: ART.kursiv },
  [ART.streich]: { marke: 'strich' },
  [ART.wichtig]: { marke: ART.wichtig, knoten: 'wichtigZeile' },
  [ART.code]: { marke: ART.code },
  [ART.link]: { marke: ART.link },
  [ART.codeblock]: { knoten: 'codeblock' },
  [ART.liste]: { knoten: 'punkt', art: ART.liste },
  [ART.nummer]: { knoten: 'punkt', art: ART.nummer },
  [ART.haken]: { knoten: 'punkt', art: ART.haken },
  [ART.ueberschrift]: { knoten: 'ueberschrift' },
};

function unescape(roh: string): string {
  return roh.replace(/\\n|\\r|\\t|\\'|\\"|\\\\/g, (treffer) => {
    if (treffer === '\\n') return '\n';
    if (treffer === '\\r') return '\r';
    if (treffer === '\\t') return '\t';
    if (treffer === "\\'") return "'";
    if (treffer === '\\"') return '"';
    return '\\';
  });
}

function beispiele(pfad: string): string[] {
  const quelle = readFileSync(pfad, 'utf8');
  const aus: string[] = [];
  for (const fund of quelle.matchAll(/(?:leseBaum|belege)\(\s*(['"])([\s\S]*?)\1/g)) {
    aus.push(unescape(fund[2] ?? ''));
  }
  return aus;
}

function kern(quelle: string): string {
  const ohne = quelle.endsWith('\n') ? quelle.slice(0, -1) : quelle;
  return ohne.endsWith('\r') ? ohne.slice(0, -1) : ohne;
}

function lage(doc: Node): { knoten: Node; von: number; bis: number }[] {
  const aus: { knoten: Node; von: number; bis: number }[] = [];
  let ort = 0;
  doc.forEach((knoten) => {
    const quelle = String(knoten.attrs.quelle ?? '');
    aus.push({ knoten, von: ort, bis: ort + quelle.length });
    ort += quelle.length;
  });
  return aus;
}

function quellen(doc: Node): string {
  let aus = '';
  doc.forEach((knoten) => {
    aus += String(knoten.attrs.quelle ?? '');
  });
  return aus;
}

function sichtbar(doc: Node): string {
  const teile: string[] = [];
  doc.forEach((knoten) => {
    if (knoten.type.name === 'codeblock' && /^(?:`{3,}|~{3,})/.test(kern(String(knoten.attrs.quelle)))) return;
    teile.push(knoten.textContent);
  });
  return teile.join('\n');
}

function hatMarke(knoten: Node, name: string, ziel?: string): boolean {
  let gefunden = false;
  knoten.descendants((node) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type.name !== name) continue;
      if (ziel !== undefined && mark.attrs.ziel !== ziel) continue;
      gefunden = true;
    }
  });
  return gefunden;
}

function problem(doc: Node, beleg: Beleg): string | null {
  const ziel = ERWARTET[beleg.art];
  const zeile = ziel.knoten && (beleg.bisZeile !== undefined || !ziel.marke);
  const stellen = lage(doc);
  if (zeile && beleg.art !== ART.codeblock) {
    const fund = stellen.find((eintrag) => eintrag.von === beleg.ganzVon);
    if (!fund) return `${beleg.art} ohne Zeile`;
    if (fund.knoten.type.name !== ziel.knoten) return `${beleg.art} ist ${fund.knoten.type.name}`;
    if (ziel.art && fund.knoten.attrs.art !== ziel.art) return `${beleg.art} art ${String(fund.knoten.attrs.art)}`;
    if (beleg.abgehakt !== undefined && fund.knoten.attrs.abgehakt !== beleg.abgehakt) return `${beleg.art} abgehakt`;
    if (beleg.art === ART.ueberschrift && fund.knoten.attrs.stufe !== (beleg.stufe ?? 0)) return 'stufe';
    return null;
  }
  if (beleg.art === ART.codeblock) {
    const innen = stellen.filter((eintrag) => eintrag.von >= beleg.ganzVon && eintrag.von < beleg.ganzBis);
    if (innen.length === 0 || innen.some((eintrag) => eintrag.knoten.type.name !== 'codeblock')) return 'codeblock';
    if (innen.some((eintrag) => hatMarke(eintrag.knoten, ART.fett) || hatMarke(eintrag.knoten, 'strich'))) return 'codeblock mark';
    return null;
  }
  const fund = stellen.find((eintrag) => beleg.ganzVon >= eintrag.von && beleg.ganzVon < eintrag.bis);
  if (!fund || !ziel.marke) return `${beleg.art} ohne Mark`;
  if (!hatMarke(fund.knoten, ziel.marke, beleg.ziel)) return `${beleg.art} Mark fehlt`;
  return null;
}

describe('load a note into the line document', () => {
  const corpus = [
    ...beispiele('shared/features/format/lesen.test.ts'),
    ...beispiele('shared/features/format/mehr.test.ts'),
  ];

  it('maps every evidence kind from the reading examples', () => {
    expect(globalThis.document).toBeUndefined();
    expect(corpus.length).toBeGreaterThan(20);
    const gesehen = new Set<BelegArt>();
    for (const text of corpus) {
      const doc = lade(text);
      expect(quellen(doc)).toBe(text);
      const ist = sichtbar(doc);
      expect(suchtext(text)).toBe(text.endsWith('\n') ? `${ist}\n` : ist);
      for (const beleg of leseDokument(text).belege) {
        gesehen.add(beleg.art);
        expect(problem(doc, beleg), text).toBeNull();
      }
    }
    expect([...gesehen].sort()).toEqual(
      [ART.code, ART.codeblock, ART.fett, ART.haken, ART.kursiv, ART.link, ART.liste, ART.nummer, ART.streich, ART.ueberschrift, ART.wichtig].sort(),
    );
  });

  it('keeps an empty note empty and a trailing break on its line', () => {
    expect(lade('').childCount).toBe(0);
    const zeile = lade('a\n');
    expect(zeile.childCount).toBe(1);
    expect(zeile.child(0).type.name).toBe('absatz');
    expect(zeile.child(0).attrs.quelle).toBe('a\n');
    expect(zeile.child(0).textContent).toBe('a');
    const leer = lade('\n\n');
    expect(leer.childCount).toBe(2);
    expect(leer.child(0).type.name).toBe('leerzeile');
    expect(leer.child(0).attrs.quelle).toBe('\n');
    expect(leer.child(1).attrs.quelle).toBe('\n');
  });

  it('stores the raw line, including carriage returns, on each block', () => {
    const doc = lade('- **milk** and bread\r\n- eggs');
    expect(doc.child(0).attrs.quelle).toBe('- **milk** and bread\r\n');
    expect(doc.child(0).textContent).toBe('milk and bread');
    expect(doc.child(0).attrs).toMatchObject({ art: ART.liste, zeichen: '-', abgehakt: false, einzug: 0 });
    expect(doc.child(1).attrs.quelle).toBe('- eggs');
    expect(doc.child(1).textContent).toBe('eggs');
  });

  it('turns headings, marks, lists, tasks, links, and fences into blocks', () => {
    const kopf = lade('# Title\n## Section\n= Legacy');
    expect(kopf.child(0).attrs).toMatchObject({ stufe: 1, zeichen: '#' });
    expect(kopf.child(1).attrs).toMatchObject({ stufe: 2, zeichen: '#' });
    expect(kopf.child(2).attrs).toMatchObject({ stufe: 0, zeichen: '=' });

    const gemischt = lade('*Anna* and _Bea_ and __Cara__ and ~~Dan~~');
    expect(gemischt.child(0).textContent).toBe('Anna and Bea and Cara and Dan');
    const marken = new Set<string>();
    gemischt.descendants((node) => {
      for (const mark of node.marks) marken.add(mark.type.name);
    });
    expect([...marken].sort()).toEqual([ART.fett, ART.kursiv, 'strich']);

    const punkte = lade('* milk\n+ bread\n1. eggs\n2. tea\n- [ ] open\n- [x] done');
    expect(punkte.child(0).attrs).toMatchObject({ art: ART.liste, zeichen: '*' });
    expect(punkte.child(1).attrs).toMatchObject({ art: ART.liste, zeichen: '+' });
    expect(punkte.child(2).attrs).toMatchObject({ art: ART.nummer, zeichen: '1.' });
    expect(punkte.child(3).attrs).toMatchObject({ art: ART.nummer, zeichen: '1.' });
    expect(punkte.child(4).attrs).toMatchObject({ art: ART.haken, zeichen: '[]', abgehakt: false });
    expect(punkte.child(5).attrs).toMatchObject({ art: ART.haken, zeichen: '[x]', abgehakt: true });

    const link = lade('see [Anna](https://example.com/a) now');
    expect(link.child(0).textContent).toBe('see Anna now');
    let ziel = '';
    link.descendants((node) => {
      for (const mark of node.marks) {
        if (mark.type.name === ART.link) ziel = String(mark.attrs.ziel);
      }
    });
    expect(ziel).toBe('https://example.com/a');

    const zaun = lade('```\n**not**\n= no\n#nope\n```');
    expect(zaun.childCount).toBe(5);
    expect(zaun.child(0).attrs).toMatchObject({ zaun: '```', quelle: '```\n' });
    expect(zaun.child(0).textContent).toBe('');
    expect(zaun.child(1).textContent).toBe('**not**');
    expect(zaun.child(1).child(0).marks).toEqual([]);
    expect(zaun.child(4).attrs.quelle).toBe('```');

    const zeile = lade('!!!! **x**');
    expect(zeile.child(0).type.name).toBe('wichtigZeile');
    expect(zeile.child(0).textContent).toBe('x');
    expect(zeile.child(0).child(0).marks.map((mark) => mark.type.name)).toEqual([ART.fett]);

    const folge = lade('[] call\n   later');
    expect(folge.childCount).toBe(2);
    expect(folge.child(0).attrs).toMatchObject({ art: ART.haken, quelle: '[] call\n' });
    expect(folge.child(0).textContent).toBe('call');
    expect(folge.child(1).attrs).toMatchObject({ art: ART.haken, einzug: 0, quelle: '   later' });
    expect(folge.child(1).textContent).toBe('later');
  });
});
