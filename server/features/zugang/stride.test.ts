import { afterEach, describe, expect, it } from 'vitest';
import { starteStrideMock, type StrideMock } from './mock.ts';
import { strideHttp } from './stride.ts';

describe('stride http client', () => {
  const offen: StrideMock[] = [];

  afterEach(async () => {
    for (const mock of offen) await mock.close();
    offen.length = 0;
  });

  it('posts the name and forwards the real client address', async () => {
    const mock = await starteStrideMock(0);
    offen.push(mock);
    const ergebnis = await strideHttp(mock.url)({
      art: 'anmelden',
      name: 'note@example.com',
      passwort: 'test-password',
      material: null,
      clientIp: '203.0.113.8',
    });
    expect(ergebnis.status).toBe(200);
    expect(ergebnis.body).toMatchObject({ konto: { id: 'stride-konto' } });
    expect(ergebnis.setCookie).toContain('stride=mock-session');
    const ruf = mock.rufe[0];
    expect(ruf?.method).toBe('POST');
    expect(ruf?.headers['x-forwarded-for']).toBe('203.0.113.8');
    expect(ruf?.headers['cf-connecting-ip']).toBe('203.0.113.8');
    expect(JSON.parse(ruf?.body ?? '{}')).toEqual({ name: 'note@example.com', passwort: 'test-password' });
  });

  it('checks a stored session with GET and keeps a network failure quiet', async () => {
    const mock = await starteStrideMock(0);
    offen.push(mock);
    const client = strideHttp(mock.url);
    const ok = await client({
      art: 'nachpruefen',
      name: '',
      passwort: '',
      material: 'stride=mock-session',
      clientIp: '203.0.113.8',
    });
    expect(ok.status).toBe(200);
    expect(mock.rufe[0]?.method).toBe('GET');
    expect(mock.rufe[0]?.headers.cookie).toBe('stride=mock-session');
    const weg = await strideHttp('http://127.0.0.1:9/api/zugang')({
      art: 'anmelden',
      name: 'a',
      passwort: 'b',
      material: null,
      clientIp: '203.0.113.8',
    });
    expect(weg.status).toBe(0);
  });

  it('refuses the real stride port', async () => {
    const client = strideHttp('http://127.0.0.1:3000/api/zugang');
    await expect(
      client({ art: 'anmelden', name: 'a', passwort: 'b', material: null, clientIp: '127.0.0.1' }),
    ).rejects.toThrow(/Stride/);
    expect(() => starteStrideMock(3000)).toThrow(/Stride/);
  });
});
