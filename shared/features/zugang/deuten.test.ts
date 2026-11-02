import { describe, expect, it } from 'vitest';
import { STRIDE_COOKIE } from './grenzen.ts';
import { deuteAnmeldung, deuteNachpruefung, materialAus } from './deuten.ts';

const BEREIT = { modus: 'bereit', benutzername: 'Ada', rolle: 'inhaber', admin: false };
const COOKIE = `${STRIDE_COOKIE}=abc-def; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`;

describe('stride sign-in response', () => {
  it('reads the username and the session cookie from a ready sign-in', () => {
    expect(deuteAnmeldung(200, BEREIT, COOKIE)).toEqual({
      art: 'ok',
      kontoId: 'Ada',
      material: `${STRIDE_COOKIE}=abc-def`,
    });
    expect(materialAus(`${COOKIE}, andere=nein; Path=/`)).toBe(`${STRIDE_COOKIE}=abc-def`);
  });

  it('does not treat an old account wrapper or a foreign cookie as a sign-in', () => {
    expect(deuteAnmeldung(200, { konto: { id: 'k1' } }, 'stride=abc; HttpOnly')).toEqual({ art: 'unbekannt' });
    expect(deuteAnmeldung(200, { id: 'k', token: 'nur-token' }, null)).toEqual({ art: 'unbekannt' });
    expect(deuteAnmeldung(200, BEREIT, null)).toEqual({ art: 'unbekannt' });
    expect(deuteAnmeldung(200, BEREIT, 'stride=ja; HttpOnly')).toEqual({ art: 'unbekannt' });
    expect(deuteAnmeldung(200, { modus: 'bereit', benutzername: '  ', rolle: null, admin: false }, COOKIE)).toEqual({
      art: 'unbekannt',
    });
    expect(deuteAnmeldung(200, { modus: 'anmelden', benutzername: null, rolle: null, admin: false }, COOKIE)).toEqual({
      art: 'unbekannt',
    });
  });

  it('maps input errors, bad credentials, and a lock to their own results', () => {
    expect(deuteAnmeldung(400, { fehler: 'Der Benutzername fehlt.' }, null)).toEqual({ art: 'eingabe' });
    expect(deuteAnmeldung(401, { fehler: 'Anmeldung fehlgeschlagen.' }, null)).toEqual({ art: 'abgelehnt' });
    expect(deuteAnmeldung(403, null, null)).toEqual({ art: 'abgelehnt' });
    expect(deuteAnmeldung(429, { fehler: 'Zu viele Versuche. Bitte später erneut versuchen.' }, null)).toEqual({
      art: 'limit',
    });
    expect(deuteAnmeldung(302, BEREIT, COOKIE)).toEqual({ art: 'unbekannt' });
  });

  it('keeps an existing session when the check cannot be completed', () => {
    expect(deuteAnmeldung(503, null, null)).toEqual({ art: 'nicht_erreichbar' });
    expect(deuteAnmeldung(0, null, null)).toEqual({ art: 'nicht_erreichbar' });
    expect(deuteNachpruefung(200, BEREIT)).toEqual({ art: 'ok', kontoId: 'Ada' });
    expect(deuteNachpruefung(200, { modus: 'anmelden', benutzername: null, rolle: null, admin: false })).toEqual({
      art: 'abgelehnt',
    });
    expect(deuteNachpruefung(200, { modus: 'einrichten', benutzername: null, rolle: null, admin: false })).toEqual({
      art: 'abgelehnt',
    });
    expect(deuteNachpruefung(200, { konto: { id: 'k1' } })).toEqual({ art: 'unbekannt' });
    expect(deuteNachpruefung(200, {})).toEqual({ art: 'unbekannt' });
    expect(deuteNachpruefung(401, { fehler: 'Anmeldung erforderlich.' })).toEqual({ art: 'abgelehnt' });
    expect(deuteNachpruefung(400, { fehler: 'Ungültige Eingabe.' })).toEqual({ art: 'unbekannt' });
    expect(deuteNachpruefung(404, null)).toEqual({ art: 'unbekannt' });
    expect(deuteNachpruefung(500, null)).toEqual({ art: 'nicht_erreichbar' });
    expect(deuteNachpruefung(429, null)).toEqual({ art: 'limit' });
  });
});
