import { ART, type Beleg } from './baum.ts';
import { leseDokument } from './lesen.ts';
import { zeilenStuecke, type ZeilenStueck } from './zeile.ts';

function klappeInnen(innen: string): string | null {
  if (innen === 'x' || innen === 'X') return ' ';
  if (innen === '' || innen === ' ') return 'x';
  return null;
}

function klappe(marker: string): string {
  const auf = marker.indexOf('[');
  const zu = auf < 0 ? -1 : marker.indexOf(']', auf + 1);
  if (auf < 0 || zu < 0) return marker;
  const neu = klappeInnen(marker.slice(auf + 1, zu));
  if (neu === null) return marker;
  return marker.slice(0, auf + 1) + neu + marker.slice(zu);
}

function imCode(belege: readonly Beleg[], index: number): boolean {
  return belege.some((beleg) => beleg.art === ART.codeblock && index >= beleg.ganzVon && index <= beleg.ganzBis);
}

function hakenAn(belege: readonly Beleg[], index: number): Beleg | null {
  let fund: Beleg | null = null;
  for (const beleg of belege) {
    if (beleg.art !== ART.haken) continue;
    const ende = beleg.folgeBis ?? beleg.bisZeile ?? beleg.ganzBis;
    if (index >= beleg.ganzVon && index <= ende) fund = beleg;
  }
  return fund;
}

function istHaken(text: string, index: number): boolean {
  const belege = leseDokument(text).belege;
  return !imCode(belege, index) && hakenAn(belege, index) !== null;
}

function zeileAn(stuecke: readonly ZeilenStueck[], index: number): ZeilenStueck | null {
  for (const stueck of stuecke) {
    if (index >= stueck.von && index <= stueck.bis) return stueck;
  }
  return null;
}

function rohBis(zeile: ZeilenStueck): number {
  return zeile.von + zeile.zeile.length;
}

function ersetzeZeile(text: string, zeile: ZeilenStueck, neu: string): string {
  return text.slice(0, zeile.von) + neu + text.slice(rohBis(zeile));
}

function freieZeile(text: string, zeile: ZeilenStueck): string | null {
  if (!zeile.zeile.startsWith('[ ]') && !zeile.zeile.startsWith('[X]')) return null;
  const probe = ersetzeZeile(text, zeile, `[x]${zeile.zeile.slice(3)}`);
  if (!istHaken(probe, zeile.von)) return null;
  const geklappt = klappe(zeile.zeile.slice(0, 3)) + zeile.zeile.slice(3);
  return geklappt === zeile.zeile ? null : ersetzeZeile(text, zeile, geklappt);
}

export function schalteKasten(text: string, index: number): string {
  if (!Number.isFinite(index)) return text;
  const stelle = Math.max(0, Math.min(Math.floor(index), text.length));
  const belege = leseDokument(text).belege;
  if (imCode(belege, stelle)) return text;
  const beleg = hakenAn(belege, stelle);
  if (beleg && beleg.von > beleg.ganzVon) {
    const marker = text.slice(beleg.ganzVon, beleg.von);
    const neu = klappe(marker);
    if (neu === marker) return text;
    return text.slice(0, beleg.ganzVon) + neu + text.slice(beleg.von);
  }
  const zeile = zeileAn(zeilenStuecke(text), stelle);
  if (!zeile) return text;
  return freieZeile(text, zeile) ?? text;
}
