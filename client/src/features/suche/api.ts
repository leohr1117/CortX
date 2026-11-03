import type { SuchTreffer } from '../../../../shared/features/suche/index.ts';
import { TEXTE, anfrageFehl } from '../../../../shared/kern/texte.ts';
import { meldeAblauf } from '../zugang/index.ts';

export class SuchFehler extends Error {
  readonly status: number | null;

  constructor(status: number | null) {
    super(status === null ? TEXTE.netzFehl : anfrageFehl(status));
    this.name = 'SuchFehler';
    this.status = status;
  }
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
