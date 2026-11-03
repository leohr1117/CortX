import type { Beleg } from './baum.ts';
import type { TextWahl } from './ueberschrift.ts';
import { schalteUeberschrift } from './ueberschrift.ts';
import { belege } from './lesen.ts';
import {
  INLINE_REGISTER,
  cursorInSchale,
  formatVon,
  klemme,
  type FormatBefehl,
  type InlineArt,
  type InlineStand,
} from './register.ts';
import { hakenVon, listenLaenge, nummerLaenge, ohneWagen } from './zeile.ts';

const ARTEN: readonly InlineArt[] = ['fett', 'kursiv', 'streich', 'wichtig', 'code'];
const SONDE = '\uE000';

function knopfMarker(art: InlineArt): string {
  return INLINE_REGISTER.find((eintrag) => eintrag.art === art && eintrag.knopf)?.marker ?? '';
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

function einsetzen(id: FormatBefehl): string {
  const wert = formatVon(id).syntax?.einsetzen;
  if (!wert) throw new Error('missing syntax');
  return wert;
}

function zeilenMarker(): string {
  const wert = formatVon('wichtig').syntax?.zeile;
  if (!wert) throw new Error('missing syntax');
  return wert;
}

function zaunMarker(): string {
  const wert = formatVon('code').syntax?.zaun;
  if (!wert) throw new Error('missing syntax');
  return wert;
}

function linkGeruest(): string {
  const wert = formatVon('link').syntax?.geruest;
  if (!wert) throw new Error('missing syntax');
  return wert;
}

function fuelleGeruest(geruest: string, text: string, ziel: string): string {
  const [vor, rest] = geruest.split('{text}');
  const [mitte, nach] = (rest ?? '').split('{ziel}');
  return (vor ?? '') + text + (mitte ?? '') + ziel + (nach ?? '');
}

function zeileUm(text: string, index: number): { von: number; bis: number } {
  const von = text.lastIndexOf('\n', index - 1) + 1;
  const danach = text.indexOf('\n', index);
  return { von, bis: danach < 0 ? text.length : danach };
}

function schiebe(index: number, von: number, delta: number): number {
  if (index < von) return index;
  return Math.max(von, index + delta);
}

function schaltePraefix(
  text: string,
  start: number,
  ende: number,
  marker: string,
  istAn: (zeile: string) => boolean,
  laengeWeg: (zeile: string) => number,
): TextWahl {
  const wahl = klemme(text, start, ende);
  const { von, bis } = zeileUm(text, wahl.start);
  const roh = text.slice(von, bis);
  const wagen = roh.endsWith('\r') ? '\r' : '';
  const kern = ohneWagen(roh);
  const an = istAn(kern);
  const delta = an ? -laengeWeg(kern) : marker.length;
  const neuKern = an ? kern.slice(laengeWeg(kern)) : marker + kern;
  return {
    text: text.slice(0, von) + neuKern + wagen + text.slice(bis),
    start: schiebe(wahl.start, von, delta),
    ende: schiebe(wahl.ende, von, delta),
  };
}

function listenWeg(zeile: string): number {
  const liste = listenLaenge(zeile);
  if (liste > 0) return liste;
  return nummerLaenge(zeile);
}

export function schalteFett(text: string, start: number, ende: number): TextWahl {
  return schalteInline(text, start, ende, 'fett');
}

export function schalteKursiv(text: string, start: number, ende: number): TextWahl {
  return schalteInline(text, start, ende, 'kursiv');
}

export function schalteStrich(text: string, start: number, ende: number): TextWahl {
  return schalteInline(text, start, ende, 'streich');
}

export function schalteListe(text: string, start: number, ende: number): TextWahl {
  return schaltePraefix(text, start, ende, einsetzen('liste'), (zeile) => listenWeg(zeile) > 0, listenWeg);
}

export function schalteHaken(text: string, start: number, ende: number): TextWahl {
  return schaltePraefix(
    text,
    start,
    ende,
    einsetzen('haken'),
    (zeile) => hakenVon(zeile) !== null,
    (zeile) => hakenVon(zeile)?.laenge ?? 0,
  );
}

export function schalteCode(text: string, start: number, ende: number): TextWahl {
  const wahl = klemme(text, start, ende);
  if (!text.slice(wahl.start, wahl.ende).includes('\n')) return schalteInline(text, wahl.start, wahl.ende, 'code');
  const zaun = zaunMarker();
  const von = text.lastIndexOf('\n', wahl.start - 1) + 1;
  let cursor = wahl.ende;
  if (wahl.ende > wahl.start && text[wahl.ende - 1] === '\n') cursor = wahl.ende - 1;
  const nl = text.indexOf('\n', cursor);
  const bis = nl < 0 ? text.length : nl;
  const block = text.slice(von, bis);
  const zeilen = block.split('\n');
  const erste = ohneWagen(zeilen[0] ?? '');
  const letzte = ohneWagen(zeilen[zeilen.length - 1] ?? '');
  if (zeilen.length >= 3 && erste === zaun && letzte === zaun) {
    const kern = zeilen.slice(1, -1).join('\n');
    return { text: text.slice(0, von) + kern + text.slice(bis), start: von, ende: von + kern.length };
  }
  const eingefuegt = `${zaun}\n${block}\n${zaun}`;
  const innen = von + zaun.length + 1;
  return { text: text.slice(0, von) + eingefuegt + text.slice(bis), start: innen, ende: innen + block.length };
}

export function schalteVerknuepfung(text: string, start: number, ende: number, ziel: string): TextWahl {
  const wahl = klemme(text, start, ende);
  const label = text.slice(wahl.start, wahl.ende);
  const kern = label.length > 0 ? label : ziel;
  const stueck = fuelleGeruest(linkGeruest(), kern, ziel);
  return {
    text: text.slice(0, wahl.start) + stueck + text.slice(wahl.ende),
    start: wahl.start + 1,
    ende: wahl.start + 1 + kern.length,
  };
}

function zeileKern(text: string, index: number): string {
  const { von, bis } = zeileUm(text, index);
  return ohneWagen(text.slice(von, bis));
}

function zeilenWichtig(text: string, start: number, ende: number): TextWahl {
  const marker = zeilenMarker();
  return schaltePraefix(
    text,
    start,
    ende,
    marker,
    (zeile) => zeile.startsWith(marker),
    (zeile) => (zeile.startsWith(marker) ? marker.length : 0),
  );
}

export function schalteWichtig(text: string, start: number, ende: number): TextWahl {
  const wahl = klemme(text, start, ende);
  const inhalt = text.slice(wahl.start, wahl.ende);
  const einzeilig = !inhalt.includes('\n');
  const kern = zeileKern(text, wahl.start);
  const zeilenForm = kern.startsWith(zeilenMarker());
  if (einzeilig && hatInlineWichtig(text, wahl.start, wahl.ende)) {
    return schalteInline(text, wahl.start, wahl.ende, 'wichtig');
  }
  if (zeilenForm) return zeilenWichtig(text, wahl.start, wahl.ende);
  if (einzeilig && inlineAn(text, wahl.start, wahl.ende).wichtig) {
    return schalteInline(text, wahl.start, wahl.ende, 'wichtig');
  }
  if (einzeilig && (inhalt.length > 0 || cursorInSchale(text, wahl.start))) {
    return schalteInline(text, wahl.start, wahl.ende, 'wichtig');
  }
  return zeilenWichtig(text, wahl.start, wahl.ende);
}

export function schalteKopf(text: string, start: number, ende: number): TextWahl {
  return schalteUeberschrift(text, start, ende);
}

export function schalteFormat(id: FormatBefehl, text: string, start: number, ende: number, ziel = ''): TextWahl {
  if (id === 'fett') return schalteFett(text, start, ende);
  if (id === 'kursiv') return schalteKursiv(text, start, ende);
  if (id === 'strich') return schalteStrich(text, start, ende);
  if (id === 'code') return schalteCode(text, start, ende);
  if (id === 'liste') return schalteListe(text, start, ende);
  if (id === 'haken') return schalteHaken(text, start, ende);
  if (id === 'wichtig') return schalteWichtig(text, start, ende);
  if (id === 'link') return schalteVerknuepfung(text, start, ende, ziel);
  return schalteKopf(text, start, ende);
}
