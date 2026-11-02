import { TOPIC_NAME_MAX } from '../../kern/grenzen.ts';

export const PFAD_PRAEFIX = '#';
export const PFAD_TRENNER = '/';
export const EBENEN = ['thema', 'seite', 'abschnitt'] as const;
export type PfadEbene = (typeof EBENEN)[number];

const NAME = /^[\p{L}\p{N}][\p{L}\p{N}_'-]*/u;
const NAMENSZEICHEN = /[\p{L}\p{N}_'-]/u;

export interface ZielZeile {
  pfad: string;
  rest: string;
}

export interface RohTeil {
  pfad: string | null;
  text: string;
}

export function istNamenszeichen(zeichen: string): boolean {
  return NAMENSZEICHEN.test(zeichen);
}

export function hashIstAnfang(text: string, index: number): boolean {
  if (text[index] !== PFAD_PRAEFIX) return false;
  if (index === 0) return true;
  const davor = text[index - 1] ?? '';
  return !istNamenszeichen(davor);
}

export function liesPfadName(rest: string): string | null {
  const erstes = rest.match(NAME)?.[0];
  if (!erstes) return null;
  let name = erstes.slice(0, TOPIC_NAME_MAX);
  let pos = name.length;
  if (erstes.length > name.length) return name;
  while (rest[pos] === PFAD_TRENNER) {
    name += PFAD_TRENNER;
    pos += PFAD_TRENNER.length;
    if (rest[pos] === PFAD_TRENNER) continue;
    const weiter = rest.slice(pos).match(NAME)?.[0];
    if (!weiter) break;
    const capped = weiter.slice(0, TOPIC_NAME_MAX);
    name += capped;
    pos += capped.length;
    if (weiter.length > capped.length) break;
  }
  return name;
}

export function liesZielzeile(zeile: string): ZielZeile | null {
  if (!zeile.startsWith(PFAD_PRAEFIX)) return null;
  const name = liesPfadName(zeile.slice(PFAD_PRAEFIX.length));
  if (!name) return null;
  const danach = zeile.slice(PFAD_PRAEFIX.length + name.length);
  if (danach.length > 0 && !/^\s/u.test(danach)) return null;
  return { pfad: name, rest: danach.replace(/^\s+/u, '') };
}

function zeilenVon(roh: string): string[] {
  return roh.split('\n').map((zeile) => (zeile.endsWith('\r') ? zeile.slice(0, -1) : zeile));
}

export function zerlegeZielzeilen(roh: string): RohTeil[] | null {
  if (roh.trim().length === 0) return null;
  const teile: Array<{ pfad: string | null; zeilen: string[] }> = [];
  let aktuell: { pfad: string | null; zeilen: string[] } | null = null;
  for (const zeile of zeilenVon(roh)) {
    const ziel = liesZielzeile(zeile);
    if (ziel) {
      aktuell = { pfad: ziel.pfad, zeilen: ziel.rest.length > 0 ? [ziel.rest] : [] };
      teile.push(aktuell);
      continue;
    }
    if (!aktuell) {
      aktuell = { pfad: null, zeilen: [] };
      teile.push(aktuell);
    }
    aktuell.zeilen.push(zeile);
  }
  const aus = teile
    .map((teil) => ({ pfad: teil.pfad, text: teil.zeilen.join('\n').trim() }))
    .filter((teil) => teil.pfad !== null || teil.text.length > 0);
  return aus.length === 0 ? null : aus;
}
