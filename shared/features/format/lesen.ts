import type { Beleg, BelegArt, Dokument, LeseBlock, LeseHakenPunkt, LeseListe, LeseTeil } from './baum.ts';
import { leseInline } from './inline.ts';
import {
  UEBERSCHRIFT_MARKER,
  WICHTIG_ZEILE,
  hakenVon,
  listenLaenge,
  nummerLaenge,
  wichtigZeile,
  zaunAuf,
  zaunZu,
  zeilenStuecke,
  type ZeilenStueck,
} from './zeile.ts';

export type {
  Beleg,
  BelegArt,
  Dokument,
  LeseAbsatz,
  LeseBlock,
  LeseCodeBlock,
  LeseCodeTeil,
  LeseFettTeil,
  LeseHaken,
  LeseHakenPunkt,
  LeseKursivTeil,
  LeseLinkTeil,
  LeseListe,
  LeseStreichTeil,
  LeseTeil,
  LeseTextTeil,
  LeseUeberschrift,
  LeseVerschachtelt,
  LeseWichtig,
  LeseWichtigTeil,
} from './baum.ts';
export { UEBERSCHRIFT_MARKER, WICHTIG_ZEILE } from './zeile.ts';

function besonders(zeile: string): boolean {
  return (
    zaunAuf(zeile) !== null ||
    zeile.startsWith(UEBERSCHRIFT_MARKER) ||
    wichtigZeile(zeile) ||
    hakenVon(zeile) !== null ||
    listenLaenge(zeile) > 0 ||
    nummerLaenge(zeile) > 0
  );
}

function struktur(
  art: BelegArt,
  stueck: ZeilenStueck,
  laenge: number,
  extra?: { abgehakt?: boolean; zahl?: string },
): Beleg {
  const ganzBis = stueck.von + stueck.zeile.length;
  const beleg: Beleg = {
    art,
    von: stueck.von + laenge,
    bis: ganzBis,
    ganzVon: stueck.von,
    ganzBis,
    marker: laenge > 0 ? [[stueck.von, stueck.von + laenge]] : [],
  };
  if (extra?.abgehakt !== undefined) beleg.abgehakt = extra.abgehakt;
  if (extra?.zahl !== undefined) beleg.zahl = extra.zahl;
  return beleg;
}

function zeileInline(stueck: ZeilenStueck, laenge: number): { teile: LeseTeil[]; belege: Beleg[] } {
  const vorher = laenge === 0 ? '\n' : (stueck.zeile[laenge - 1] ?? '\n');
  return leseInline(stueck.zeile.slice(laenge), stueck.von + laenge, false, vorher);
}

function codeText(roh: string): string {
  const ohne = roh.replaceAll('\r', '');
  return ohne.endsWith('\n') ? ohne.slice(0, -1) : ohne;
}

function liesZaun(
  text: string,
  stuecke: readonly ZeilenStueck[],
  index: number,
  zeichen: string,
  lang: number,
): { block: LeseBlock; belege: Beleg[]; naechst: number } {
  const auf = stuecke[index]!;
  let zu: ZeilenStueck | null = null;
  let j = index + 1;
  while (j < stuecke.length) {
    if (zaunZu(stuecke[j]!.zeile, zeichen, lang)) {
      zu = stuecke[j]!;
      break;
    }
    j += 1;
  }
  const inhaltVon = auf.nach;
  const inhaltBis = zu ? zu.von : text.length;
  const marker: Array<[number, number]> = [[auf.von, auf.von + auf.zeile.length]];
  let ganzBis = auf.von + auf.zeile.length;
  if (zu) {
    marker.push([zu.von, zu.von + zu.zeile.length]);
    ganzBis = zu.von + zu.zeile.length;
  } else if (text.length > ganzBis) {
    ganzBis = text.length;
  }
  return {
    block: { art: 'codeblock', text: codeText(text.slice(inhaltVon, inhaltBis)) },
    belege: [
      {
        art: 'codeblock',
        von: inhaltVon,
        bis: inhaltBis,
        ganzVon: auf.von,
        ganzBis,
        marker,
      },
    ],
    naechst: zu ? j + 1 : stuecke.length,
  };
}

