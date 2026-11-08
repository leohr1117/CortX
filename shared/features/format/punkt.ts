import { ART, type Beleg } from './baum.ts';
import { leseDokument } from './lesen.ts';
import type { TextWahl } from './ueberschrift.ts';
import { zeilenStuecke, type ZeilenStueck } from './zeile.ts';

export type PunktArt = 'enter' | 'umbruch' | 'zurueck';

export const PUNKT_TASTEN: readonly { taste: string; art: PunktArt }[] = [
  { taste: 'Enter', art: 'enter' },
  { taste: 'Shift-Enter', art: 'umbruch' },
  { taste: 'Backspace', art: 'zurueck' },
];

export function punktArt(inputType: string, data: string | null): PunktArt | null {
  if (inputType === 'insertParagraph') return 'enter';
  if (inputType === 'insertLineBreak') return 'umbruch';
  if (inputType === 'insertText' && (data === '\n' || data === '\r\n')) return 'enter';
  if (inputType === 'deleteContentBackward') return 'zurueck';
  return null;
}

export function ersetze(text: string, von: number, bis: number, einsetzen: string, cursor: number): TextWahl {
  return { text: text.slice(0, von) + einsetzen + text.slice(bis), start: cursor, ende: cursor };
}

export function naechsterMarker(marker: string, abgehakt: boolean | undefined): string {
  if (!abgehakt) return marker;
  if (marker.startsWith('[x]')) return `[]${marker.slice(3)}`;
  return marker.replace('[x]', '[ ]');
}

function imCode(belege: readonly Beleg[], index: number): boolean {
  for (const beleg of belege) {
    if (beleg.art !== ART.codeblock) continue;
    if (index >= beleg.von && index <= beleg.bis) return true;
  }
  return false;
}

function findePunkt(belege: readonly Beleg[], index: number): Beleg | null {
  let fund: Beleg | null = null;
  for (const beleg of belege) {
    if (beleg.art !== ART.liste && beleg.art !== ART.haken) continue;
    const ende = beleg.folgeBis ?? beleg.bisZeile ?? beleg.ganzBis;
    if (index >= beleg.ganzVon && index <= ende) fund = beleg;
  }
  return fund;
}

function zeileAn(stuecke: readonly ZeilenStueck[], index: number): ZeilenStueck | null {
  for (const stueck of stuecke) {
    if (index >= stueck.von && index <= stueck.bis) return stueck;
  }
  return null;
}

function zeilenEnde(text: string, zeile: ZeilenStueck): number {
  if (zeile.bis > zeile.von && text[zeile.bis - 1] === '\r') return zeile.bis - 1;
  return zeile.bis;
}

interface Ort {
  zeile: ZeilenStueck;
  inhaltVon: number;
  inhaltBis: number;
  kopf: boolean;
  marker: string;
  abgehakt: boolean | undefined;
}

export function ortAn(text: string, index: number): Ort | null {
  const belege = leseDokument(text).belege;
  if (imCode(belege, index)) return null;
  const beleg = findePunkt(belege, index);
  if (!beleg || beleg.von < beleg.ganzVon) return null;
  const marker = text.slice(beleg.ganzVon, beleg.von);
  if (marker.length < 1) return null;
  const zeile = zeileAn(zeilenStuecke(text), index);
  if (!zeile) return null;
  const inhaltBis = zeilenEnde(text, zeile);
  const kopf = zeile.von === beleg.ganzVon;
  const inhaltVon = kopf ? Math.min(beleg.von, inhaltBis) : Math.min(zeile.von + marker.length, inhaltBis);
  return { zeile, inhaltVon, inhaltBis, kopf, marker, abgehakt: beleg.abgehakt };
}

export function punktInhalt(text: string, index: number): { von: number; bis: number } | null {
  if (!Number.isFinite(index)) return null;
  const ort = ortAn(text, Math.max(0, Math.min(Math.floor(index), text.length)));
  if (!ort) return null;
  return { von: ort.inhaltVon, bis: ort.inhaltBis };
}
