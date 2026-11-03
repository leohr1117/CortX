import { INBOX_NAME, TOPIC_NAME_MAX } from '../../kern/grenzen.ts';
import { hinweisZusammen, TEXTE } from '../../kern/texte.ts';
import type { Thema } from '../../kern/modell.ts';
import { gleicherName } from '../tags/index.ts';
import { themaName } from './name.ts';

export type PflegeGrund =
  | 'empty'
  | 'invalid'
  | 'duplicate'
  | 'reserved'
  | 'locked'
  | 'missing'
  | 'unknown'
  | 'self';

type UmbenennPlan =
  | { ok: true; aktuell: string; name: string; geaendert: boolean }
  | { ok: false; grund: Exclude<PflegeGrund, 'unknown' | 'self'> };

type ZusammenPlan =
  | { ok: true; quelle: string; ziel: string }
  | { ok: false; grund: Exclude<PflegeGrund, 'empty' | 'duplicate'> };

type LoeschPlan = { ok: true; name: string } | { ok: false; grund: 'missing' | 'locked' };

function fund(namen: readonly string[], roh: string): string | null {
  const name = roh.trim();
  if (name.length === 0 || name.length > TOPIC_NAME_MAX) return null;
  return namen.find((eintrag) => gleicherName(eintrag, name)) ?? null;
}

export function pflegeMeldung(grund: PflegeGrund): string {
  switch (grund) {
    case 'empty':
      return TEXTE.nameEingeben;
    case 'invalid':
      return TEXTE.themaUngueltig;
    case 'duplicate':
      return TEXTE.nameBelegt;
    case 'reserved':
      return TEXTE.nameReserviert;
    case 'locked':
      return TEXTE.inboxGesperrt;
    case 'missing':
    case 'unknown':
      return TEXTE.themaFehlt;
    case 'self':
      return TEXTE.anderesThema;
  }
}

export function planeUmbenennen(aktuell: string, roh: string, namen: readonly string[]): UmbenennPlan {
  const quelle = fund(namen, aktuell);
  if (!quelle) return { ok: false, grund: 'missing' };
  if (gleicherName(quelle, INBOX_NAME)) return { ok: false, grund: 'locked' };
  if (roh.trim().length === 0) return { ok: false, grund: 'empty' };
  const name = themaName(roh);
  if (!name) return { ok: false, grund: 'invalid' };
  if (gleicherName(name, INBOX_NAME)) return { ok: false, grund: 'reserved' };
  if (namen.some((eintrag) => gleicherName(eintrag, name) && !gleicherName(eintrag, quelle))) {
    return { ok: false, grund: 'duplicate' };
  }
  return { ok: true, aktuell: quelle, name, geaendert: name !== quelle };
}

export function planeZusammenfuehren(aktuell: string, roh: string, namen: readonly string[]): ZusammenPlan {
  const quelle = fund(namen, aktuell);
  if (!quelle) return { ok: false, grund: 'missing' };
  if (gleicherName(quelle, INBOX_NAME)) return { ok: false, grund: 'locked' };
  const name = themaName(roh);
  if (!name) return { ok: false, grund: 'invalid' };
  if (gleicherName(name, INBOX_NAME)) return { ok: false, grund: 'reserved' };
  if (gleicherName(name, quelle)) return { ok: false, grund: 'self' };
  const ziel = namen.find((eintrag) => gleicherName(eintrag, name));
  if (!ziel) return { ok: false, grund: 'unknown' };
  return { ok: true, quelle, ziel };
}

export function planeLoeschen(aktuell: string, namen: readonly string[]): LoeschPlan {
  const quelle = fund(namen, aktuell);
  if (!quelle) return { ok: false, grund: 'missing' };
  if (gleicherName(quelle, INBOX_NAME)) return { ok: false, grund: 'locked' };
  return { ok: true, name: quelle };
}

export function zieleFuerZusammenfuehren(themen: readonly Thema[], aktuell: string): Thema[] {
  return themen
    .filter((thema) => !gleicherName(thema.name, INBOX_NAME) && !gleicherName(thema.name, aktuell))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

export function filtereZiele(suche: string, ziele: readonly Thema[]): Thema[] {
  const nadel = suche.trim().toLocaleLowerCase();
  if (nadel.length === 0) return [...ziele];
  return ziele.filter((thema) => thema.name.toLocaleLowerCase().includes(nadel));
}

export function zitier(name: string): string {
  return `\u201C${name}\u201D`;
}

export function zusammenHinweis(anzahl: number, name: string): string {
  return hinweisZusammen(anzahl, zitier(name));
}
