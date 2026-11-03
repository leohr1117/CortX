import { describe, expect, it } from 'vitest';
import { ART } from './baum.ts';
import { modell } from './modell.ts';
import {
  INLINE_REGISTER,
  formatVon,
  inlineFormate,
} from './register.ts';
import {
  CODE_INLINE,
  FETT_MARKER,
  FETT_UNTER,
  KURSIV_MARKER,
  KURSIV_UNTER,
  LISTEN_EINFUEGEN,
  STREICH_MARKER,
  UEBERSCHRIFT_MARKER,
  WICHTIG_INLINE,
  WICHTIG_ZEILE,
  hakenVon,
  kopfZeichen,
  listenLaenge,
  nummerLaenge,
  zaunAuf,
} from './zeile.ts';

const INLINE = [ART.code, ART.wichtig, 'strich', ART.fett, ART.kursiv, ART.link] as const;

describe('format model', () => {
  it('builds a line document without a DOM', () => {
    expect(globalThis.document).toBeUndefined();
    expect(modell.topNodeType.spec.content).toBe('zeile*');
    const zeilen = [
      modell.nodes.absatz,
      modell.nodes.ueberschrift,
      modell.nodes.wichtigZeile,
      modell.nodes.punkt,
      modell.nodes.codeblock,
      modell.nodes.leerzeile,
    ];
    for (const knoten of zeilen) expect(knoten?.spec.group).toBe('zeile');
    expect(modell.nodes.punkt?.spec.content).toBe('inline*');
    expect(modell.nodes.codeblock?.spec.content).toBe('text*');
    expect(modell.nodes.codeblock?.spec.code).toBe(true);
    expect(modell.marks.strich).toBeDefined();
    expect(modell.marks.streich).toBeUndefined();

    expect(Object.keys(modell.marks)).toEqual(inlineFormate().map((format) => format.id));

    expect(modell.nodes.ueberschrift?.create().attrs).toEqual({
      stufe: 0,
      zeichen: formatVon(ART.ueberschrift).zeichen[0],
    });
    expect(modell.nodes.punkt?.create().attrs).toEqual({
      art: ART.liste,
      abgehakt: false,
      zeichen: formatVon(ART.liste).zeichen[0],
      einzug: 0,
    });
    expect(modell.nodes.codeblock?.create().attrs).toEqual({
      zaun: formatVon(ART.codeblock).zeichen[0],
    });
    expect(() => modell.marks.link?.create()).toThrow();
    expect(() => modell.nodes.punkt?.createChecked(null, modell.nodes.absatz?.create())).toThrow();
    expect(() => modell.nodes.codeblock?.createChecked(null, modell.text('a', [modell.marks.fett!.create()]))).toThrow();

    const fett = modell.marks.fett!.create();
    const link = modell.marks.link!.create({ ziel: 'https://example.test' });
    const doc = modell.node('doc', null, [
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
    expect(doc.childCount).toBe(6);
    expect(doc.child(0).inlineContent).toBe(true);
    expect(doc.child(3).attrs).toEqual({ art: 'haken', abgehakt: true, zeichen: '[]', einzug: 1 });
    expect(doc.child(3).childCount).toBe(1);
    const leer = modell.node('doc', null, []);
    expect(leer.childCount).toBe(0);
    expect(modell.nodeFromJSON(doc.toJSON()).eq(doc)).toBe(true);
    expect(modell.nodeFromJSON(leer.toJSON()).eq(leer)).toBe(true);
  });

  it('returns each inline format once, in register order', () => {
    const formate = inlineFormate();
    expect(formate.map((format) => format.id)).toEqual([...INLINE]);
    expect(new Set(formate.map((format) => format.id)).size).toBe(formate.length);
    expect(new Set(formate.map((format) => format.reihenfolge)).size).toBe(formate.length);
    expect(INLINE_REGISTER.filter((eintrag) => eintrag.art === ART.fett)).toHaveLength(2);
    expect(formate.filter((format) => format.id === ART.fett)).toHaveLength(1);

    expect(formatVon(ART.fett).zeichen).toEqual([FETT_MARKER, FETT_UNTER]);
    expect(formatVon(ART.kursiv).zeichen).toEqual([KURSIV_MARKER, KURSIV_UNTER]);
    expect(formatVon('strich').zeichen).toEqual([STREICH_MARKER]);
    expect(formatVon(ART.wichtig).zeichen).toEqual([WICHTIG_INLINE, WICHTIG_ZEILE]);
    expect(formatVon(ART.code).zeichen).toEqual([CODE_INLINE]);
    const link = formatVon(ART.link);
    expect(link.syntax?.geruest).toBe(`${link.zeichen[0]}{text}${link.zeichen[1]}{ziel}${link.zeichen[2]}`);
    expect(link.marken).toEqual({ ziel: {} });
    expect(formate.find((format) => format.id === ART.fett)?.marken).toBeUndefined();

    const kopf = formatVon(ART.ueberschrift).zeichen;
    expect(`${kopf[0]} `).toBe(UEBERSCHRIFT_MARKER);
    expect(kopfZeichen(1)).toBe(`${kopf[1]} `);
    const liste = formatVon(ART.liste).zeichen;
    expect(`${liste[0]} `).toBe(LISTEN_EINFUEGEN);
    for (const zeichen of liste) expect(listenLaenge(`${zeichen} Punkt`)).toBe(zeichen.length + 1);
    for (const zeichen of formatVon(ART.haken).zeichen) {
      expect(hakenVon(`${zeichen} Punkt`)?.abgehakt).toBe(zeichen === '[x]');
    }
    const nummer = formatVon(ART.nummer).zeichen[0] ?? '';
    expect(nummerLaenge(`${nummer} Punkt`)).toBe(`${nummer} `.length);
    for (const zaun of formatVon(ART.codeblock).zeichen) {
      expect(zaunAuf(zaun)).toEqual({ zeichen: zaun[0], lang: zaun.length });
    }
    for (const id of [ART.fett, ART.kursiv, 'strich', ART.wichtig, ART.code, ART.link, ART.ueberschrift, ART.liste, ART.haken, ART.codeblock, ART.nummer] as const) {
      expect(formatVon(id).zeichen.length).toBeGreaterThan(0);
      expect(Number.isInteger(formatVon(id).reihenfolge)).toBe(true);
    }
  });
});
