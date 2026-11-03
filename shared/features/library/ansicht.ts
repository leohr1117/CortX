import { INBOX_NAME } from '../../kern/grenzen.ts';
import { letzteNotizZeile as letzteAusLabel, MONATE, TEXTE } from '../../kern/texte.ts';
import { seitentitel } from '../seiten/text.ts';
import { gleicherName } from '../tags/index.ts';

export interface BibliothekZeile {
  name: string;
  count: number;
  lastNote: string | null;
}

export interface Bibliothek {
  inbox: BibliothekZeile;
  topics: BibliothekZeile[];
}

export interface NotizGruppe<T> {
  label: string;
  notizen: T[];
}

function tagesAnfang(datum: Date): number {
  return new Date(datum.getFullYear(), datum.getMonth(), datum.getDate()).getTime();
}

export function tagesLabel(iso: string, jetzt: Date): string {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return TEXTE.unbekannt;
  const tag = tagesAnfang(datum);
  const heute = tagesAnfang(jetzt);
  const gestern = tagesAnfang(new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() - 1));
  if (tag === heute) return TEXTE.heute;
  if (tag === gestern) return TEXTE.gestern;
  const monat = MONATE[datum.getMonth()] ?? MONATE[0];
  if (datum.getFullYear() === jetzt.getFullYear()) return `${datum.getDate()} ${monat}`;
  return `${datum.getDate()} ${monat} ${datum.getFullYear()}`;
}

export const LEERE_SEITEN = TEXTE.leereSeiten;
export const UNBENANNTE_SEITE = TEXTE.unbenannt;

export function seitenzeile(text: string, created: string, jetzt: Date): { titel: string; datum: string } {
  const titel = seitentitel(text);
  return {
    titel: titel.length > 0 ? titel : UNBENANNTE_SEITE,
    datum: tagesLabel(created, jetzt),
  };
}

export function letzteNotizZeile(iso: string, jetzt: Date): string {
  return letzteAusLabel(tagesLabel(iso, jetzt));
}

export function themaUnterzeile(zeile: BibliothekZeile, jetzt: Date): string {
  if (zeile.count === 0) return LEERE_SEITEN;
  if (!zeile.lastNote) return '';
  return letzteNotizZeile(zeile.lastNote, jetzt);
}

export function uhrzeit(iso: string): string {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return '';
  const stunde = String(datum.getHours()).padStart(2, '0');
  const minute = String(datum.getMinutes()).padStart(2, '0');
  return `${stunde}:${minute}`;
}

export function baueBibliothek(zeilen: readonly BibliothekZeile[]): Bibliothek {
  const gefunden = zeilen.find((zeile) => gleicherName(zeile.name, INBOX_NAME));
  const inbox: BibliothekZeile = gefunden
    ? {
        name: gefunden.name,
        count: gefunden.count,
        lastNote: gefunden.count > 0 ? gefunden.lastNote : null,
      }
    : { name: INBOX_NAME, count: 0, lastNote: null };
  const topics = zeilen
    .filter((zeile) => !gleicherName(zeile.name, INBOX_NAME))
    .map((zeile) => ({ name: zeile.name, count: zeile.count, lastNote: zeile.lastNote }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  return { inbox, topics };
}

export function bibliothekLeer(ansicht: Bibliothek): boolean {
  return ansicht.inbox.count === 0 && ansicht.topics.length === 0;
}

export function gruppiereNotizen<T extends { created: string }>(
  notizen: readonly T[],
  jetzt: Date,
): NotizGruppe<T>[] {
  const sortiert = [...notizen].sort((a, b) => {
    const delta = Date.parse(b.created) - Date.parse(a.created);
    if (delta !== 0 && !Number.isNaN(delta)) return delta;
    return 0;
  });
  const gruppen: NotizGruppe<T>[] = [];
  for (const notiz of sortiert) {
    const label = tagesLabel(notiz.created, jetzt);
    const letzte = gruppen.at(-1);
    if (letzte && letzte.label === label) letzte.notizen.push(notiz);
    else gruppen.push({ label, notizen: [notiz] });
  }
  return gruppen;
}
