import { describe, expect, it } from 'vitest';
import {
  schalteFett,
  schalteHaken,
  schalteListe,
  schalteWichtig,
} from '../../../../shared/features/format/index.ts';
import { leseDruck, type Druck } from './druck.ts';

const AUS: Druck = {
  fett: false,
  kursiv: false,
  strich: false,
  code: false,
  link: false,
  ueberschrift: false,
  liste: false,
  haken: false,
  wichtig: false,
};

function an(text: string, start: number, ende = start): Druck {
  return leseDruck(text, start, ende);
}

describe('format bar state', () => {
  it('lights a button only while the caret or the selection sits inside that format', () => {
    expect(an('', 0)).toEqual(AUS);
    expect(an('**bold**', 2).fett).toBe(true);
    expect(an('**bold**', 0).fett).toBe(false);
    expect(an('**bold**', 6).fett).toBe(true);
    expect(an('**bold**', 8).fett).toBe(false);
    expect(an('**bold**', 2, 4).fett).toBe(true);
    expect(an('**bold**', 0, 4).fett).toBe(false);
    expect(an('*x*', 1).kursiv).toBe(true);
    expect(an('_x_', 1).kursiv).toBe(true);
    expect(an('~~x~~', 2).strich).toBe(true);
    expect(an('`x`', 1).code).toBe(true);
    const zaun = '```\n**x**\n```';
    expect(an(zaun, 4)).toMatchObject({ code: true, fett: false });
    expect(an('[a](https://a.test)', 1).link).toBe(true);
    expect(an('[a](https://a.test)', 0, 3).link).toBe(false);
    expect(an('= Title', 2).ueberschrift).toBe(true);
    expect(an('# Title', 2).ueberschrift).toBe(true);
    expect(an('#tag', 2).ueberschrift).toBe(false);
    expect(an('- a', 2).liste).toBe(true);
    expect(an('* a', 2).liste).toBe(true);
    expect(an('+ a', 2).liste).toBe(true);
    expect(an('12. a', 4).liste).toBe(true);
    expect(an('1.a', 2).liste).toBe(false);
    expect(an('[] a', 3).haken).toBe(true);
    expect(an('[x] a', 4).haken).toBe(true);
    expect(an('- [ ] a', 6)).toMatchObject({ haken: true, liste: true });
    expect(an('* [x] a', 6).haken).toBe(true);
    expect(an('+ [ ] a', 6).haken).toBe(true);
    expect(an('!!a!!', 2).wichtig).toBe(true);
    expect(an('!!!! a', 6).wichtig).toBe(true);
    expect(an('= Title\nplain', 0, 14).ueberschrift).toBe(true);
    expect(an('plain\n= Title', 0, 14).ueberschrift).toBe(false);
  });

  it('follows the command the writing surface just applied', () => {
    const fett = schalteFett('Anna', 0, 4);
    expect(leseDruck(fett.text, fett.start, fett.ende).fett).toBe(true);
    const weg = schalteFett(fett.text, fett.start, fett.ende);
    expect(leseDruck(weg.text, weg.start, weg.ende).fett).toBe(false);
    const zeile = schalteWichtig('Milk', 4, 4);
    expect(leseDruck(zeile.text, zeile.start, zeile.ende).wichtig).toBe(true);
    const liste = schalteListe('milk', 0, 4);
    expect(leseDruck(liste.text, liste.start, liste.ende).liste).toBe(true);
    const haken = schalteHaken('call', 0, 4);
    expect(leseDruck(haken.text, haken.start, haken.ende).haken).toBe(true);
  });
});
