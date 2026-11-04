import { ART, type Beleg, type BelegArt, type Dokument, type LeseBlock, type LeseHakenPunkt, type LeseListe, type LeseTeil } from './baum.ts';
import { leseInline } from './inline.ts';
import { nummerLauf, type NummerZeile } from './nummer.ts';
import {
  WICHTIG_ZEILE,
  hakenVon,
  kopfMarke,
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
  LeseBlock,
  LeseHakenPunkt,
  LeseLinkTeil,
  LeseTeil,
} from './baum.ts';
export { ART, EBENE } from './baum.ts';

function struktur(
  art: BelegArt,
  stueck: ZeilenStueck,
  laenge: number,
  extra?: { abgehakt?: boolean; zahl?: string; stufe?: number; listenLaenge?: number; nummerArt?: NummerZeile['art']; wert?: number },
): Beleg {
  const ganzBis = stueck.von + stueck.zeile.length;
  const beleg: Beleg = {
    art,
    von: stueck.von + laenge,
    bis: ganzBis,
    ganzVon: stueck.von,
    ganzBis,
    bisZeile: stueck.bis,
    marker: laenge > 0 ? [[stueck.von, stueck.von + laenge]] : [],
  };
  if (extra?.abgehakt !== undefined) beleg.abgehakt = extra.abgehakt;
  if (extra?.zahl !== undefined) beleg.zahl = extra.zahl;
  if (extra?.stufe !== undefined) beleg.stufe = extra.stufe;
  if (extra?.listenLaenge) beleg.listenLaenge = extra.listenLaenge;
  if (extra?.nummerArt !== undefined) beleg.nummerArt = extra.nummerArt;
  if (extra?.wert !== undefined) beleg.wert = extra.wert;
  return beleg;
}

function klasseAn(stueck: ZeilenStueck, nummer: NummerZeile | null): Beleg | null {
  const basis = klassifiziere(stueck);
  if (!nummer || (basis && basis.art !== ART.nummer)) return basis;
  return struktur(ART.nummer, stueck, nummer.laenge, {
    zahl: nummer.zeichen,
    nummerArt: nummer.art,
    wert: nummer.nummer,
  });
}

function klassifiziere(stueck: ZeilenStueck): Beleg | null {
  const kopf = kopfMarke(stueck.zeile);
  if (kopf) {
    const extra = kopf.stufe > 0 ? { stufe: kopf.stufe } : undefined;
    return struktur(ART.ueberschrift, stueck, kopf.laenge, extra);
  }
  if (wichtigZeile(stueck.zeile)) return struktur(ART.wichtig, stueck, WICHTIG_ZEILE.length);
  const kasten = hakenVon(stueck.zeile);
  if (kasten) {
    return struktur(ART.haken, stueck, kasten.laenge, {
      abgehakt: kasten.abgehakt,
      listenLaenge: listenLaenge(stueck.zeile),
    });
  }
  const liste = listenLaenge(stueck.zeile);
  if (liste > 0) return struktur(ART.liste, stueck, liste);
  const nummer = nummerLaenge(stueck.zeile);
  if (nummer > 0) return struktur(ART.nummer, stueck, nummer, { zahl: stueck.zeile.slice(0, nummer - 2) });
  return null;
}

function besonders(stueck: ZeilenStueck, nummer: NummerZeile | null = null): boolean {
  return zaunAuf(stueck.zeile) !== null || klasseAn(stueck, nummer) !== null;
}

function zeileInline(stueck: ZeilenStueck, laenge: number): { teile: LeseTeil[]; belege: Beleg[] } {
  const vorher = laenge === 0 ? '\n' : (stueck.zeile[laenge - 1] ?? '\n');
  return leseInline(stueck.zeile.slice(laenge), stueck.von + laenge, false, vorher);
}

function codeText(roh: string): string {
  const ohne = roh.replaceAll('\r', '');
  return ohne.endsWith('\n') ? ohne.slice(0, -1) : ohne;
}

function innenBelege(stuecke: readonly ZeilenStueck[], von: number, bis: number): Beleg[] {
  const innen: Beleg[] = [];
  for (let k = von; k < bis; k += 1) {
    const fund = klassifiziere(stuecke[k]!);
    if (fund) innen.push(fund);
  }
  return innen;
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
  const beleg: Beleg = {
    art: ART.codeblock,
    von: inhaltVon,
    bis: inhaltBis,
    ganzVon: auf.von,
    ganzBis,
    marker,
  };
  const innen = innenBelege(stuecke, index + 1, zu ? j : stuecke.length);
  if (innen.length > 0) beleg.innen = innen;
  return {
    block: { art: ART.codeblock, text: codeText(text.slice(inhaltVon, inhaltBis)) },
    belege: [beleg],
    naechst: zu ? j + 1 : stuecke.length,
  };
}

function laengeVon(beleg: Beleg): number {
  return beleg.von - beleg.ganzVon;
}

function zeileGehtWeiter(zeile: string, tiefe: number): boolean {
  if (tiefe < 1 || zeile.length < tiefe) return false;
  for (let i = 0; i < tiefe; i += 1) {
    if (zeile[i] !== ' ') return false;
  }
  return true;
}

