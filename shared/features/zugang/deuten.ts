import { KONTO_ID_MAX } from './grenzen.ts';

export type AnmeldungDeutung =
  | { art: 'ok'; kontoId: string; material: string | null }
  | { art: 'abgelehnt' }
  | { art: 'limit' }
  | { art: 'nicht_erreichbar' }
  | { art: 'unbekannt' };

export type NachpruefungDeutung =
  | { art: 'ok'; kontoId: string | null }
  | { art: 'abgelehnt' }
  | { art: 'limit' }
  | { art: 'nicht_erreichbar' }
  | { art: 'unbekannt' };

function text(wert: unknown): string | null {
  if (typeof wert === 'string') {
    const sauber = wert.trim();
    if (!sauber || sauber.length > KONTO_ID_MAX || /[\r\n]/.test(sauber)) return null;
    return sauber;
  }
  if (typeof wert === 'number' && Number.isFinite(wert)) {
    const sauber = String(wert);
    return sauber.length <= KONTO_ID_MAX ? sauber : null;
  }
  return null;
}

function objekt(wert: unknown): Record<string, unknown> | null {
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return null;
  return wert as Record<string, unknown>;
}

function negativ(body: unknown): boolean {
  const obj = objekt(body);
  if (!obj) return false;
  if (obj.ok === false || obj.success === false || obj.gueltig === false || obj.valid === false) return true;
  if (typeof obj.error === 'string' && obj.error.trim()) return true;
  if (typeof obj.fehler === 'string' && obj.fehler.trim()) return true;
  return false;
}

function sucheId(body: unknown): string | null {
  const obj = objekt(body);
  if (!obj) return null;
  for (const schluessel of ['kontoId', 'konto_id', 'accountId', 'account_id']) {
    const wert = text(obj[schluessel]);
    if (wert) return wert;
  }
  for (const nest of ['konto', 'account', 'user']) {
    const innen = objekt(obj[nest]);
    if (!innen) continue;
    const wert = text(innen.id) ?? text(innen.kontoId) ?? text(innen.konto_id);
    if (wert) return wert;
  }
  return text(obj.id);
}

export function materialAus(setCookie: string | null, body: unknown): string | null {
  if (setCookie) {
    const paare = setCookie
      .split(',')
      .map((stueck) => stueck.split(';')[0]?.trim() ?? '')
      .filter((paar) => paar.includes('=') && !/[\r\n]/.test(paar));
    if (paare.length > 0) return paare.join('; ');
  }
  const obj = objekt(body);
  if (!obj) return null;
  for (const schluessel of ['sitzung', 'session', 'token']) {
    const wert = text(obj[schluessel]);
    if (wert) return wert;
  }
  return null;
}

export function deuteAnmeldung(status: number, body: unknown, setCookie: string | null): AnmeldungDeutung {
  if (status === 0 || status >= 500) return { art: 'nicht_erreichbar' };
  if (status === 429) return { art: 'limit' };
  if (status === 401 || status === 403) return { art: 'abgelehnt' };
  if (status < 200 || status >= 300) return { art: 'unbekannt' };
  if (negativ(body)) return { art: 'abgelehnt' };
  const kontoId = sucheId(body);
  if (!kontoId) return { art: 'unbekannt' };
  return { art: 'ok', kontoId, material: materialAus(setCookie, body) };
}

export function deuteNachpruefung(status: number, body: unknown): NachpruefungDeutung {
  if (status === 0 || status >= 500) return { art: 'nicht_erreichbar' };
  if (status === 429) return { art: 'limit' };
  if (status === 401 || status === 403) return { art: 'abgelehnt' };
  if (status < 200 || status >= 300) return { art: 'unbekannt' };
  if (negativ(body)) return { art: 'abgelehnt' };
  return { art: 'ok', kontoId: sucheId(body) };
}
