import type { Bibliothek } from '../../../../shared/features/library/index.ts';
import type { Notiz } from '../../../../shared/kern/modell.ts';

export class LeseFehler extends Error {
  readonly status: number | null;

  constructor(status: number | null) {
    super(status === null ? 'The network request failed.' : `Request failed (${status}).`);
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
  if (!antwort.ok) throw new LeseFehler(antwort.status);
  return (await antwort.json()) as T;
}

export function themaPfad(name: string): string {
  return `/library/topic?name=${encodeURIComponent(name)}`;
}

export function ladeBibliothek(): Promise<Bibliothek> {
  return hole<Bibliothek>('/api/library');
}

export function ladeThema(name: string): Promise<ThemaAnsicht> {
  return hole<ThemaAnsicht>(`/api/library/notes?topic=${encodeURIComponent(name)}`);
}
