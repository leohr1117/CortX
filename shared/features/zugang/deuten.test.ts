import { describe, expect, it } from 'vitest';
import { deuteAnmeldung, deuteNachpruefung, materialAus } from './deuten.ts';

describe('stride sign-in response', () => {
  it('reads an account id from the shapes a sign-in payload may use', () => {
    expect(deuteAnmeldung(200, { konto: { id: 'k1' } }, null)).toEqual({
      art: 'ok',
      kontoId: 'k1',
      material: null,
    });
    expect(deuteAnmeldung(200, { kontoId: 12 }, null)).toMatchObject({ art: 'ok', kontoId: '12' });
    expect(deuteAnmeldung(200, { account: { id: 'acc' } }, null)).toMatchObject({ kontoId: 'acc' });
    expect(deuteAnmeldung(200, { id: 'oben' }, null)).toMatchObject({ kontoId: 'oben' });
    expect(deuteAnmeldung(200, { ok: true, user: { id: 'u' } }, null)).toMatchObject({ kontoId: 'u' });
  });

  it('keeps a session cookie or token for a later check', () => {
    expect(materialAus('stride=abc; HttpOnly; Path=/, andere=nein; Path=/', null)).toBe('stride=abc; andere=nein');
    expect(deuteAnmeldung(200, { id: 'k', token: 'nur-token' }, null).art === 'ok'
      ? deuteAnmeldung(200, { id: 'k', token: 'nur-token' }, null)
      : null).toMatchObject({ material: 'nur-token' });
    expect(deuteAnmeldung(200, { id: 'k', token: 'nein' }, 'stride=ja; HttpOnly')).toMatchObject({
      material: 'stride=ja',
    });
  });

  it('rejects a failed sign-in and does not invent an account', () => {
    expect(deuteAnmeldung(401, { ok: false }, null)).toEqual({ art: 'abgelehnt' });
    expect(deuteAnmeldung(403, null, null)).toEqual({ art: 'abgelehnt' });
    expect(deuteAnmeldung(200, { ok: false, id: 'k' }, null)).toEqual({ art: 'abgelehnt' });
    expect(deuteAnmeldung(200, { error: 'no' }, null)).toEqual({ art: 'abgelehnt' });
    expect(deuteAnmeldung(200, {}, null)).toEqual({ art: 'unbekannt' });
    expect(deuteAnmeldung(302, { id: 'k' }, null)).toEqual({ art: 'unbekannt' });
  });

  it('keeps an existing session when the check cannot be completed', () => {
    expect(deuteAnmeldung(429, null, null)).toEqual({ art: 'limit' });
    expect(deuteAnmeldung(503, null, null)).toEqual({ art: 'nicht_erreichbar' });
    expect(deuteAnmeldung(0, null, null)).toEqual({ art: 'nicht_erreichbar' });
    expect(deuteNachpruefung(200, { konto: { id: 'k1' } })).toEqual({ art: 'ok', kontoId: 'k1' });
    expect(deuteNachpruefung(200, {})).toEqual({ art: 'ok', kontoId: null });
    expect(deuteNachpruefung(401, { fehler: 'session expired' })).toEqual({ art: 'abgelehnt' });
    expect(deuteNachpruefung(404, null)).toEqual({ art: 'unbekannt' });
    expect(deuteNachpruefung(405, null)).toEqual({ art: 'unbekannt' });
    expect(deuteNachpruefung(400, { error: 'missing' })).toEqual({ art: 'unbekannt' });
    expect(deuteNachpruefung(500, null)).toEqual({ art: 'nicht_erreichbar' });
    expect(deuteNachpruefung(429, null)).toEqual({ art: 'limit' });
  });
});
