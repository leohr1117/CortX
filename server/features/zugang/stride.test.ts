import { afterEach, describe, expect, it } from 'vitest';
import { STRIDE_COOKIE } from '../../../shared/features/zugang/grenzen.ts';
import { deuteAnmeldung, deuteNachpruefung } from '../../../shared/features/zugang/deuten.ts';
import { MOCK_NAME, MOCK_PASSWORT, starteStrideMock, type StrideMock } from './mock.ts';
import { strideHttp } from './stride.ts';

describe('stride http client', () => {
  const offen: StrideMock[] = [];

  afterEach(async () => {
    for (const mock of offen) await mock.close();
    offen.length = 0;
  });

  it('posts the username and forwards the real client address', async () => {
    const mock = await starteStrideMock(0);
    offen.push(mock);
    const ergebnis = await strideHttp(mock.url)({
      art: 'anmelden',
      name: MOCK_NAME,
      passwort: MOCK_PASSWORT,
      material: null,
      clientIp: '203.0.113.8',
    });
    expect(ergebnis.status).toBe(200);
    expect(deuteAnmeldung(ergebnis.status, ergebnis.body, ergebnis.setCookie)).toEqual({
      art: 'ok',
      kontoId: MOCK_NAME,
      material: `${STRIDE_COOKIE}=mock-session`,
    });
    const ruf = mock.rufe[0];
    expect(ruf?.method).toBe('POST');
    expect(ruf?.headers['x-forwarded-for']).toBe('203.0.113.8');
    expect(ruf?.headers['cf-connecting-ip']).toBe('203.0.113.8');
    expect(JSON.parse(ruf?.body ?? '{}')).toEqual({ benutzername: MOCK_NAME, passwort: MOCK_PASSWORT });
  });

  it('rejects a body that does not match the sign-in schema', async () => {
    const mock = await starteStrideMock(0);
    offen.push(mock);
    const alt = await fetch(mock.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: MOCK_NAME, passwort: MOCK_PASSWORT }),
    });
    expect(alt.status).toBe(400);
    expect(deuteAnmeldung(alt.status, await alt.json(), null)).toEqual({ art: 'eingabe' });
    const kurz = await fetch(mock.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ benutzername: MOCK_NAME, passwort: 'kurz' }),
    });
    expect(kurz.status).toBe(400);
    const falsch = await fetch(mock.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ benutzername: MOCK_NAME, passwort: 'wrong-password' }),
    });
    expect(falsch.status).toBe(401);
    expect(deuteAnmeldung(falsch.status, await falsch.json(), null)).toEqual({ art: 'abgelehnt' });
  });

  it('checks a stored session with GET and keeps a network failure quiet', async () => {
    const mock = await starteStrideMock(0);
    offen.push(mock);
    const client = strideHttp(mock.url);
    await client({
      art: 'anmelden',
      name: MOCK_NAME,
      passwort: MOCK_PASSWORT,
      material: null,
      clientIp: '203.0.113.8',
    });
    const ok = await client({
      art: 'nachpruefen',
      name: '',
      passwort: '',
      material: `${STRIDE_COOKIE}=mock-session`,
      clientIp: '203.0.113.8',
    });
    expect(ok.status).toBe(200);
    expect(deuteNachpruefung(ok.status, ok.body)).toEqual({ art: 'ok', kontoId: MOCK_NAME });
    expect(mock.rufe[1]?.method).toBe('GET');
    expect(mock.rufe[1]?.headers.cookie).toBe(`${STRIDE_COOKIE}=mock-session`);
    const weg = await client({
      art: 'nachpruefen',
      name: '',
      passwort: '',
      material: `${STRIDE_COOKIE}=andere`,
      clientIp: '203.0.113.8',
    });
    expect(deuteNachpruefung(weg.status, weg.body).art).toBe('abgelehnt');
    const tot = await strideHttp('http://127.0.0.1:9/api/zugang')({
      art: 'anmelden',
      name: 'a',
      passwort: 'b',
      material: null,
      clientIp: '203.0.113.8',
    });
    expect(tot.status).toBe(0);
    expect(deuteAnmeldung(tot.status, tot.body, tot.setCookie)).toEqual({ art: 'nicht_erreichbar' });
  });

  it('refuses the real stride port', async () => {
    const client = strideHttp('http://127.0.0.1:3000/api/zugang');
    await expect(
      client({ art: 'anmelden', name: 'a', passwort: 'b', material: null, clientIp: '127.0.0.1' }),
    ).rejects.toThrow(/Stride/);
    expect(() => starteStrideMock(3000)).toThrow(/Stride/);
  });
});
