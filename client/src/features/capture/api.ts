import type { Notiz, Thema } from '../../../../shared/kern/modell.ts';
import { meldeAblauf } from '../zugang/index.ts';

export class ApiFehler extends Error {
  readonly status: number | null;

  constructor(status: number | null) {
    super(status === null ? 'The network request failed.' : `Request failed (${status}).`);
    this.name = 'ApiFehler';
    this.status = status;
  }
}

async function leseJson<T>(antwort: Response): Promise<T> {
  if (!antwort.ok) {
    meldeAblauf(antwort.status);
    throw new ApiFehler(antwort.status);
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

export async function legeNotizAb(text: string, clientId: string): Promise<Notiz> {
  const antwort = await sende('/api/notes', { text, clientId });
  return leseJson<Notiz>(antwort);
}

export async function verschiebeNotiz(id: number, topic: string): Promise<Notiz> {
  const antwort = await sende(`/api/notes/${id}/move`, { topic });
  return leseJson<Notiz>(antwort);
}
