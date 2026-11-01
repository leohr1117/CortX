import { INBOX_NAME } from '../../kern/grenzen.ts';
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

const MONATE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function tagesAnfang(datum: Date): number {
  return new Date(datum.getFullYear(), datum.getMonth(), datum.getDate()).getTime();
}

export function tagesLabel(iso: string, jetzt: Date): string {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return 'Unknown';
  const tag = tagesAnfang(datum);
  const heute = tagesAnfang(jetzt);
  const gestern = tagesAnfang(new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() - 1));
  if (tag === heute) return 'Today';
  if (tag === gestern) return 'Yesterday';
  const monat = MONATE[datum.getMonth()] ?? 'Jan';
  if (datum.getFullYear() === jetzt.getFullYear()) return `${datum.getDate()} ${monat}`;
  return `${datum.getDate()} ${monat} ${datum.getFullYear()}`;
}

export function letzteNotizZeile(iso: string, jetzt: Date): string {
  const label = tagesLabel(iso, jetzt);
  if (label === 'Unknown') return 'Last note';
  if (label === 'Today') return 'Last note today';
  if (label === 'Yesterday') return 'Last note yesterday';
  return `Last note ${label}`;
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
    .filter((zeile) => !gleicherName(zeile.name, INBOX_NAME) && zeile.count > 0)
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