function haengeFort(
  stuecke: readonly ZeilenStueck[],
  index: number,
  beleg: Beleg,
  teile: LeseTeil[],
  ziel: Beleg[],
): number {
  const tiefe = laengeVon(beleg);
  let i = index;
  let folge = beleg.bisZeile ?? beleg.ganzBis;
  while (i < stuecke.length && zeileGehtWeiter(stuecke[i]!.zeile, tiefe)) {
    const zeile = stuecke[i]!;
    const inline = zeileInline(zeile, tiefe);
    teile.push({ art: ART.text, text: '\n' }, ...inline.teile);
    ziel.push(...inline.belege);
    folge = zeile.bis;
    i += 1;
  }
  if (i > index) beleg.folgeBis = folge;
  return i;
}

export function leseDokument(text: string, arten = false): Dokument {
  if (text.length === 0) return { bloecke: [], belege: [] };
  const stuecke = zeilenStuecke(text);
  const nummern = new Map<number, NummerZeile>();
  if (arten) {
    nummerLauf(stuecke.map((stueck) => stueck.zeile)).forEach((zeile, index) => {
      if (zeile) nummern.set(stuecke[index]!.von, zeile);
    });
  }
  const klasseVon = (stueck: ZeilenStueck) => klasseAn(stueck, nummern.get(stueck.von) ?? null);
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
    const klasse = klasseVon(stueck);
    if (klasse?.art === ART.ueberschrift) {
      const inline = zeileInline(stueck, laengeVon(klasse));
      bloecke.push(
        klasse.stufe !== undefined
          ? { art: ART.ueberschrift, teile: inline.teile, stufe: klasse.stufe }
          : { art: ART.ueberschrift, teile: inline.teile },
      );
      belege.push(klasse, ...inline.belege);
      i += 1;
      continue;
    }
    if (klasse?.art === ART.wichtig) {
      const inline = zeileInline(stueck, laengeVon(klasse));
      bloecke.push({ art: ART.wichtig, teile: inline.teile });
      belege.push(klasse, ...inline.belege);
      i += 1;
      continue;
    }
    if (klasse?.art === ART.haken) {
      const punkte: LeseHakenPunkt[] = [];
      while (i < stuecke.length) {
        const zeile = stuecke[i]!;
        const haken = klasseVon(zeile);
        if (haken?.art !== ART.haken) break;
        const inline = zeileInline(zeile, laengeVon(haken));
        punkte.push({ abgehakt: haken.abgehakt === true, teile: inline.teile });
        belege.push(haken, ...inline.belege);
        i += 1;
        i = haengeFort(stuecke, i, haken, inline.teile, belege);
      }
      bloecke.push({ art: ART.haken, punkte });
      continue;
    }
    if (klasse?.art === ART.liste || klasse?.art === ART.nummer) {
      const geordnet = klasse.art === ART.nummer;
      const schrift = klasse.nummerArt;
      const punkte: LeseTeil[][] = [];
      while (i < stuecke.length) {
        const zeile = stuecke[i]!;
        const eintrag = klasseVon(zeile);
        if (!eintrag || (geordnet ? eintrag.art !== ART.nummer : eintrag.art !== ART.liste)) break;
        if (geordnet && eintrag.nummerArt !== schrift) break;
        const inline = zeileInline(zeile, laengeVon(eintrag));
        punkte.push(inline.teile);
        belege.push(eintrag, ...inline.belege);
        i += 1;
        if (!geordnet) i = haengeFort(stuecke, i, eintrag, inline.teile, belege);
      }
      const block: LeseListe = geordnet
        ? schrift
          ? { art: ART.liste, punkte, geordnet: true, schrift }
          : { art: ART.liste, punkte, geordnet: true }
        : { art: ART.liste, punkte };
      bloecke.push(block);
      continue;
    }
    const zeilen: LeseTeil[][] = [];
    while (i < stuecke.length && !besonders(stuecke[i]!, nummern.get(stuecke[i]!.von) ?? null)) {
      const zeile = stuecke[i]!;
      const inline = zeileInline(zeile, 0);
      zeilen.push(inline.teile);
      belege.push(...inline.belege);
      i += 1;
    }
    bloecke.push({ art: ART.absatz, zeilen });
  }
  return { bloecke, belege };
}

function mitInnen(liste: readonly Beleg[]): Beleg[] {
  const aus: Beleg[] = [];
  for (const beleg of liste) {
    aus.push(beleg);
    if (beleg.innen) aus.push(...beleg.innen);
  }
  return aus;
}

export function zeilenTreffer(text: string, index: number, passend: (beleg: Beleg) => boolean): Beleg | null {
  const stelle = Number.isFinite(index) ? Math.floor(index) : 0;
  const sicher = Math.max(0, Math.min(stelle, text.length));
  for (const beleg of mitInnen(leseDokument(text).belege)) {
    if (!passend(beleg)) continue;
    const ende = beleg.bisZeile ?? beleg.ganzBis;
    if (sicher >= beleg.ganzVon && sicher <= ende) return beleg;
  }
  return null;
}

export function leseBaum(text: string, arten = false): LeseBlock[] {
  return leseDokument(text, arten).bloecke;
}

export function belege(text: string): Beleg[] {
  return leseDokument(text).belege;
}
