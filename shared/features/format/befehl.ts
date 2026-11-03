import { ART, type Beleg } from './baum.ts';
import type { TextWahl } from './ueberschrift.ts';
import { schalteUeberschrift } from './ueberschrift.ts';
import { belege, leseDokument, zeilenTreffer } from './lesen.ts';
import {
  INLINE_REGISTER,
  cursorInSchale,
  formatVon,
  klemme,
  type FormatBefehl,
  type InlineArt,
  type InlineStand,
} from './register.ts';
import { ohneWagen } from './zeile.ts';

const ARTEN: readonly InlineArt[] = [ART.fett, ART.kursiv, ART.streich, ART.wichtig, ART.code];
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
    if (beleg.art !== ART.wichtig || beleg.marker.length < 2) return false;
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

function inMarker(von: number, bis: number, spanne: readonly [number, number]): boolean {
  return von >= spanne[0] && bis <= spanne[1];
}

export function loeschePaar(text: string, von: number, bis: number): TextWahl | null {
  const wahl = klemme(text, von, bis);
  if (wahl.start === wahl.ende) return null;
  const arten = new Set<string>(INLINE_REGISTER.map((eintrag) => eintrag.art));
  let beste: Beleg | null = null;
  let breite = Number.POSITIVE_INFINITY;
  for (const beleg of leseDokument(text).belege) {
    if (!arten.has(beleg.art) || beleg.marker.length < 2) continue;
    if (!beleg.marker.some((spanne) => inMarker(wahl.start, wahl.ende, spanne))) continue;
    const span = beleg.ganzBis - beleg.ganzVon;
    if (span >= breite) continue;
    beste = beleg;
    breite = span;
  }
  if (!beste) return null;
  return entferne(text, beste.marker, wahl.start, wahl.ende);
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
    for (const beleg of passende(lagen(text, start, ende), ART.code, start, ende)) {
      const spanne = spanneZurueck(beleg, start);
      von = Math.min(von, spanne.von);
      bis = Math.max(bis, spanne.bis);
    }
    return { start: von, ende: bis };
  }
  for (const beleg of belege(text)) {
    if (beleg.art !== ART.code || !enthaelt(beleg, start, ende)) continue;
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
  const ziel = art === ART.code ? wahl : aussenVonCode(text, wahl.start, wahl.ende);
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
  const wert = formatVon(ART.wichtig).syntax?.zeile;
  if (!wert) throw new Error('missing syntax');
  return wert;
}

function zaunMarker(): string {
  const wert = formatVon(ART.code).syntax?.zaun;
  if (!wert) throw new Error('missing syntax');
  return wert;
}

