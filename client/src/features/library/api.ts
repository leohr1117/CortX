import type { Bibliothek } from '../../../../shared/features/library/index.ts';
import type { Notiz } from '../../../../shared/kern/modell.ts';
import { TEXTE, anfrageFehl } from '../../../../shared/kern/texte.ts';
import { meldeAblauf } from '../zugang/index.ts';

export class LeseFehler extends Error {
  readonly status: number | null;

  constructor(status: number | null) {
    super(status === null ? TEXTE.netzFehl : anfrageFehl(status));
    this.name = 'LeseFehler';
    this.status = status;
  }
}

export interface ThemaAnsicht {
  topic: string;
  notes: Notiz[];
}

async function hole<T>(url: string): Promise<T> {
  let antwort: Response;
  try {
    antwort = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new LeseFehler(null);
  }
  if (!antwort.ok) {
    meldeAblauf(antwort.status);
    throw new LeseFehler(antwort.status);
  }
  return (await antwort.json()) as T;
}

export function themaPfad(name: string): string {
  return `/library/topic?name=${encodeURIComponent(name)}`;
}

export function notizPfad(id: number): string {
  return `/library/note?id=${id}`;
}

export const BIBLIOTHEK_NEU = 'cortx-bibliothek-neu';

export function bibliothekNeu(): void {
  window.dispatchEvent(new Event(BIBLIOTHEK_NEU));
}

export function ladeBibliothek(): Promise<Bibliothek> {
  return hole<Bibliothek>('/api/library');
}

export function ladeThema(name: string): Promise<ThemaAnsicht> {
  return hole<ThemaAnsicht>(`/api/library/notes?topic=${encodeURIComponent(name)}`);
}
