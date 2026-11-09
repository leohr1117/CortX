import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { FEHLER_GLOBAL, FEHLER_JE_IP, STRIDE_COOKIE, STRIDE_PRUEF_MS } from '../../../shared/features/zugang/index.ts';
import { SPEICHER } from '../../../shared/kern/grenzen.ts';
import { erstelleApp } from '../../kern/app.ts';
import { strideUrl } from '../../kern/config.ts';
import { oeffneDatenbank } from '../../kern/db.ts';
import { spalteAusText } from '../notes/lesen.ts';
import type { StridePruefer, StrideRoh, StrideRuf } from './stride.ts';

const START = Date.parse('2026-11-01T00:00:00.000Z');

function strideOk(benutzername: string, token: string): StrideRoh {
  return {
    status: 200,
    body: { modus: 'bereit', benutzername, rolle: 'inhaber', admin: false },
    setCookie: `${STRIDE_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax`,
  };
}

function strideAus(): StrideRoh {
  return {
    status: 200,
    body: { modus: 'anmelden', benutzername: null, rolle: null, admin: false },
    setCookie: null,
  };
}

function cookieAus(kopf: string | string[] | undefined): string {
  const zeile = Array.isArray(kopf) ? kopf[0] : kopf;
  return zeile?.split(';')[0] ?? '';
}

