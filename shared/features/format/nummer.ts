export const NUMMER_ART = {
  zahl: 'zahl',
  gross: 'gross',
  klein: 'klein',
  roemisch: 'roemisch',
  roemischKlein: 'roemischKlein',
} as const;

export type NummerArt = (typeof NUMMER_ART)[keyof typeof NUMMER_ART];

export interface NummerZeile {
  art: NummerArt;
  nummer: number;
  gelesen: number;
  laenge: number;
  zeichen: string;
}

const ARTEN: ReadonlySet<string> = new Set(Object.values(NUMMER_ART));
const ROEMISCH_STUFEN: readonly (readonly [number, string])[] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];
const ROEMISCH_MAX = 3999;
const ZAHL_MAX = 999_999_999;

function schreibeRoemisch(wert: number): string {
  let rest = wert;
  let aus = '';
  for (const [zahl, zeichen] of ROEMISCH_STUFEN) {
    while (rest >= zahl) {
      aus += zeichen;
      rest -= zahl;
    }
  }
  return aus;
}

const ROEMISCH = new Map<string, number>();
for (let wert = 1; wert <= ROEMISCH_MAX; wert += 1) ROEMISCH.set(schreibeRoemisch(wert), wert);

function schreibeAlpha(wert: number): string {
  let rest = wert;
  let aus = '';
  while (rest > 0) {
    rest -= 1;
    aus = String.fromCharCode(65 + (rest % 26)) + aus;
    rest = Math.floor(rest / 26);
  }
  return aus;
}

function einheit(token: string): boolean {
  return token === token.toUpperCase() || token === token.toLowerCase();
}

function wertRoemisch(token: string): number | null {
  if (!einheit(token)) return null;
  return ROEMISCH.get(token.toUpperCase()) ?? null;
}

function wertAlpha(token: string): number | null {
  if (!/^[A-Za-z]{1,2}$/.test(token) || !einheit(token)) return null;
  let wert = 0;
  for (const zeichen of token.toUpperCase()) wert = wert * 26 + (zeichen.charCodeAt(0) - 64);
  return wert;
}

export function istNummerArt(wert: string): wert is NummerArt {
  return ARTEN.has(wert);
}

export function schreibeNummer(art: string, wert: number): string {
  if (!istNummerArt(art) || !Number.isInteger(wert) || wert < 1) return '';
  if (art === NUMMER_ART.zahl) return wert <= ZAHL_MAX ? String(wert) : '';
  if (art === NUMMER_ART.roemisch || art === NUMMER_ART.roemischKlein) {
    if (wert > ROEMISCH_MAX) return '';
    const zeichen = schreibeRoemisch(wert);
    return art === NUMMER_ART.roemischKlein ? zeichen.toLowerCase() : zeichen;
  }
  const zeichen = schreibeAlpha(wert);
  return art === NUMMER_ART.klein ? zeichen.toLowerCase() : zeichen;
}

export function naechste(art: NummerArt, wert: number): string {
  return schreibeNummer(art, wert + 1);
}

export function nummeriere(art: NummerArt, start: number, anzahl: number): string[] {
  const aus: string[] = [];
  for (let i = 0; i < anzahl; i += 1) aus.push(`${schreibeNummer(art, start + i)}.`);
  return aus;
}

export function prefixNummer(art: string, wert: unknown): string | null {
  const zahl = typeof wert === 'number' ? wert : Number(wert);
  const zeichen = schreibeNummer(art, zahl);
  return zeichen === '' ? null : `${zeichen}. `;
}

function artVomStart(token: string): NummerArt | null {
  if (/^\d{1,9}$/.test(token)) return NUMMER_ART.zahl;
  if (wertRoemisch(token) !== null) {
    return token === token.toLowerCase() ? NUMMER_ART.roemischKlein : NUMMER_ART.roemisch;
  }
  if (wertAlpha(token) === null) return null;
  return token === token.toLowerCase() ? NUMMER_ART.klein : NUMMER_ART.gross;
}

function gelesenAls(art: NummerArt, token: string): number | null {
  if (art === NUMMER_ART.zahl) return /^\d{1,9}$/.test(token) ? Number(token) : null;
  if (art === NUMMER_ART.roemisch || art === NUMMER_ART.roemischKlein) {
    const passend = art === NUMMER_ART.roemisch ? token === token.toUpperCase() : token === token.toLowerCase();
    return passend ? wertRoemisch(token) : null;
  }
  const passend = art === NUMMER_ART.gross ? token === token.toUpperCase() : token === token.toLowerCase();
  return passend ? wertAlpha(token) : null;
}

function roh(zeile: string): { token: string; laenge: number } | null {
  const fund = /^(\d{1,9}|[A-Za-z]{1,2}|[IVXLCDMivxlcdm]{3,15})\. /.exec(zeile);
  if (!fund?.[1]) return null;
  const token = fund[1];
  if (artVomStart(token) === null) return null;
  return { token, laenge: fund[0].length };
}

export function erkenne(zeile: string): { art: NummerArt; gelesen: number; laenge: number } | null {
  const zeileLauf = nummerLauf([zeile])[0];
  if (!zeileLauf) return null;
  return { art: zeileLauf.art, gelesen: zeileLauf.gelesen, laenge: zeileLauf.laenge };
}

export function nummerLauf(zeilen: readonly string[]): Array<NummerZeile | null> {
  const aus: Array<NummerZeile | null> = new Array(zeilen.length).fill(null);
  let index = 0;
  while (index < zeilen.length) {
    const start = roh(zeilen[index] ?? '');
    const art = start ? artVomStart(start.token) : null;
    if (!start || !art) {
      index += 1;
      continue;
    }
    let nummer = 0;
    while (index < zeilen.length) {
      const marke = roh(zeilen[index] ?? '');
      if (!marke) break;
      const gelesen = gelesenAls(art, marke.token);
      if (gelesen === null) break;
      nummer += 1;
      aus[index] = { art, nummer, gelesen, laenge: marke.laenge, zeichen: marke.token };
      index += 1;
    }
  }
  return aus;
}