export function leseDokument(text: string): Dokument {
  if (text.length === 0) return { bloecke: [], belege: [] };
  const stuecke = zeilenStuecke(text);
  const bloecke: LeseBlock[] = [];
  const belege: Beleg[] = [];
  let i = 0;
  while (i < stuecke.length) {
    const stueck = stuecke[i]!;
    const zaun = zaunAuf(stueck.zeile);
    if (zaun) {
      const fund = liesZaun(text, stuecke, i, zaun.zeichen, zaun.lang);
      bloecke.push(fund.block);
      belege.push(...fund.belege);
      i = fund.naechst;
      continue;
    }
    if (stueck.zeile.startsWith(UEBERSCHRIFT_MARKER)) {
      const inline = zeileInline(stueck, UEBERSCHRIFT_MARKER.length);
      bloecke.push({ art: 'ueberschrift', teile: inline.teile });
      belege.push(struktur('ueberschrift', stueck, UEBERSCHRIFT_MARKER.length), ...inline.belege);
      i += 1;
      continue;
    }
    if (wichtigZeile(stueck.zeile)) {
      const inline = zeileInline(stueck, WICHTIG_ZEILE.length);
      bloecke.push({ art: 'wichtig', teile: inline.teile });
      belege.push(struktur('wichtig', stueck, WICHTIG_ZEILE.length), ...inline.belege);
      i += 1;
      continue;
    }
    const kasten = hakenVon(stueck.zeile);
    if (kasten) {
      const punkte: LeseHakenPunkt[] = [];
      while (i < stuecke.length) {
        const zeile = stuecke[i]!;
        const haken = hakenVon(zeile.zeile);
        if (!haken) break;
        const inline = zeileInline(zeile, haken.laenge);
        punkte.push({ abgehakt: haken.abgehakt, teile: inline.teile });
        belege.push(struktur('haken', zeile, haken.laenge, { abgehakt: haken.abgehakt }), ...inline.belege);
        i += 1;
      }
      bloecke.push({ art: 'haken', punkte });
      continue;
    }
    const liste = listenLaenge(stueck.zeile);
    const nummer = nummerLaenge(stueck.zeile);
    if (liste > 0 || nummer > 0) {
      const geordnet = nummer > 0;
      const punkte: LeseTeil[][] = [];
      while (i < stuecke.length) {
        const zeile = stuecke[i]!;
        const laenge = geordnet ? nummerLaenge(zeile.zeile) : listenLaenge(zeile.zeile);
        if (laenge === 0) break;
        const inline = zeileInline(zeile, laenge);
        punkte.push(inline.teile);
        const extra = geordnet ? { zahl: zeile.zeile.slice(0, laenge - 2) } : undefined;
        belege.push(struktur(geordnet ? 'nummer' : 'liste', zeile, laenge, extra), ...inline.belege);
        i += 1;
      }
      const block: LeseListe = geordnet ? { art: 'liste', punkte, geordnet: true } : { art: 'liste', punkte };
      bloecke.push(block);
      continue;
    }
    const zeilen: LeseTeil[][] = [];
    while (i < stuecke.length && !besonders(stuecke[i]!.zeile)) {
      const zeile = stuecke[i]!;
      const inline = zeileInline(zeile, 0);
      zeilen.push(inline.teile);
      belege.push(...inline.belege);
      i += 1;
    }
    bloecke.push({ art: 'absatz', zeilen });
  }
  return { bloecke, belege };
}

export function leseBaum(text: string): LeseBlock[] {
  return leseDokument(text).bloecke;
}

export function belege(text: string): Beleg[] {
  return leseDokument(text).belege;
}
