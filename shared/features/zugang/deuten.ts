import { KONTO_ID_MAX, STRIDE_COOKIE } from './grenzen.ts';

type AnmeldungDeutung =
  | { art: 'ok'; kontoId: string; material: string }
  | { art: 'eingabe' }
  | { art: 'abgelehnt' }
  | { art: 'limit' }
  | { art: 'nicht_erreichbar' }
  | { art: 'unbekannt' };

type NachpruefungDeutung =
  | { art: 'ok'; kontoId: string | null }
  | { art: 'abgelehnt' }
  | { art: 'limit' }
  | { art: 'nicht_erreichbar' }
  | { art: 'unbekannt' };

const ABGEMELDET = new Set(['anmelden', 'einrichten', 'passwort', 'benutzername']);

function text(wert: unknown): string | null {
  if (typeof wert !== 'string') return null;
  const sauber = wert.trim();
  if (!sauber || sauber.length > KONTO_ID_MAX || /[\r\n]/.test(sauber)) return null;
  return sauber;
}

function objekt(wert: unknown): Record<string, unknown> | null {
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return null;
  return wert as Record<string, unknown>;
}

function modusVon(body: unknown): string | null {
  const obj = objekt(body);
  return obj && typeof obj.modus === 'string' ? obj.modus : null;
}

function nameVon(body: unknown): string | null {
  const obj = objekt(body);
  if (!obj) return null;
  return text(obj.benutzername);
}

function materialAus(setCookie: string | null): string | null {
  if (!setCookie) return null;
  for (const stueck of setCookie.split(',')) {
    const paar = stueck.split(';')[0]?.trim() ?? '';
    const trenn = paar.indexOf('=');
    if (trenn <= 0) continue;
    const schluessel = paar.slice(0, trenn).trim();
    const wert = paar.slice(trenn + 1).trim();
    if (schluessel !== STRIDE_COOKIE || !wert || /[\r\n]/.test(wert)) continue;
    return `${STRIDE_COOKIE}=${wert}`;
  }
  return null;
}

type StatusDeutung =
  | { art: 'eingabe' }
  | { art: 'abgelehnt' }
  | { art: 'limit' }
  | { art: 'nicht_erreichbar' }
  | { art: 'unbekannt' };

function statusDeutung(status: number): StatusDeutung | null {
  if (status === 0 || status >= 500) return { art: 'nicht_erreichbar' };
  if (status === 429) return { art: 'limit' };
  if (status === 400) return { art: 'eingabe' };
  if (status === 401 || status === 403) return { art: 'abgelehnt' };
  if (status < 200 || status >= 300) return { art: 'unbekannt' };
  return null;
}

export function deuteAnmeldung(status: number, body: unknown, setCookie: string | null): AnmeldungDeutung {
  const vorher = statusDeutung(status);
  if (vorher) return vorher;
  if (modusVon(body) !== 'bereit') return { art: 'unbekannt' };
  const kontoId = nameVon(body);
  const material = materialAus(setCookie);
  if (!kontoId || !material) return { art: 'unbekannt' };
  return { art: 'ok', kontoId, material };
}

export function deuteNachpruefung(status: number, body: unknown): NachpruefungDeutung {
  const vorher = statusDeutung(status);
  if (vorher?.art === 'eingabe') return { art: 'unbekannt' };
  if (vorher) return vorher;
  const modus = modusVon(body);
  if (modus === 'bereit') {
    const kontoId = nameVon(body);
    if (!kontoId) return { art: 'unbekannt' };
    return { art: 'ok', kontoId };
  }
  if (modus && ABGEMELDET.has(modus)) return { art: 'abgelehnt' };
  return { art: 'unbekannt' };
}
