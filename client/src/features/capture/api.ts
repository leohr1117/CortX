import type { SeiteKurz } from '../../../../shared/features/seiten/index.ts';
import type { Notiz, Thema } from '../../../../shared/kern/modell.ts';
import { TEXTE, anfrageFehl } from '../../../../shared/kern/texte.ts';
import { meldeAblauf } from '../zugang/index.ts';

export class ApiFehler extends Error {
  readonly status: number | null;

  constructor(status: number | null, meldung?: string) {
    super(meldung ?? (status === null ? TEXTE.netzFehl : anfrageFehl(status)));
    this.name = 'ApiFehler';
    this.status = status;
  }
}

async function leseJson<T>(antwort: Response): Promise<T> {
  if (!antwort.ok) {
    meldeAblauf(antwort.status);
    let meldung = anfrageFehl(antwort.status);
    try {
      const daten = (await antwort.json()) as { error?: unknown };
      if (typeof daten.error === 'string' && daten.error.length > 0) meldung = daten.error;
    } catch {
      meldung = anfrageFehl(antwort.status);
    }
    throw new ApiFehler(antwort.status, meldung);
  }
  return (await antwort.json()) as T;
}

async function sende(url: string, body: unknown): Promise<Response> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiFehler(null);
  }
}

export async function ladeThemen(): Promise<Thema[]> {
  let antwort: Response;
  try {
    antwort = await fetch('/api/topics');
  } catch {
    throw new ApiFehler(null);
  }
  const daten = await leseJson<{ topics: Thema[] }>(antwort);
  return daten.topics;
}

export interface AblageAntwort extends Notiz {
  ziel: string;
  undo: string;
}

export async function ladeSeiten(): Promise<SeiteKurz[]> {
  let antwort: Response;
  try {
    antwort = await fetch('/api/seiten');
  } catch {
    throw new ApiFehler(null);
  }
  const daten = await leseJson<{ seiten: SeiteKurz[] }>(antwort);
  return daten.seiten;
}

export async function legeNotizAb(text: string, clientId: string): Promise<AblageAntwort> {
  const antwort = await sende('/api/notes', { text, clientId });
  return leseJson<AblageAntwort>(antwort);
}

export async function macheRueckgaengig(token: string): Promise<string | null> {
  const antwort = await sende('/api/notes/undo', { token });
  const daten = await leseJson<{ erfasst?: unknown }>(antwort);
  return typeof daten.erfasst === 'string' ? daten.erfasst : null;
}

export async function verschiebeNotiz(id: number, topic: string): Promise<Notiz> {
  const antwort = await sende(`/api/notes/${id}/move`, { topic });
  return leseJson<Notiz>(antwort);
}
