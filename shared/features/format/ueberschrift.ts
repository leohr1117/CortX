import { UEBERSCHRIFT_MARKER } from './lesen.ts';

export interface TextWahl {
  text: string;
  start: number;
  ende: number;
}

function klemme(text: string, start: number, ende: number): { start: number; ende: number } {
  const links = Number.isFinite(start) ? Math.floor(start) : 0;
  const rechts = Number.isFinite(ende) ? Math.floor(ende) : links;
  const von = Math.max(0, Math.min(links, text.length));
  const bis = Math.max(0, Math.min(rechts, text.length));
  return von <= bis ? { start: von, ende: bis } : { start: bis, ende: von };
}

function grenzen(text: string, index: number): { von: number; bis: number } {
  const sicher = Math.max(0, Math.min(index, text.length));
  const davor = text.lastIndexOf('\n', sicher - 1);
  const von = davor < 0 ? 0 : davor + 1;
  const danach = text.indexOf('\n', sicher);
  const bis = danach < 0 ? text.length : danach;
  return { von, bis };
}

function kernVon(text: string, von: number, bis: number): string {
  const roh = text.slice(von, bis);
  return roh.endsWith('\r') ? roh.slice(0, -1) : roh;
}

function ruecke(index: number, grenze: number, delta: number): number {
  if (index < grenze) return index;
  return Math.max(grenze, index + delta);
}

export function zeileIstUeberschrift(text: string, index: number): boolean {
  const wahl = klemme(text, index, index);
  const { von, bis } = grenzen(text, wahl.start);
  return kernVon(text, von, bis).startsWith(UEBERSCHRIFT_MARKER);
}

export function schalteUeberschrift(text: string, start: number, ende: number): TextWahl {
  const wahl = klemme(text, start, ende);
  const { von, bis } = grenzen(text, wahl.start);
  const kern = kernVon(text, von, bis);
  const an = kern.startsWith(UEBERSCHRIFT_MARKER);
  const neu = an
    ? text.slice(0, von) + kern.slice(UEBERSCHRIFT_MARKER.length) + text.slice(von + kern.length)
    : text.slice(0, von) + UEBERSCHRIFT_MARKER + text.slice(von);
  const delta = an ? -UEBERSCHRIFT_MARKER.length : UEBERSCHRIFT_MARKER.length;
  return {
    text: neu,
    start: ruecke(wahl.start, von, delta),
    ende: ruecke(wahl.ende, von, delta),
  };
}
