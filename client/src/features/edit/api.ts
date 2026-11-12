import type { Notiz } from '../../../../shared/kern/modell.ts';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import { meldeAblauf } from '../zugang/index.ts';

export class NotizFehler extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'NotizFehler';
    this.status = status;
  }
}

async function liesFehler(antwort: Response, fallback: string): Promise<never> {
  let meldung = fallback;
  try {
    const daten = (await antwort.json()) as { error?: unknown };
    if (typeof daten.error === 'string' && daten.error.length > 0) meldung = daten.error;
  } catch {
    meldung = fallback;
  }
  meldeAblauf(antwort.status);
  throw new NotizFehler(meldung, antwort.status);
}

async function hole(url: string, fallback: string): Promise<Notiz> {
  let antwort: Response;
  try {
    antwort = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new NotizFehler(TEXTE.netzFehl, null);
  }
  if (!antwort.ok) return liesFehler(antwort, fallback);
  return (await antwort.json()) as Notiz;
}

async function sende(url: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new NotizFehler(TEXTE.netzFehl, null);
  }
}

export function ladeNotiz(id: number): Promise<Notiz> {
  return hole(`/api/notes/${id}`, TEXTE.notizLaden);
}

export async function speichereNotiz(id: number, doc: unknown, version: number, signal?: AbortSignal): Promise<Notiz> {
  const antwort = await sende(`/api/notes/${id}`, { doc, version }, signal);
  if (!antwort.ok) return liesFehler(antwort, TEXTE.speichernNotiz);
  return (await antwort.json()) as Notiz;
}

// Same body as speichereNotiz. A Blob keeps the type application/json; a plain string would go out as text/plain.
export function sendeStand(id: number, doc: unknown, version: number): boolean {
  if (typeof navigator.sendBeacon !== 'function') return false;
  const body = new Blob([JSON.stringify({ doc, version })], { type: 'application/json' });
  return navigator.sendBeacon(`/api/notes/${id}`, body);
}

export async function legeKopieAn(id: number, doc: unknown, clientId: string): Promise<Notiz> {
  const antwort = await sende(`/api/notes/${id}/copy`, { doc, clientId });
  if (!antwort.ok) return liesFehler(antwort, TEXTE.kopieFehl);
  return (await antwort.json()) as Notiz;
}

export async function loescheNotiz(id: number): Promise<{ token: string }> {
  const antwort = await sende(`/api/notes/${id}/delete`, {});
  if (!antwort.ok) return liesFehler(antwort, TEXTE.loeschenNotiz);
  return (await antwort.json()) as { token: string };
}

export async function stelleNotizHer(token: string): Promise<Notiz> {
  const antwort = await sende('/api/notes/undo', { token });
  if (!antwort.ok) return liesFehler(antwort, TEXTE.nichtRueck);
  return (await antwort.json()) as Notiz;
}