function linkGeruest(): string {
  const wert = formatVon(ART.link).syntax?.geruest;
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

function prefixLaenge(beleg: Beleg): number {
  const erste = beleg.marker[0];
  return erste ? erste[1] - erste[0] : 0;
}

function listenBeleg(beleg: Beleg): boolean {
  if (beleg.art === ART.liste || beleg.art === ART.nummer) return true;
  return beleg.art === ART.haken && (beleg.listenLaenge ?? 0) > 0;
}

export function schalteFett(text: string, start: number, ende: number): TextWahl {
  return schalteInline(text, start, ende, ART.fett);
}

export function schalteKursiv(text: string, start: number, ende: number): TextWahl {
  return schalteInline(text, start, ende, ART.kursiv);
}

export function schalteStrich(text: string, start: number, ende: number): TextWahl {
  return schalteInline(text, start, ende, ART.streich);
}

export function schalteListe(text: string, start: number, ende: number): TextWahl {
  const wahl = klemme(text, start, ende);
  const beleg = zeilenTreffer(text, wahl.start, listenBeleg);
  const laenge = !beleg ? 0 : beleg.art === ART.haken ? (beleg.listenLaenge ?? 0) : prefixLaenge(beleg);
  return schaltePraefix(text, start, ende, einsetzen(ART.liste), () => laenge > 0, () => laenge);
}

export function schalteHaken(text: string, start: number, ende: number): TextWahl {
  const wahl = klemme(text, start, ende);
  const beleg = zeilenTreffer(text, wahl.start, (eintrag) => eintrag.art === ART.haken);
  const laenge = beleg ? prefixLaenge(beleg) : 0;
  return schaltePraefix(text, start, ende, einsetzen(ART.haken), () => laenge > 0, () => laenge);
}

function markerZeile(text: string, beleg: Beleg, index: number): string {
  const spanne = beleg.marker[index];
  if (!spanne) return '';
  return ohneWagen(text.slice(spanne[0], spanne[1]));
}

function zaunBeleg(text: string, von: number, bis: number, zaun: string): boolean {
  return belege(text).some((beleg) => {
    if (beleg.art !== ART.codeblock || beleg.ganzVon !== von || beleg.ganzBis !== bis) return false;
    return markerZeile(text, beleg, 0) === zaun && markerZeile(text, beleg, 1) === zaun;
  });
}

export function schalteCode(text: string, start: number, ende: number): TextWahl {
  const wahl = klemme(text, start, ende);
  if (!text.slice(wahl.start, wahl.ende).includes('\n')) return schalteInline(text, wahl.start, wahl.ende, ART.code);
  const zaun = zaunMarker();
  const von = text.lastIndexOf('\n', wahl.start - 1) + 1;
  let cursor = wahl.ende;
  if (wahl.ende > wahl.start && text[wahl.ende - 1] === '\n') cursor = wahl.ende - 1;
  const nl = text.indexOf('\n', cursor);
  const bis = nl < 0 ? text.length : nl;
  const block = text.slice(von, bis);
  const zeilen = block.split('\n');
  if (zaunBeleg(text, von, bis, zaun)) {
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

function zeileWichtig(beleg: Beleg): boolean {
  return beleg.art === ART.wichtig && beleg.marker.length === 1;
}

function zeilenWichtig(text: string, start: number, ende: number): TextWahl {
  const marker = zeilenMarker();
  const wahl = klemme(text, start, ende);
  const beleg = zeilenTreffer(text, wahl.start, zeileWichtig);
  const laenge = beleg ? prefixLaenge(beleg) : 0;
  return schaltePraefix(text, start, ende, marker, () => laenge > 0, () => laenge);
}

export function schalteWichtig(text: string, start: number, ende: number): TextWahl {
  const wahl = klemme(text, start, ende);
  const inhalt = text.slice(wahl.start, wahl.ende);
  const einzeilig = !inhalt.includes('\n');
  const zeilenForm = zeilenTreffer(text, wahl.start, zeileWichtig) !== null;
  if (einzeilig && hatInlineWichtig(text, wahl.start, wahl.ende)) {
    return schalteInline(text, wahl.start, wahl.ende, ART.wichtig);
  }
  if (zeilenForm) return zeilenWichtig(text, wahl.start, wahl.ende);
  if (einzeilig && inlineAn(text, wahl.start, wahl.ende).wichtig) {
    return schalteInline(text, wahl.start, wahl.ende, ART.wichtig);
  }
  if (einzeilig && (inhalt.length > 0 || cursorInSchale(text, wahl.start))) {
    return schalteInline(text, wahl.start, wahl.ende, ART.wichtig);
  }
  return zeilenWichtig(text, wahl.start, wahl.ende);
}

export function schalteKopf(text: string, start: number, ende: number): TextWahl {
  return schalteUeberschrift(text, start, ende);
}

type BefehlErgebnis = { art: 'ziel' } | { art: 'text'; wahl: TextWahl };

export function rufBefehl(
  id: FormatBefehl,
  text: string,
  start: number,
  ende: number,
  ziel: string | null,
): BefehlErgebnis {
  const befehl = formatVon(id);
  if (!befehl.run) throw new Error('unknown command');
  if (ziel === null && befehl.knopf?.ziel) return { art: 'ziel' };
  return { art: 'text', wahl: befehl.run(text, start, ende, ziel ?? '') };
}

