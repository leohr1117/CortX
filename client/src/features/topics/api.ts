import type { Thema } from '../../../../shared/kern/modell.ts';

export class PflegeFehler extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'PflegeFehler';
    this.status = status;
  }
}

export interface Umbenannt {
  topic: string;
}

export interface Vereint {
  token: string;
  from: string;
  into: string;
  count: number;
}

export interface Geloescht {
  token: string;
  topic: string;
  count: number;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  let antwort: Response;
  try {
    antwort = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PflegeFehler('The network request failed.', null);
  }
  if (!antwort.ok) {
    let meldung = 'Could not update the topic.';
    try {
      const daten = (await antwort.json()) as { error?: unknown };
      if (typeof daten.error === 'string' && daten.error.length > 0) meldung = daten.error;
    } catch {
      meldung = 'Could not update the topic.';
    }
    throw new PflegeFehler(meldung, antwort.status);
  }
  return (await antwort.json()) as T;
}

export function ladeThemen(): Promise<Thema[]> {
  return fetch('/api/topics')
    .then(async (antwort) => {
      if (!antwort.ok) throw new PflegeFehler('Could not load topics.', antwort.status);
      const daten = (await antwort.json()) as { topics: Thema[] };
      return daten.topics;
    })
    .catch((fehler: unknown) => {
      if (fehler instanceof PflegeFehler) throw fehler;
      throw new PflegeFehler('The network request failed.', null);
    });
}

export function benenneUm(name: string, next: string): Promise<Umbenannt> {
  return post<Umbenannt>('/api/topics/rename', { name, next });
}

export function fuehreZusammen(name: string, into: string): Promise<Vereint> {
  return post<Vereint>('/api/topics/merge', { name, into });
}

export function loescheThema(name: string): Promise<Geloescht> {
  return post<Geloescht>('/api/topics/delete', { name });
}

export function macheRueckgaengig(token: string): Promise<{ topic: string }> {
  return post<{ topic: string }>('/api/topics/undo', { token });
}
