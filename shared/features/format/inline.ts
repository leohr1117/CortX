import { ART, type Beleg, type LeseTeil } from './baum.ts';
import {
  CODE_INLINE,
  FETT_MARKER,
  FETT_UNTER,
  KURSIV_MARKER,
  KURSIV_UNTER,
  STREICH_MARKER,
  WICHTIG_INLINE,
} from './zeile.ts';

const ESCAPE = new Set(['\\', '`', '*', '_', '~', '[', ']', '!']);

export const FLUCHTZEICHEN: ReadonlySet<string> = ESCAPE;

interface Fund {
  art: typeof ART.code | typeof ART.link | typeof ART.fett | typeof ART.kursiv | typeof ART.streich | typeof ART.wichtig;
  von: number;
  bis: number;
  innenVon: number;
  innenBis: number;
  marker: Array<[number, number]>;
  ziel?: string;
}

function wortZeichen(zeichen: string): boolean {
  return /[\p{L}\p{N}]/u.test(zeichen);
}

function haengeText(teile: LeseTeil[], text: string): void {
  if (text.length === 0) return;
  const letzte = teile[teile.length - 1];
  if (letzte?.art === ART.text) {
    letzte.text += text;
    return;
  }
  teile.push({ art: ART.text, text });
}

function sucheCode(zeile: string, i: number): Fund | null {
  let lang = 0;
  while (zeile[i + lang] === CODE_INLINE) lang += 1;
  if (lang === 0) return null;
  const ab = i + lang;
  let j = ab;
  while (j < zeile.length) {
    if (zeile[j] !== CODE_INLINE) {
      j += 1;
      continue;
    }
    let z = 0;
    while (zeile[j + z] === CODE_INLINE) z += 1;
    if (z === lang && j > ab) {
      return {
        art: ART.code,
        von: i,
        bis: j + lang,
        innenVon: ab,
        innenBis: j,
        marker: [
          [i, ab],
          [j, j + lang],
        ],
      };
    }
    j += Math.max(z, 1);
  }
  return null;
}

