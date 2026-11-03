import { ART, type Beleg } from './baum.ts';
import { zeilenTreffer } from './lesen.ts';
import { formatVon } from './register.ts';

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

function marker(): string {
  const wert = formatVon(ART.ueberschrift).syntax?.einsetzen;
  if (!wert) throw new Error('missing syntax');
  return wert;
}

function legacyKopf(text: string, index: number): Beleg | null {
  return zeilenTreffer(text, index, (beleg) => beleg.art === ART.ueberschrift && beleg.stufe === undefined);
}

export function zeileIstUeberschrift(text: string, index: number): boolean {
  const wahl = klemme(text, index, index);
  return legacyKopf(text, wahl.start) !== null;
}

export function schalteUeberschrift(text: string, start: number, ende: number): TextWahl {
  const wahl = klemme(text, start, ende);
  const { von, bis } = grenzen(text, wahl.start);
  const kern = kernVon(text, von, bis);
  const zeichen = marker();
  const kopf = legacyKopf(text, wahl.start);
  const laenge = kopf?.marker[0] ? kopf.marker[0][1] - kopf.marker[0][0] : 0;
  const neu = laenge > 0
    ? text.slice(0, von) + kern.slice(laenge) + text.slice(von + kern.length)
    : text.slice(0, von) + zeichen + text.slice(von);
  const delta = laenge > 0 ? -laenge : zeichen.length;
  return {
    text: neu,
    start: ruecke(wahl.start, von, delta),
    ende: ruecke(wahl.ende, von, delta),
  };
}
