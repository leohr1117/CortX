import type { Node } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { importiere, exportiere } from '../format/md.ts';
import { modell } from '../format/modell.ts';
import { erkenneTermin, terminAusKnoten } from '../termine/erkennen.ts';
import {
  abschnitteAusKnoten,
  haengeKnoten,
  mitHakenKurz,
  neueSeiteKnoten,
  ohneRandzeilen,
  teileDokument,
  titelAusKnoten,
} from './knoten.ts';

const BEZUG = new Date('2026-11-02T10:00:00.000Z');
const SEITE = '# Mathe\n\nIntro\n\n## Analysis\n\nOld\n\n## Later\n\nEnd';

function marken(doc: Node): string[] {
  const namen: string[] = [];
  doc.descendants((node) => {
    for (const mark of node.marks) namen.push(mark.type.name);
  });
  return namen;
}

function kopf(doc: Node, name: string): Node | undefined {
  for (let index = 0; index < doc.childCount; index += 1) {
    const kind = doc.child(index);
    if (kind.type.name === 'ueberschrift' && kind.textContent === name) return kind;
  }
  return undefined;
}

describe('page nodes', () => {
  it('reads the title from the first non-empty node', () => {
    expect(titelAusKnoten(importiere('Just a line\n\nMore'))).toBe('Just a line');
    expect(importiere('Just a line').child(0).type.name).toBe('absatz');
    expect(titelAusKnoten(importiere('# Deutsch LK'))).toBe('Deutsch LK');
    expect(importiere('# Deutsch LK').child(0).type.name).toBe('ueberschrift');
    expect(titelAusKnoten(importiere('!!!! Important line'))).toBe('Important line');
    expect(importiere('!!!! Important line').child(0).type.name).toBe('wichtigZeile');
    expect(titelAusKnoten(importiere('- Buy milk'))).toBe('Buy milk');
    expect(importiere('- Buy milk').child(0).type.name).toBe('punkt');
    expect(titelAusKnoten(importiere('```\ncode title\n```'))).toBe('code title');
    expect(importiere('```\ncode title\n```').child(1).type.name).toBe('codeblock');
    expect(titelAusKnoten(importiere('\n\nAfter blanks'))).toBe('After blanks');
    expect(titelAusKnoten(importiere(''))).toBe('');
    expect(titelAusKnoten(importiere('# **Deutsch** LK'))).toBe('Deutsch LK');
    expect(titelAusKnoten(importiere('- milk\n  world'))).toBe('milk');
  });

  it('collects only level-2 headings', () => {
    const text = '# Deutsch LK\n\nIntro\n\n## Analysis\n\nBody\n\n### Detail\n\n## Later';
    expect(abschnitteAusKnoten(importiere(text))).toEqual(['Analysis', 'Later']);
    expect(abschnitteAusKnoten(importiere('## Analysis'))).toEqual(['Analysis']);
    expect(abschnitteAusKnoten(importiere('# Nur Titel'))).toEqual([]);
    expect(abschnitteAusKnoten(importiere('= Legacy'))).toEqual([]);
  });

  it('keeps a mark on the target line and takes the next line as body', () => {
    const gleicheZeile = importiere('#math **Limits**');
    const vorher = gleicheZeile.toJSON();
    const teile = teileDokument(gleicheZeile);
    expect(gleicheZeile.toJSON()).toEqual(vorher);
    expect(teile).toHaveLength(1);
    expect(teile[0]?.pfad).toBe('math');
    const rest = teile[0]!.doc;
    expect(rest.textContent).toBe('Limits');
    expect(marken(rest)).toContain('fett');
    expect(exportiere(rest)).toBe('**Limits**');

    const naechste = teileDokument(importiere('#math\n**Limits**\nstill'));
    expect(naechste).toHaveLength(1);
    expect(naechste[0]?.pfad).toBe('math');
    expect(marken(naechste[0]!.doc)).toContain('fett');
    expect(exportiere(naechste[0]!.doc)).toBe('**Limits**\nstill');

    const code = importiere('```\n#school/Secret\n```');
    expect(teileDokument(code)).toEqual([{ pfad: null, doc: code }]);
    const inbox = importiere('Buy milk\n\n**fresh**');
    expect(teileDokument(inbox)[0]?.doc).toBe(inbox);
  });

  it('builds a new page as nodes and exports the same strings', () => {
    const mitAbschnitt = neueSeiteKnoten('Mathe', 'Analysis', importiere('The limit'));
    expect(exportiere(mitAbschnitt)).toBe('Mathe\n\n## Analysis\n\nThe limit');
    expect(mitAbschnitt.child(0).type.name).toBe('absatz');
    expect(mitAbschnitt.child(0).textContent).toBe('Mathe');
    expect(mitAbschnitt.child(1).type.name).toBe('leerzeile');
    expect(mitAbschnitt.child(2).attrs).toMatchObject({ stufe: 2, zeichen: '#' });
    expect(mitAbschnitt.child(2).textContent).toBe('Analysis');
    expect(mitAbschnitt.child(4).textContent).toBe('The limit');
    expect(exportiere(neueSeiteKnoten('Mathe', null, importiere('')))).toBe('Mathe');
    expect(exportiere(neueSeiteKnoten('Mathe', null, importiere('Limits')))).toBe('Mathe\n\nLimits');
    expect(exportiere(neueSeiteKnoten(null, null, importiere('Buy milk'), 'Inbox'))).toBe('Buy milk');
    expect(exportiere(neueSeiteKnoten(null, null, importiere(''), 'Home'))).toBe('Home');
    const roh = importiere('# Already\n\nBody');
    expect(neueSeiteKnoten(null, null, roh, 'Inbox')).toBe(roh);
    expect(exportiere(neueSeiteKnoten(null, null, roh, 'Inbox'))).toBe('# Already\n\nBody');
    expect(exportiere(neueSeiteKnoten('Mathe', null, importiere('Limits'))).startsWith('# ')).toBe(false);
  });

  it('appends nodes at the end, inside a section, or as a new section', () => {
    const seite = importiere(SEITE);
    expect(exportiere(haengeKnoten(seite, importiere('Tail'), null))).toBe(`${SEITE}\n\nTail`);
    expect(exportiere(haengeKnoten(seite, importiere('More'), 'analysis'))).toBe(
      '# Mathe\n\nIntro\n\n## Analysis\n\nOld\n\nMore\n\n## Later\n\nEnd',
    );
    const beweise = haengeKnoten(seite, importiere('Fresh'), 'Proofs');
    expect(exportiere(beweise)).toBe(`${SEITE}\n\n## Proofs\n\nFresh`);
    expect(kopf(beweise, 'Proofs')?.attrs).toMatchObject({ stufe: 2, zeichen: '#' });
    expect(haengeKnoten(seite, importiere(''), 'Analysis')).toBe(seite);
  });

  it('reads a date from the plain words of a node', () => {
    const fett = importiere('**tomorrow**');
    expect(terminAusKnoten(fett, BEZUG)).toEqual(erkenneTermin('tomorrow', BEZUG));
    const kopfzeile = importiere('## Meet tomorrow');
    expect(terminAusKnoten(kopfzeile, BEZUG)).toEqual(erkenneTermin('Meet tomorrow', BEZUG));
  });

  it('drops empty edge lines and keeps inner nodes equal', () => {
    const marke = modell.marks.fett!.create();
    const innen = modell.nodes.absatz!.createChecked({ quelle: 'innen\n', flucht: true }, modell.text('Milch', [marke]));
    const mitte = modell.nodes.leerzeile!.createChecked({ quelle: '\n' });
    const liste = modell.nodes.punkt!.createChecked({ quelle: '- Milch' }, modell.text('Milch'));
    const kopfzeile = modell.nodes.ueberschrift!.createChecked({ stufe: 2, zeichen: '#' });
    const ende = modell.nodes.absatz!.createChecked({ quelle: 'Ende\n' }, modell.text('Ende'));
    const doc = modell.node('doc', null, [
      modell.nodes.leerzeile!.createChecked({ quelle: 'vor' }),
      modell.nodes.absatz!.createChecked({ quelle: 'leer' }),
      kopfzeile,
      innen,
      mitte,
      liste,
      ende,
      modell.nodes.absatz!.createChecked(),
      modell.nodes.leerzeile!.createChecked(),
    ]);
    const vorher = doc.toJSON();
    const raus = ohneRandzeilen(doc);
    expect(doc.toJSON()).toEqual(vorher);
    expect(raus.childCount).toBe(5);
    expect(raus.child(0).eq(kopfzeile)).toBe(true);
    expect(raus.child(1).eq(innen)).toBe(true);
    expect(raus.child(2).eq(mitte)).toBe(true);
    expect(raus.child(3).eq(liste)).toBe(true);
    const endeKurz = modell.nodes.absatz!.createChecked({ quelle: 'Ende' }, modell.text('Ende'));
    expect(raus.child(4).eq(endeKurz)).toBe(true);
    const gleich = modell.node('doc', null, [innen, mitte, liste]);
    expect(ohneRandzeilen(gleich)).toBe(gleich);
    const leerzeichen = modell.nodes.absatz!.createChecked({ quelle: '  ' }, modell.text('  '));
    const mitLeerzeichen = modell.node('doc', null, [leerzeichen, innen]);
    const blieb = ohneRandzeilen(mitLeerzeichen);
    expect(blieb.childCount).toBe(2);
    expect(blieb.child(0).eq(leerzeichen)).toBe(true);
    const innenKurz = modell.nodes.absatz!.createChecked({ quelle: 'innen', flucht: true }, modell.text('Milch', [marke]));
    expect(blieb.child(1).eq(innenKurz)).toBe(true);
  });

  it('rewrites a checkbox source to the short marker when it disagrees', () => {
    const kasten = modell.nodes.punkt!.createChecked(
      { art: 'haken', abgehakt: true, quelle: '- [ ] a\n' },
      modell.text('a'),
    );
    const bleiben = modell.nodes.absatz!.createChecked({ quelle: 'keep' }, modell.text('keep'));
    const doc = modell.node('doc', null, [kasten, bleiben]);
    const neu = mitHakenKurz(doc);
    expect(String(neu.child(0).attrs.quelle)).toBe('[x] a\n');
    expect(neu.child(0).attrs.abgehakt).toBe(true);
    expect(neu.child(1).eq(bleiben)).toBe(true);
    expect(mitHakenKurz(neu)).toBe(neu);
    const offen = modell.nodes.punkt!.createChecked({ art: 'haken', abgehakt: false, quelle: '[] a' }, modell.text('a'));
    const passt = modell.node('doc', null, [offen]);
    expect(mitHakenKurz(passt)).toBe(passt);
  });
});
