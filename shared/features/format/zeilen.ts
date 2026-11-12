import {
  aktivCode,
  aktivFett,
  aktivHaken,
  aktivKopf,
  aktivKursiv,
  aktivLink,
  aktivListe,
  aktivStrich,
  aktivWichtig,
} from './aktiv.ts';
import { ART, type Beleg } from './baum.ts';
import {
  schalteCode,
  schalteFett,
  schalteHaken,
  schalteKopf,
  schalteKursiv,
  schalteListe,
  schalteStrich,
  schalteVerknuepfung,
  schalteWichtig,
} from './befehl.ts';
import { leseDokument } from './lesen.ts';
import { formatVon, klemme, type BefehlAktiv, type BefehlRun, type FormatBefehl } from './register.ts';
import type { TextWahl } from './ueberschrift.ts';
import { zeilenStuecke, type ZeilenStueck } from './zeile.ts';

interface Schnitt {
  von: number;
  bis: number;
}

function artVon(id: FormatBefehl): string {
  if (id === 'strich') return ART.streich;
  return id;
}

function inhaltBis(zeile: ZeilenStueck): number {
  return zeile.von + zeile.zeile.length;
}

function treffer(text: string, start: number, ende: number): ZeilenStueck[] {
  const wahl = klemme(text, start, ende);
  if (wahl.start === wahl.ende) return [];
  return zeilenStuecke(text).filter((zeile) => {
    const von = Math.max(wahl.start, zeile.von);
    const bis = Math.min(wahl.ende, inhaltBis(zeile));
    return bis > von;
  });
}

function sprung(belege: readonly Beleg[], zeilenStart: number, bis: number): number {
  let von = zeilenStart;
  for (const beleg of belege) {
    if (beleg.ganzVon !== zeilenStart || beleg.marker.length !== 1) continue;
    const ende = beleg.marker[0]?.[1] ?? von;
    if (ende > von && ende <= bis) von = ende;
  }
  return von;
}

function bereich(
  belege: readonly Beleg[],
  zeile: ZeilenStueck,
  start: number,
  ende: number,
  block: boolean,
): Schnitt | null {
  if (block) return { von: zeile.von, bis: zeile.von };
  const bis = Math.min(ende, inhaltBis(zeile));
  const von = Math.max(sprung(belege, zeile.von, bis), start);
  if (bis <= von) return null;
  return { von, bis };
}

function liegt(index: number, spannen: readonly (readonly [number, number])[]): boolean {
  for (const [von, bis] of spannen) {
    if (index >= von && index < bis) return true;
  }
  return false;
}

function hatInline(belege: readonly Beleg[], art: string, von: number, bis: number): boolean {
  if (bis <= von) return false;
  const marker: Array<[number, number]> = [];
  const inhalt: Array<[number, number]> = [];
  for (const beleg of belege) {
    if (beleg.marker.length < 2) continue;
    marker.push(...beleg.marker);
    if (beleg.art === art) inhalt.push([beleg.von, beleg.bis]);
  }
  let zeichen = false;
  for (let i = von; i < bis; i += 1) {
    if (liegt(i, marker)) continue;
    zeichen = true;
    if (!liegt(i, inhalt)) return false;
  }
  return zeichen;
}

