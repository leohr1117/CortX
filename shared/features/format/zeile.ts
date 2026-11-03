export const UEBERSCHRIFT_MARKER = '= ';
const HASH = '#';
export const WICHTIG_INLINE = '!!';
export const FETT_MARKER = '**';
export const FETT_UNTER = '__';
export const KURSIV_MARKER = '*';
export const KURSIV_UNTER = '_';
export const STREICH_MARKER = '~~';
export const CODE_INLINE = '`';
const LISTEN_ZEICHEN = ['-', '*', '+'] as const;
export const LISTEN_EINFUEGEN = `${LISTEN_ZEICHEN[0]} `;

interface KopfMarke {
  stufe: number;
  laenge: number;
}

export function kopfZeichen(stufe: number): string {
  const ebene = Math.max(1, Math.min(6, Math.floor(stufe)));
  return `${HASH.repeat(ebene)} `;
}

export function kopfMarke(zeile: string): KopfMarke | null {
  if (zeile.startsWith(UEBERSCHRIFT_MARKER)) return { stufe: 0, laenge: UEBERSCHRIFT_MARKER.length };
  let hashes = 0;
  while (hashes < 6 && zeile[hashes] === HASH) hashes += 1;
  if (hashes === 0 || zeile[hashes] !== ' ') return null;
  return { stufe: hashes, laenge: hashes + 1 };
}
export const WICHTIG_ZEILE = `${WICHTIG_INLINE}${WICHTIG_INLINE} `;

export function wichtigZeile(zeile: string): boolean {
  return zeile.startsWith(WICHTIG_ZEILE);
}

export function ohneWagen(zeile: string): string {
  return zeile.endsWith('\r') ? zeile.slice(0, -1) : zeile;
}

interface HakenZeile {
  abgehakt: boolean;
  rest: string;
  laenge: number;
}

export function hakenVon(zeile: string): HakenZeile | null {
  if (zeile.startsWith('[x]')) {
    const leer = zeile.startsWith('[x] ') ? 1 : 0;
    return { abgehakt: true, rest: zeile.slice(3 + leer), laenge: 3 + leer };
  }
  if (zeile.startsWith('[]')) {
    const leer = zeile.startsWith('[] ') ? 1 : 0;
    return { abgehakt: false, rest: zeile.slice(2 + leer), laenge: 2 + leer };
  }
  const gfm = /^([-*+] \[)( |x)(\] ?)/.exec(zeile);
  if (!gfm) return null;
  return { abgehakt: gfm[2] === 'x', rest: zeile.slice(gfm[0].length), laenge: gfm[0].length };
}

export function listenLaenge(zeile: string): number {
  for (const zeichen of LISTEN_ZEICHEN) {
    if (zeile.startsWith(`${zeichen} `)) return 2;
  }
  return 0;
}

export function nummerLaenge(zeile: string): number {
  const fund = /^(\d{1,9})\. /.exec(zeile);
  return fund ? fund[0].length : 0;
}

export function zaunAuf(zeile: string): { zeichen: string; lang: number } | null {
  const fund = /^(```+|~~~+)/.exec(zeile);
  if (!fund?.[1]) return null;
  const zeichen = fund[1][0] ?? '';
  const rest = zeile.slice(fund[1].length);
  if (zeichen === '`' && rest.includes('`')) return null;
  if (zeichen === '~' && rest.includes('~')) return null;
  return { zeichen, lang: fund[1].length };
}

export function zaunZu(zeile: string, zeichen: string, lang: number): boolean {
  return new RegExp(`^${zeichen === '`' ? '`' : '~'}{${lang},}[ \\t]*$`).test(zeile);
}

export interface ZeilenStueck {
  zeile: string;
  von: number;
  bis: number;
  nach: number;
}

export function zeilenStuecke(text: string): ZeilenStueck[] {
  const teile = text.split('\n');
  const aus: ZeilenStueck[] = [];
  let offset = 0;
  for (let i = 0; i < teile.length; i += 1) {
    const roh = teile[i] ?? '';
    const bis = offset + roh.length;
    const nach = i < teile.length - 1 ? bis + 1 : bis;
    aus.push({ zeile: ohneWagen(roh), von: offset, bis, nach });
    offset = nach;
  }
  return aus;
}
