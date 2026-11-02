import type { SuchTreffer } from '../../../../shared/features/suche/index.ts';
import { meldeAblauf } from '../zugang/index.ts';

export class SuchFehler extends Error {
  readonly status: number | null;

  constructor(status: number | null) {
    super(status === null ? 'The network request failed.' : `Request failed (${status}).`);
    this.name = 'SuchFehler';
    this.status = status;
  }
}

export function notizPfad(topic: string, id: number): string {
  return `/library/topic?name=${encodeURIComponent(topic)}&note=${id}`;
}

export async function sucheNotizen(text: string): Promise<SuchTreffer[]> {
  let antwort: Response;
  try {
    antwort = await fetch(`/api/search?q=${encodeURIComponent(text)}`, { cache: 'no-store' });
  } catch {
    throw new SuchFehler(null);
  }
  if (!antwort.ok) {
    meldeAblauf(antwort.status);
    throw new SuchFehler(antwort.status);
  }
  const daten = (await antwort.json()) as { hits: SuchTreffer[] };
  return daten.hits;
}
