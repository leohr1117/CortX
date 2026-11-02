import type { Beleg } from './baum.ts';
import { belege } from './lesen.ts';
import type { TextWahl } from './ueberschrift.ts';

export type InlineArt = 'fett' | 'kursiv' | 'streich' | 'wichtig' | 'code';

interface InlineEintrag {
  art: InlineArt;
  marker: string;
  knopf: boolean;
}

export const INLINE_REGISTER: readonly InlineEintrag[] = [
  { art: 'code', marker: '`', knopf: true },
  { art: 'wichtig', marker: '!!', knopf: true },
  { art: 'streich', marker: '~~', knopf: true },
  { art: 'fett', marker: '**', knopf: true },
  { art: 'fett', marker: '__', knopf: false },
  { art: 'kursiv', marker: '*', knopf: true },
  { art: 'kursiv', marker: '_', knopf: false },
];

const ARTEN: readonly InlineArt[] = ['fett', 'kursiv', 'streich', 'wichtig', 'code'];

export const MARKER_ZEICHEN = new Set(['*', '_', '~', '!', '`']);

const SONDE = '\uE000';

export interface InlineStand {
  fett: boolean;
  kursiv: boolean;
  streich: boolean;
  wichtig: boolean;
  code: boolean;
}

function knopfMarker(art: InlineArt): string {
  return INLINE_REGISTER.find((eintrag) => eintrag.art === art && eintrag.knopf)?.marker ?? '';
}

export function nurMarker(text: string): boolean {
  if (text.length === 0) return false;
  for (const zeichen of text) {
    if (!MARKER_ZEICHEN.has(zeichen)) return false;
  }
  return true;
}

export function cursorInSchale(text: string, index: number): boolean {
  const links = text[index - 1];
  const rechts = text[index];
  return links !== undefined && rechts !== undefined && MARKER_ZEICHEN.has(links) && MARKER_ZEICHEN.has(rechts);
}

export function klemme(text: string, start: number, ende: number): { start: number; ende: number } {
  const links = Number.isFinite(start) ? Math.floor(start) : 0;
  const rechts = Number.isFinite(ende) ? Math.floor(ende) : links;
  const von = Math.max(0, Math.min(links, text.length));
  const bis = Math.max(0, Math.min(rechts, text.length));
  return von <= bis ? { start: von, ende: bis } : { start: bis, ende: von };
}

function enthaelt(beleg: Beleg, start: number, ende: number): boolean {
  return start >= beleg.von && ende <= beleg.bis;
}

function cursorImInhalt(beleg: Beleg, index: number): boolean {
  return index >= beleg.von && index <= beleg.bis;
}

function sondeDrin(beleg: Beleg, index: number): boolean {
  return beleg.von <= index && beleg.bis >= index + 1;
}

function lagen(text: string, start: number, ende: number): Beleg[] {
  if (start !== ende) return belege(text);
  return belege(text.slice(0, start) + SONDE + text.slice(start));
}

function passende(liste: readonly Beleg[], art: InlineArt, start: number, ende: number): Beleg[] {
  if (start !== ende) return liste.filter((beleg) => beleg.art === art && enthaelt(beleg, start, ende));
  return liste.filter((beleg) => beleg.art === art && sondeDrin(beleg, start));
}

function kleinste(liste: readonly Beleg[]): Beleg | null {
  let beste: Beleg | null = null;
  let spanne = Number.POSITIVE_INFINITY;
  for (const beleg of liste) {
    const breite = beleg.ganzBis - beleg.ganzVon;
    if (breite < spanne) {
      beste = beleg;
      spanne = breite;
    }
  }
  return beste;
}

function markerZurueck(marker: Array<[number, number]>, index: number, leer: boolean): Array<[number, number]> {
  const roh = marker.filter(([von, bis]) => bis > von && (!leer || bis <= index || von >= index));
  if (!leer) return roh;
  return roh.map(([von, bis]) => [von > index ? von - 1 : von, bis > index ? bis - 1 : bis]);
}

export function inlineAn(text: string, start: number, ende: number): InlineStand {
  const wahl = klemme(text, start, ende);
  const liste = lagen(text, wahl.start, wahl.ende);
  const stand: InlineStand = { fett: false, kursiv: false, streich: false, wichtig: false, code: false };
  for (const art of ARTEN) stand[art] = passende(liste, art, wahl.start, wahl.ende).length > 0;
  return stand;
}

export function hatInlineWichtig(text: string, start: number, ende: number): boolean {
  const wahl = klemme(text, start, ende);
  return belege(text).some((beleg) => {
    if (beleg.art !== 'wichtig' || beleg.marker.length < 2) return false;
    if (wahl.start === wahl.ende) return cursorImInhalt(beleg, wahl.start);
    return enthaelt(beleg, wahl.start, wahl.ende);
  });
}

function entferne(text: string, marker: Array<[number, number]>, start: number, ende: number): TextWahl {
  const bereiche = [...marker].sort((a, b) => b[0] - a[0]);
  let neu = text;
  let von = start;
  let bis = ende;
  for (const [links, rechts] of bereiche) {
    neu = neu.slice(0, links) + neu.slice(rechts);
    const delta = rechts - links;
    if (von >= rechts) von -= delta;
    else if (von > links) von = links;
    if (bis >= rechts) bis -= delta;
    else if (bis > links) bis = links;
  }
  return { text: neu, start: von, ende: bis };
}

function spanneZurueck(beleg: Beleg, index: number): { von: number; bis: number } {
  return {
    von: beleg.ganzVon > index ? beleg.ganzVon - 1 : beleg.ganzVon,
    bis: beleg.ganzBis > index ? beleg.ganzBis - 1 : beleg.ganzBis,
  };
}

function aussenVonCode(text: string, start: number, ende: number): { start: number; ende: number } {
  let von = start;
  let bis = ende;
  if (start === ende) {
    for (const beleg of passende(lagen(text, start, ende), 'code', start, ende)) {
      const spanne = spanneZurueck(beleg, start);
      von = Math.min(von, spanne.von);
      bis = Math.max(bis, spanne.bis);
    }
    return { start: von, ende: bis };
  }
  for (const beleg of belege(text)) {
    if (beleg.art !== 'code' || !enthaelt(beleg, start, ende)) continue;
    von = Math.min(von, beleg.ganzVon);
    bis = Math.max(bis, beleg.ganzBis);
  }
  return { start: von, ende: bis };
}

export function schalteInline(text: string, start: number, ende: number, art: InlineArt): TextWahl {
  const wahl = klemme(text, start, ende);
  const fund = kleinste(passende(lagen(text, wahl.start, wahl.ende), art, wahl.start, wahl.ende));
  if (fund) {
    const marker = markerZurueck(fund.marker, wahl.start, wahl.start === wahl.ende);
    if (marker.length > 0) return entferne(text, marker, wahl.start, wahl.ende);
  }
  const zeichen = knopfMarker(art);
  const ziel = art === 'code' ? wahl : aussenVonCode(text, wahl.start, wahl.ende);
  const neu =
    text.slice(0, ziel.start) + zeichen + text.slice(ziel.start, ziel.ende) + zeichen + text.slice(ziel.ende);
  const schub = zeichen.length;
  return { text: neu, start: wahl.start + schub, ende: wahl.ende + schub };
}
