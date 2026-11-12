import { describe, expect, it } from 'vitest';
import { formatVon, leistenEintraege, type BefehlAktiv, type BefehlRun, type FormatBefehl } from './register.ts';
import { textBefehl } from './zeilen.ts';

function befehl(id: FormatBefehl): { run: BefehlRun; isActive: BefehlAktiv } {
  const ausLeiste = leistenEintraege().find((eintrag) => eintrag.id === id);
  const ausRegister = formatVon(id);
  expect(ausLeiste).toBe(ausRegister);
  return textBefehl(id);
}

describe('format commands', () => {
  it('bold wraps and lights the same command the bar and the shortcut use', () => {
    const fett = befehl('fett');
    expect(fett.isActive('', 0, 0)).toBe(false);
    const an = fett.run('Anna', 0, 4);
    expect(an).toEqual({ text: '**Anna**', start: 2, ende: 6 });
    expect(fett.isActive(an.text, an.start, an.ende)).toBe(true);
    expect(fett.isActive(an.text, 0, 0)).toBe(false);
    const aus = fett.run(an.text, an.start, an.ende);
    expect(fett.isActive(aus.text, aus.start, aus.ende)).toBe(false);
  });

  it('italic wraps a star and lights inside either marker', () => {
    const kursiv = befehl('kursiv');
    expect(kursiv.isActive('', 0, 0)).toBe(false);
    const an = kursiv.run('Anna', 0, 4);
    expect(an.text).toBe('*Anna*');
    expect(kursiv.isActive(an.text, an.start, an.ende)).toBe(true);
    expect(kursiv.isActive('_x_', 1, 1)).toBe(true);
  });

  it('strike wraps a tilde pair and lights inside it', () => {
    const strich = befehl('strich');
    expect(strich.isActive('', 0, 0)).toBe(false);
    const an = strich.run('Anna', 0, 4);
    expect(an.text).toBe('~~Anna~~');
    expect(strich.isActive('~~x~~', 2, 2)).toBe(true);
    expect(strich.isActive(an.text, 0, 0)).toBe(false);
  });

  it('important marks a selection inline and a bare cursor as a line', () => {
    const wichtig = befehl('wichtig');
    expect(wichtig.isActive('', 0, 0)).toBe(false);
    const wort = wichtig.run('see Anna', 4, 8);
    expect(wort.text).toBe('see !!Anna!!');
    expect(wichtig.isActive(wort.text, wort.start, wort.ende)).toBe(true);
    const zeile = wichtig.run('Milk', 4, 4);
    expect(zeile).toEqual({ text: '!!!! Milk', start: 9, ende: 9 });
    expect(wichtig.isActive(zeile.text, zeile.start, zeile.ende)).toBe(true);
  });

  it('code wraps a span and lights a fenced block', () => {
    const code = befehl('code');
    expect(code.isActive('', 0, 0)).toBe(false);
    const span = code.run('x', 0, 1);
    expect(span.text).toBe('`x`');
    expect(code.isActive(span.text, span.start, span.ende)).toBe(true);
    const zaun = '```\n**x**\n```';
    expect(code.isActive(zaun, 4, 4)).toBe(true);
    expect(befehl('fett').isActive(zaun, 4, 4)).toBe(false);
    const weg = code.run(zaun, 0, zaun.length);
    expect(weg).toEqual({ text: '**x**', start: 0, ende: 5 });
  });

  it('heading marks the current line and lights a hash heading', () => {
    const kopf = befehl('ueberschrift');
    expect(kopf.isActive('', 0, 0)).toBe(false);
    expect(kopf.run('one\ntwo', 4, 7).text).toBe('one\n= two');
    expect(kopf.isActive('= Title', 2, 2)).toBe(true);
    expect(kopf.isActive('# Title', 2, 2)).toBe(true);
    expect(kopf.isActive('#tag', 2, 2)).toBe(false);
    expect(kopf.isActive('= Title\nplain', 0, 14)).toBe(true);
    expect(kopf.isActive('plain\n= Title', 0, 14)).toBe(false);
  });

  it('list inserts a dash and lights a star, a plus, and a number', () => {
    const liste = befehl('liste');
    expect(liste.isActive('', 0, 0)).toBe(false);
    const an = liste.run('milk', 0, 4);
    expect(an.text).toBe('- milk');
    expect(liste.isActive(an.text, an.start, an.ende)).toBe(true);
    expect(liste.isActive('* a', 2, 2)).toBe(true);
    expect(liste.isActive('+ a', 2, 2)).toBe(true);
    expect(liste.isActive('12. a', 4, 4)).toBe(true);
    expect(liste.isActive('1.a', 2, 2)).toBe(false);
  });

  it('checklist inserts a box and lights a checked task', () => {
    const haken = befehl('haken');
    expect(haken.isActive('', 0, 0)).toBe(false);
    const an = haken.run('call', 0, 4);
    expect(an.text).toBe('[] call');
    expect(haken.isActive(an.text, an.start, an.ende)).toBe(true);
    expect(haken.isActive('[x] a', 4, 4)).toBe(true);
    expect(haken.isActive('- [ ] a', 6, 6)).toBe(true);
    expect(befehl('liste').isActive('- [ ] a', 6, 6)).toBe(true);
  });

  it('link asks for an address, then writes with the same command', () => {
    const link = befehl('link');
    expect(link.isActive('', 0, 0)).toBe(false);
    const an = link.run('a', 0, 1, 'https://a.test');
    expect(an.text).toBe('[a](https://a.test)');
    expect(link.isActive(an.text, 1, 1)).toBe(true);
    expect(link.isActive(an.text, 0, 3)).toBe(false);
  });
});