describe('account session', () => {
  const dbs: DatabaseSync[] = [];
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    for (const app of apps) await app.close();
    for (const db of dbs) db.close();
    apps.length = 0;
    dbs.length = 0;
  });

  function db(): DatabaseSync {
    const daten = oeffneDatenbank(SPEICHER);
    dbs.push(daten);
    return daten;
  }

  async function app(stride: StridePruefer, jetzt: () => number = () => START): Promise<FastifyInstance> {
    const server = await erstelleApp(db(), null, false, { stride, jetzt });
    apps.push(server);
    return server;
  }

  function strideFuer(konten: Record<string, string>, nach: (ruf: StrideRuf) => StrideRoh | Promise<StrideRoh>): StridePruefer {
    return async (ruf) => {
      if (ruf.art === 'nachpruefen') return nach(ruf);
      const token = konten[ruf.name];
      if (!token || ruf.passwort !== 'secret') {
        return { status: 401, body: { fehler: 'Anmeldung fehlgeschlagen.' }, setCookie: null };
      }
      return strideOk(ruf.name, token);
    };
  }

  it('sets a long http-only cookie and hides notes until then', async () => {
    const gesehen: string[] = [];
    const server = await app(
      strideFuer({ 'ada@example.com': 'konto-a' }, () => {
        throw new Error('too soon');
      }),
    );
    const daten = dbs[0];
    if (!daten) throw new Error('missing database');
    const thema = daten.prepare('SELECT id FROM "topic"').get() as { id: number };
    daten
      .prepare('INSERT INTO "note" (doc, created, topic_id, source, ai_confidence) VALUES (?, ?, ?, ?, NULL)')
      .run(spalteAusText('keep me'), '2026-01-01T00:00:00.000Z', thema.id, 'manual');

    const gesperrt = await server.inject({ method: 'GET', url: '/api/library' });
    expect(gesperrt.statusCode).toBe(401);
    expect(gesperrt.json()).toEqual({ error: 'Sign in.' });

    const login = await server.inject({
      method: 'POST',
      url: '/api/zugang',
      headers: { 'cf-connecting-ip': '203.0.113.8', 'x-forwarded-proto': 'https' },
      payload: { name: '  ada@example.com  ', passwort: 'secret' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = cookieAus(login.headers['set-cookie']);
    expect(cookie.startsWith('cortex_session=')).toBe(true);
    const satz = String(login.headers['set-cookie']);
    expect(satz).toContain('HttpOnly');
    expect(satz).toContain('SameSite=Lax');
    expect(satz).toContain('Secure');
    const gehoert = daten.prepare('SELECT account_id FROM "note"').get() as { account_id: string };
    expect(gehoert.account_id).toBe('ada@example.com');

    const bibliothek = await server.inject({ method: 'GET', url: '/api/library', headers: { cookie } });
    expect(bibliothek.statusCode).toBe(200);
    expect(bibliothek.json().inbox.count).toBe(1);
    gesehen.push(cookie);

    const falsch = await server.inject({
      method: 'POST',
      url: '/api/zugang',
      payload: { name: 'ada@example.com', passwort: 'nope' },
    });
    expect(falsch.statusCode).toBe(401);
    expect(falsch.json()).toEqual({ error: 'The username or password is wrong.' });
    expect((await server.inject({ method: 'POST', url: '/api/zugang', payload: { name: '' } })).statusCode).toBe(400);

    const weg = await server.inject({ method: 'POST', url: '/api/abmelden', headers: { cookie } });
    expect(weg.statusCode).toBe(200);
    expect(String(weg.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await server.inject({ method: 'GET', url: '/api/topics', headers: { cookie } })).statusCode).toBe(401);
    expect(gesehen).toHaveLength(1);
  });

  it('gives each account its own notes and claims orphans only once', async () => {
    const server = await app(strideFuer({ 'a@example.com': 'konto-a', 'b@example.com': 'konto-b' }, () => ({ status: 200, body: {}, setCookie: null })));
    const erste = await server.inject({
      method: 'POST',
      url: '/api/zugang',
      payload: { name: 'a@example.com', passwort: 'secret' },
    });
    const cookieA = cookieAus(erste.headers['set-cookie']);
    const notiz = await server.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie: cookieA },
      payload: { text: '#Work\nPrivate' },
    });
    expect(notiz.statusCode).toBe(201);
    const id = (notiz.json() as { id: number }).id;

    const zweite = await server.inject({
      method: 'POST',
      url: '/api/zugang',
      payload: { name: 'b@example.com', passwort: 'secret' },
    });
    const cookieB = cookieAus(zweite.headers['set-cookie']);
    const fremd = await server.inject({ method: 'GET', url: '/api/library', headers: { cookie: cookieB } });
    expect(fremd.json()).toEqual({ inbox: { name: 'Inbox', count: 0, lastNote: null }, topics: [] });
    expect((await server.inject({ method: 'GET', url: `/api/notes/${id}`, headers: { cookie: cookieB } })).statusCode).toBe(404);
    const eigene = await server.inject({ method: 'GET', url: '/api/library/notes?topic=Work', headers: { cookie: cookieA } });
    expect(eigene.statusCode).toBe(200);
    expect(eigene.json().notes).toHaveLength(1);
  });

  it('limits failed attempts per address and globally without calling stride again', async () => {
    let aufrufe = 0;
    const stride: StridePruefer = async (ruf) => {
      aufrufe += 1;
      if (ruf.clientIp !== '203.0.113.8' && ruf.clientIp !== '198.51.100.9') {
        return { status: 401, body: { ok: false }, setCookie: null };
      }
      return { status: 401, body: { ok: false }, setCookie: null };
    };
    const server = await app(stride);
    for (let index = 0; index < FEHLER_JE_IP; index += 1) {
      const antwort = await server.inject({
        method: 'POST',
        url: '/api/zugang',
        headers: { 'cf-connecting-ip': '203.0.113.8' },
        payload: { name: 'ada@example.com', passwort: 'nope' },
      });
      expect(antwort.statusCode).toBe(401);
    }
    const block = await server.inject({
      method: 'POST',
      url: '/api/zugang',
      headers: { 'cf-connecting-ip': '203.0.113.8' },
      payload: { name: 'ada@example.com', passwort: 'secret' },
    });
    expect(block.statusCode).toBe(429);
    expect(aufrufe).toBe(FEHLER_JE_IP);

    const globalServer = await app(async (ruf) => {
      aufrufe += 1;
      if (ruf.name === 'ok@example.com') return strideOk(ruf.name, 'ok');
      return { status: 401, body: { fehler: 'Anmeldung fehlgeschlagen.' }, setCookie: null };
    });
    for (let index = 0; index < FEHLER_GLOBAL; index += 1) {
      const antwort = await globalServer.inject({
        method: 'POST',
        url: '/api/zugang',
        headers: { 'x-forwarded-for': `198.51.100.${index}` },
        payload: { name: 'ada@example.com', passwort: 'nope' },
      });
      expect(antwort.statusCode).toBe(401);
    }
    const alle = await globalServer.inject({
      method: 'POST',
      url: '/api/zugang',
      headers: { 'x-forwarded-for': '203.0.113.50' },
      payload: { name: 'ok@example.com', passwort: 'secret' },
    });
    expect(alle.statusCode).toBe(429);
  });

  it('keeps a session when stride is down and drops it when stride rejects it', async () => {
    let art: 'ok' | 'down' | 'tot' = 'down';
    let jetzt = START;
    let checks = 0;
    const server = await app(
      async (ruf) => {
        if (ruf.art === 'nachpruefen') {
          checks += 1;
          if (art === 'down') throw new Error('down');
          if (art === 'tot') return strideAus();
          return strideOk('ada@example.com', 'abc');
        }
        if (art === 'down') return { status: 0, body: null, setCookie: null };
        return strideOk('ada@example.com', 'abc');
      },
      () => jetzt,
    );
    const aus = await server.inject({
      method: 'POST',
      url: '/api/zugang',
      payload: { name: 'ada@example.com', passwort: 'secret' },
    });
    expect(aus.statusCode).toBe(502);
    expect(aus.json()).toEqual({ error: 'Stride is not reachable. Try again later.' });
    art = 'ok';
    const login = await server.inject({
      method: 'POST',
      url: '/api/zugang',
      headers: { 'x-forwarded-for': '203.0.113.8, 10.0.0.1' },
      payload: { name: 'ada@example.com', passwort: 'secret' },
    });
    const cookie = cookieAus(login.headers['set-cookie']);
    expect((await server.inject({ method: 'GET', url: '/api/library', headers: { cookie } })).statusCode).toBe(200);
    expect(checks).toBe(0);
    jetzt += STRIDE_PRUEF_MS;
    art = 'down';
    expect((await server.inject({ method: 'GET', url: '/api/library', headers: { cookie } })).statusCode).toBe(200);
    expect(checks).toBe(1);
    jetzt += STRIDE_PRUEF_MS;
    art = 'tot';
    expect((await server.inject({ method: 'GET', url: '/api/topics', headers: { cookie } })).statusCode).toBe(401);
  });

  it('maps an input error and a lock, and rejects a sign-in that is not a session', async () => {
    const eingabe = await app(async () => ({
      status: 400,
      body: { fehler: 'Der Benutzername fehlt.' },
      setCookie: null,
    }));
    const leer = await eingabe.inject({
      method: 'POST',
      url: '/api/zugang',
      payload: { name: 'ada@example.com', passwort: 'secret' },
    });
    expect(leer.statusCode).toBe(400);
    expect(leer.json()).toEqual({ error: 'Enter your username and password.' });

    const gesperrt = await app(async () => ({
      status: 429,
      body: { fehler: 'Zu viele Versuche. Bitte später erneut versuchen.' },
      setCookie: null,
    }));
    const limit = await gesperrt.inject({
      method: 'POST',
      url: '/api/zugang',
      payload: { name: 'ada@example.com', passwort: 'secret' },
    });
    expect(limit.statusCode).toBe(429);
    expect(limit.json()).toEqual({ error: 'Too many sign-in attempts. Try again later.' });

    const fremd = await app(async () => ({
      status: 200,
      body: { konto: { id: 'konto-a' } },
      setCookie: 'stride=abc; HttpOnly',
    }));
    const kaputt = await fremd.inject({
      method: 'POST',
      url: '/api/zugang',
      payload: { name: 'ada@example.com', passwort: 'secret' },
    });
    expect(kaputt.statusCode).toBe(502);
    expect(kaputt.json()).toEqual({ error: 'Could not sign in.' });
  });

  it('redirects the password change page without a session', async () => {
    const vorher = process.env.CORTX_STRIDE_PUBLIC_URL;
    const pruefe = async (ziel: string) => {
      const server = await app(async () => {
        throw new Error('stride must not be called');
      });
      const antwort = await server.inject({ method: 'GET', url: '/.well-known/change-password' });
      expect(antwort.statusCode).toBe(302);
      expect(antwort.headers.location).toBe(ziel);
      expect(antwort.headers['set-cookie']).toBeUndefined();
      const bibliothek = await server.inject({ method: 'GET', url: '/api/library' });
      expect(bibliothek.statusCode).toBe(401);
    };
    try {
      delete process.env.CORTX_STRIDE_PUBLIC_URL;
      expect(strideUrl()).toMatch(/\/api\/zugang$/);
      await pruefe('https://stride.leohr.de/mehr/profil/passwort');
      process.env.CORTX_STRIDE_PUBLIC_URL = 'https://stride.example/';
      await pruefe('https://stride.example/mehr/profil/passwort');
    } finally {
      if (vorher === undefined) delete process.env.CORTX_STRIDE_PUBLIC_URL;
      else process.env.CORTX_STRIDE_PUBLIC_URL = vorher;
    }
  });
});