function markerImSchnitt(text: string, art: string, von: number, bis: number): Array<[number, number]> {
  const gesehen = new Set<string>();
  const aus: Array<[number, number]> = [];
  for (const beleg of leseDokument(text).belege) {
    if (beleg.art !== art || beleg.marker.length < 2) continue;
    if (beleg.ganzBis <= von || beleg.ganzVon >= bis) continue;
    for (const spanne of beleg.marker) {
      const schluessel = `${spanne[0]}:${spanne[1]}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      aus.push(spanne);
    }
  }
  return aus;
}

function ohneMarker(text: string, marker: Array<[number, number]>, start: number, ende: number): TextWahl {
  const bereiche = [...marker].sort((a, b) => b[0] - a[0]);
  let neu = text;
  let von = start;
  let bis = ende;
  for (const [links, rechts] of bereiche) {
    if (rechts <= links) continue;
    neu = neu.slice(0, links) + neu.slice(rechts);
    const delta = rechts - links;
    if (von >= rechts) von -= delta;
    else if (von > links) von = links;
    if (bis >= rechts) bis -= delta;
    else if (bis > links) bis = links;
  }
  return { text: neu, start: von, ende: bis };
}

function schiebe(index: number, stelle: number, delta: number): number {
  if (delta === 0 || index <= stelle) return index;
  if (delta > 0) return index + delta;
  const geloeschtBis = stelle - delta;
  if (index >= geloeschtBis) return index + delta;
  return stelle;
}

function schiebeBereich(index: number, von: number, bis: number, delta: number): number {
  if (index <= von) return index;
  if (index >= bis) return index + delta;
  return bis + delta;
}

function blockAn(roh: BefehlRun, text: string, stelle: number, ziel: string): boolean {
  return roh(text, stelle, stelle, ziel).text.length < text.length;
}

export function schalteMarkierung(
  id: FormatBefehl,
  roh: BefehlRun,
  text: string,
  start: number,
  ende: number,
  ziel = '',
): TextWahl {
  const zeilen = treffer(text, start, ende);
  if (zeilen.length < 2) return roh(text, start, ende, ziel);
  const syntax = formatVon(id).syntax;
  if (syntax?.zaun) return roh(text, start, ende, ziel);
  const wahl = klemme(text, start, ende);
  const block = Boolean(syntax?.einsetzen || syntax?.zeile);
  const art = artVon(id);
  const belege = leseDokument(text).belege;
  const schnitte: Schnitt[] = [];
  for (const zeile of zeilen) {
    const schnitt = bereich(belege, zeile, wahl.start, wahl.ende, block);
    if (schnitt) schnitte.push(schnitt);
  }
  if (schnitte.length < 2) return roh(text, start, ende, ziel);
  const hats = schnitte.map((schnitt) =>
    block ? blockAn(roh, text, schnitt.von, ziel) : hatInline(belege, art, schnitt.von, schnitt.bis),
  );
  const alle = hats.every(Boolean);
  let aktuell = text;
  let versatz = 0;
  let selStart = wahl.start;
  let selEnde = wahl.ende;
  for (let i = 0; i < schnitte.length; i += 1) {
    if (alle !== (hats[i] === true)) continue;
    const schnitt = schnitte[i]!;
    const von = schnitt.von + versatz;
    const bis = schnitt.bis + versatz;
    const vorher = aktuell.length;
    if (block) {
      const ergebnis = roh(aktuell, von, von, ziel);
      const delta = ergebnis.text.length - vorher;
      aktuell = ergebnis.text;
      selStart = schiebe(selStart, von, delta);
      selEnde = schiebe(selEnde, von, delta);
      versatz += delta;
      continue;
    }
    if (alle) {
      const marker = markerImSchnitt(aktuell, art, von, bis);
      if (marker.length === 0) continue;
      const neu = ohneMarker(aktuell, marker, selStart, selEnde);
      versatz += neu.text.length - vorher;
      aktuell = neu.text;
      selStart = neu.start;
      selEnde = neu.ende;
      continue;
    }
    const ergebnis = roh(aktuell, von, bis, ziel);
    const delta = ergebnis.text.length - vorher;
    aktuell = ergebnis.text;
    selStart = schiebeBereich(selStart, von, bis, delta);
    selEnde = schiebeBereich(selEnde, von, bis, delta);
    versatz += delta;
  }
  const aus = klemme(aktuell, selStart, selEnde);
  return { text: aktuell, start: aus.start, ende: aus.ende };
}

export function alsBefehl(id: FormatBefehl, roh: BefehlRun): BefehlRun {
  return (text, start, ende, ziel) => schalteMarkierung(id, roh, text, start, ende, ziel ?? '');
}

function laufLink(text: string, start: number, ende: number, ziel = ''): TextWahl {
  return schalteVerknuepfung(text, start, ende, ziel);
}

export function textBefehl(id: FormatBefehl): { run: BefehlRun; isActive: BefehlAktiv } {
  const tabelle: Record<FormatBefehl, readonly [BefehlRun, BefehlAktiv]> = {
    [ART.fett]: [schalteFett, aktivFett],
    [ART.kursiv]: [schalteKursiv, aktivKursiv],
    strich: [schalteStrich, aktivStrich],
    [ART.wichtig]: [schalteWichtig, aktivWichtig],
    [ART.code]: [schalteCode, aktivCode],
    [ART.ueberschrift]: [schalteKopf, aktivKopf],
    [ART.liste]: [schalteListe, aktivListe],
    [ART.haken]: [schalteHaken, aktivHaken],
    [ART.link]: [laufLink, aktivLink],
  };
  const [roh, isActive] = tabelle[id];
  return { run: alsBefehl(id, roh), isActive };
}