function sucheLink(zeile: string, i: number): Fund | null {
  const klammer = zeile.indexOf('](', i + 1);
  if (klammer < 0 || klammer === i + 1) return null;
  const ende = zeile.indexOf(')', klammer + 2);
  if (ende < 0) return null;
  const ziel = zeile.slice(klammer + 2, ende);
  if (ziel.length === 0 || /[\s<>"']/.test(ziel) || /[\u0000-\u001f\u007f]/.test(ziel)) return null;
  return {
    art: ART.link,
    von: i,
    bis: ende + 1,
    innenVon: i + 1,
    innenBis: klammer,
    marker: [
      [i, i + 1],
      [klammer, ende + 1],
    ],
    ziel,
  };
}

function laufUm(zeile: string, index: number, zeichen: string): { start: number; laenge: number } {
  let start = index;
  while (start > 0 && zeile[start - 1] === zeichen) start -= 1;
  let laenge = 0;
  while (zeile[start + laenge] === zeichen) laenge += 1;
  return { start, laenge };
}

function sucheNaeher(zeile: string, ab: number, marker: string, offenBei: number): number | null {
  const zeichen = marker[0] ?? '';
  let j = ab;
  while (j < zeile.length) {
    const bei = zeile.indexOf(marker, j);
    if (bei < 0) return null;
    if (bei === ab) {
      j = bei + 1;
      continue;
    }
    if ((marker === '*' || marker === '_') && (zeile[bei - 1] === marker || zeile[bei + 1] === marker)) {
      j = bei + 1;
      continue;
    }
    const nach = bei + marker.length;
    if (zeichen === '_' && nach < zeile.length && wortZeichen(zeile[nach] ?? '')) {
      j = bei + 1;
      continue;
    }
    if (marker.length === 2 && (zeichen === '*' || zeichen === '_')) {
      const offen = laufUm(zeile, offenBei, zeichen);
      const zu = laufUm(zeile, bei, zeichen);
      if (zu.start === offen.start) {
        j = zu.start + zu.laenge;
        continue;
      }
      if (offen.laenge >= 3 && zu.laenge >= 3) {
        const ende = zu.start + zu.laenge - 2;
        const nachEnde = ende + marker.length;
        if (zeichen === '_' && nachEnde < zeile.length && wortZeichen(zeile[nachEnde] ?? '')) {
          j = zu.start + zu.laenge;
          continue;
        }
        if (ende >= ab) return ende;
      }
    }
    return bei;
  }
  return null;
}

function suchePaar(zeile: string, i: number, marker: string, art: Fund['art']): Fund | 'sprung' | null {
  if (!zeile.startsWith(marker, i)) return null;
  if (marker[0] === '_' && i > 0 && wortZeichen(zeile[i - 1] ?? '')) return null;
  const zu = sucheNaeher(zeile, i + marker.length, marker, i);
  if (zu === null) return marker.length > 1 ? 'sprung' : null;
  return {
    art,
    von: i,
    bis: zu + marker.length,
    innenVon: i + marker.length,
    innenBis: zu,
    marker: [
      [i, i + marker.length],
      [zu, zu + marker.length],
    ],
  };
}

function versuch(zeile: string, i: number, inLink: boolean): Fund | 'sprung' | null {
  const zeichen = zeile[i];
  if (zeichen === CODE_INLINE) return sucheCode(zeile, i);
  if (zeichen === '[' && zeile[i - 1] !== '!' && !inLink) return sucheLink(zeile, i);
  if (zeile.startsWith(STREICH_MARKER, i)) return suchePaar(zeile, i, STREICH_MARKER, ART.streich);
  if (zeile.startsWith(FETT_MARKER, i)) return suchePaar(zeile, i, FETT_MARKER, ART.fett);
  if (zeile.startsWith(FETT_UNTER, i)) return suchePaar(zeile, i, FETT_UNTER, ART.fett);
  if (zeichen === KURSIV_MARKER) return suchePaar(zeile, i, KURSIV_MARKER, ART.kursiv);
  if (zeichen === KURSIV_UNTER) return suchePaar(zeile, i, KURSIV_UNTER, ART.kursiv);
  return null;
}

function belegAbsolut(basis: number, fund: Fund): Beleg {
  const beleg: Beleg = {
    art: fund.art,
    von: basis + fund.innenVon,
    bis: basis + fund.innenBis,
    ganzVon: basis + fund.von,
    ganzBis: basis + fund.bis,
    marker: fund.marker.map(([von, bis]) => [basis + von, basis + bis]),
  };
  if (fund.ziel !== undefined) beleg.ziel = fund.ziel;
  return beleg;
}

function zeichenLeer(zeichen: string | undefined): boolean {
  return zeichen === undefined || /\s/u.test(zeichen);
}

function zeichenSatz(zeichen: string | undefined): boolean {
  return zeichen !== undefined && /\p{P}/u.test(zeichen);
}

function davorVon(zeile: string, i: number, vorher: string): string | undefined {
  if (i > 0) return zeile[i - 1];
  if (vorher === '' || vorher === '\n') return undefined;
  return vorher;
}

function kannOeffnen(zeile: string, i: number, vorher: string): boolean {
  const nach = zeile[i + WICHTIG_INLINE.length];
  if (nach === '[' || zeichenLeer(nach)) return false;
  const davor = davorVon(zeile, i, vorher);
  if (davor === undefined || /\s/u.test(davor)) return true;
  return davor === '(';
}

function kannSchliessen(zeile: string, i: number, vorher: string): boolean {
  const davor = davorVon(zeile, i, vorher);
  if (zeichenLeer(davor)) return false;
  if (!zeichenSatz(davor)) return true;
  const nach = zeile[i + WICHTIG_INLINE.length];
  return zeichenLeer(nach) || zeichenSatz(nach);
}

function entwertet(zeile: string, index: number): boolean {
  let anzahl = 0;
  for (let k = index - 1; k >= 0 && zeile[k] === '\\'; k -= 1) anzahl += 1;
  return anzahl % 2 === 1;
}

function wichtigPaare(zeile: string, vorher: string): Map<number, number> {
  const laeufe: Array<{ index: number; oeffnen: boolean; schliessen: boolean }> = [];
  let i = 0;
  while (i < zeile.length) {
    if (zeile[i] === '\\' && ESCAPE.has(zeile[i + 1] ?? '')) {
      i += 2;
      continue;
    }
    if (zeile[i] === CODE_INLINE) {
      const code = sucheCode(zeile, i);
      if (code) {
        i = code.bis;
        continue;
      }
    }
    if (zeile.startsWith(WICHTIG_INLINE, i) && zeile[i + WICHTIG_INLINE.length] !== '[' && !entwertet(zeile, i)) {
      laeufe.push({
        index: i,
        oeffnen: kannOeffnen(zeile, i, vorher),
        schliessen: kannSchliessen(zeile, i, vorher),
      });
      i += WICHTIG_INLINE.length;
      continue;
    }
    i += 1;
  }
  const stapel: Array<{ index: number }> = [];
  const paare = new Map<number, number>();
  for (const lauf of laeufe) {
    let getroffen = false;
    if (lauf.schliessen) {
      for (let k = stapel.length - 1; k >= 0; k -= 1) {
        const auf = stapel[k];
        if (!auf || auf.index + WICHTIG_INLINE.length >= lauf.index) continue;
        stapel.splice(k);
        paare.set(auf.index, lauf.index);
        getroffen = true;
        break;
      }
    }
    if (!getroffen && lauf.oeffnen) stapel.push({ index: lauf.index });
  }
  return paare;
}

function alsSchrift(art: typeof ART.fett | typeof ART.kursiv | typeof ART.streich | typeof ART.wichtig, teile: LeseTeil[]): LeseTeil {
  const inhalt = teile.length > 0 ? teile : [{ art: ART.text, text: '' }];
  const schlicht = teile.length === 1 && teile[0]?.art === ART.text ? teile[0].text : null;
  if (schlicht !== null) {
    if (art === ART.fett) return { art, text: schlicht };
    if (art === ART.kursiv) return { art, text: schlicht };
    if (art === ART.streich) return { art, text: schlicht };
    return { art, text: schlicht };
  }
  if (art === ART.fett) return { art, teile: inhalt };
  if (art === ART.kursiv) return { art, teile: inhalt };
  if (art === ART.streich) return { art, teile: inhalt };
  return { art, teile: inhalt };
}

export function leseInline(
  zeile: string,
  basis: number,
  inLink = false,
  vorher = '\n',
): { teile: LeseTeil[]; belege: Beleg[] } {
  const teile: LeseTeil[] = [];
  const belege: Beleg[] = [];
  const paare = wichtigPaare(zeile, vorher);
  let i = 0;
  while (i < zeile.length) {
    if (zeile[i] === '\\' && ESCAPE.has(zeile[i + 1] ?? '')) {
      haengeText(teile, zeile[i + 1] ?? '');
      i += 2;
      continue;
    }
    const zu = paare.get(i);
    if (zu !== undefined) {
      const innenVon = i + WICHTIG_INLINE.length;
      const fund: Fund = {
        art: ART.wichtig,
        von: i,
        bis: zu + WICHTIG_INLINE.length,
        innenVon,
        innenBis: zu,
        marker: [
          [i, innenVon],
          [zu, zu + WICHTIG_INLINE.length],
        ],
      };
      const innen = zeile.slice(innenVon, zu);
      const schrift = leseInline(innen, basis + innenVon, inLink, '\n');
      teile.push(alsSchrift(ART.wichtig, schrift.teile));
      belege.push(belegAbsolut(basis, fund), ...schrift.belege);
      i = fund.bis;
      continue;
    }
    const fund = versuch(zeile, i, inLink);
    if (fund === 'sprung' || fund === null) {
      haengeText(teile, zeile[i] ?? '');
      i += 1;
      continue;
    }
    if (fund.bis <= i) {
      haengeText(teile, zeile[i] ?? '');
      i += 1;
      continue;
    }
    const innen = zeile.slice(fund.innenVon, fund.innenBis);
    if (fund.art === ART.code) {
      teile.push({ art: ART.code, text: innen });
      belege.push(belegAbsolut(basis, fund));
    } else if (fund.art === ART.link) {
      const label = leseInline(innen, basis + fund.innenVon, true, zeile[fund.innenVon - 1] ?? '\n');
      const inhalt = label.teile.length > 0 ? label.teile : [{ art: ART.text, text: '' }];
      teile.push({ art: ART.link, teile: inhalt, ziel: fund.ziel ?? '' });
      belege.push(belegAbsolut(basis, fund), ...label.belege);
    } else {
      const schrift = leseInline(innen, basis + fund.innenVon, inLink, '\n');
      teile.push(alsSchrift(fund.art, schrift.teile));
      belege.push(belegAbsolut(basis, fund), ...schrift.belege);
    }
    i = fund.bis;
  }
  return { teile, belege };
}
