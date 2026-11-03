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

function ersetze(text: string, von: number, bis: number, einsetzen: string, cursor: number): TextWahl {
  return { text: text.slice(0, von) + einsetzen + text.slice(bis), start: cursor, ende: cursor };
}

function naechsterMarker(marker: string, abgehakt: boolean | undefined): string {
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

export function punktTaste(text: string, start: number, ende: number, art: PunktArt): TextWahl | null {
  if (start !== ende || !Number.isFinite(start)) return null;
  const index = Math.max(0, Math.min(Math.floor(start), text.length));
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
  const leer = text.slice(inhaltVon, inhaltBis).trim() === '';
  if (art === 'zurueck') {
    if (!leer || index !== inhaltVon) return null;
    return ersetze(text, zeile.von, zeile.bis, '', zeile.von);
  }
  if (art === 'umbruch') {
    const spalte = Math.max(inhaltVon, Math.min(index, inhaltBis));
    const einsetzen = `\n${' '.repeat(marker.length)}`;
    return ersetze(text, spalte, spalte, einsetzen, spalte + einsetzen.length);
  }
  if (leer && kopf) return ersetze(text, zeile.von, zeile.bis, '', zeile.von);
  if (leer) {
    const neu = naechsterMarker(marker, beleg.abgehakt);
    return ersetze(text, zeile.von, inhaltBis, neu, zeile.von + neu.length);
  }
  const spalte = Math.max(inhaltVon, Math.min(index, inhaltBis));
  const neu = naechsterMarker(marker, beleg.abgehakt);
  const einsetzen = `\n${neu}`;
  return ersetze(text, spalte, spalte, einsetzen, spalte + einsetzen.length);
}
