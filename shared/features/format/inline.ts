import type { Beleg, LeseTeil } from './baum.ts';
import { WICHTIG_INLINE } from './zeile.ts';

const ESCAPE = new Set(['\\', '`', '*', '_', '~', '[', ']', '!']);

interface Fund {
  art: 'code' | 'link' | 'fett' | 'kursiv' | 'streich' | 'wichtig';
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
  if (letzte?.art === 'text') {
    letzte.text += text;
    return;
  }
  teile.push({ art: 'text', text });
}

function sucheCode(zeile: string, i: number): Fund | null {
  let lang = 0;
  while (zeile[i + lang] === '`') lang += 1;
  if (lang === 0) return null;
  const ab = i + lang;
  let j = ab;
  while (j < zeile.length) {
    if (zeile[j] !== '`') {
      j += 1;
      continue;
    }
    let z = 0;
    while (zeile[j + z] === '`') z += 1;
    if (z === lang && j > ab) {
      return {
        art: 'code',
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
    art: 'link',
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

function sucheNaeher(zeile: string, ab: number, marker: string): number | null {
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
    if (marker[0] === '_' && nach < zeile.length && wortZeichen(zeile[nach] ?? '')) {
      j = bei + 1;
      continue;
    }
    return bei;
  }
  return null;
}

function suchePaar(zeile: string, i: number, marker: string, art: Fund['art']): Fund | 'sprung' | null {
  if (!zeile.startsWith(marker, i)) return null;
  if (marker[0] === '_' && i > 0 && wortZeichen(zeile[i - 1] ?? '')) return null;
  const zu = sucheNaeher(zeile, i + marker.length, marker);
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
  if (zeichen === '`') return sucheCode(zeile, i);
  if (zeichen === '[' && zeile[i - 1] !== '!' && !inLink) return sucheLink(zeile, i);
  if (zeile.startsWith('~~', i)) return suchePaar(zeile, i, '~~', 'streich');
  if (zeile.startsWith('**', i)) return suchePaar(zeile, i, '**', 'fett');
  if (zeile.startsWith('__', i)) return suchePaar(zeile, i, '__', 'fett');
  if (zeichen === '*') return suchePaar(zeile, i, '*', 'kursiv');
  if (zeichen === '_') return suchePaar(zeile, i, '_', 'kursiv');
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
    if (zeile[i] === '`') {
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

function alsSchrift(art: 'fett' | 'kursiv' | 'streich' | 'wichtig', teile: LeseTeil[]): LeseTeil {
  const inhalt = teile.length > 0 ? teile : [{ art: 'text' as const, text: '' }];
  const schlicht = teile.length === 1 && teile[0]?.art === 'text' ? teile[0].text : null;
  if (schlicht !== null) {
    if (art === 'fett') return { art, text: schlicht };
    if (art === 'kursiv') return { art, text: schlicht };
    if (art === 'streich') return { art, text: schlicht };
    return { art, text: schlicht };
  }
  if (art === 'fett') return { art, teile: inhalt };
  if (art === 'kursiv') return { art, teile: inhalt };
  if (art === 'streich') return { art, teile: inhalt };
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
        art: 'wichtig',
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
      const schrift = leseInline(innen, basis + innenVon, inLink, zeile[innenVon - 1] ?? '\n');
      teile.push(alsSchrift('wichtig', schrift.teile));
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
    if (fund.art === 'code') {
      teile.push({ art: 'code', text: innen });
      belege.push(belegAbsolut(basis, fund));
    } else if (fund.art === 'link') {
      const label = leseInline(innen, basis + fund.innenVon, true, zeile[fund.innenVon - 1] ?? '\n');
      const inhalt = label.teile.length > 0 ? label.teile : [{ art: 'text' as const, text: '' }];
      teile.push({ art: 'link', teile: inhalt, ziel: fund.ziel ?? '' });
      belege.push(belegAbsolut(basis, fund), ...label.belege);
    } else {
      const schrift = leseInline(innen, basis + fund.innenVon, inLink, zeile[fund.innenVon - 1] ?? '\n');
      teile.push(alsSchrift(fund.art, schrift.teile));
      belege.push(belegAbsolut(basis, fund), ...schrift.belege);
    }
    i = fund.bis;
  }
  return { teile, belege };
}
