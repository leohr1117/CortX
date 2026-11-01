import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { FEHLER_GLOBAL, FEHLER_JE_IP, STRIDE_PRUEF_MS } from '../../../shared/features/zugang/index.ts';
import { SPEICHER } from '../../../shared/kern/grenzen.ts';
import { erstelleApp } from '../../kern/app.ts';
import { oeffneDatenbank } from '../../kern/db.ts';
import type { StridePruefer, StrideRoh, StrideRuf } from './stride.ts';

const START = Date.parse('2026-11-01T00:00:00.000Z');

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
      const kontoId = konten[ruf.name];
      if (!kontoId || ruf.passwort !== 'secret') return { status: 401, body: { ok: false }, setCookie: null };
      return { status: 200, body: { konto: { id: kontoId } }, setCookie: `stride=${kontoId}; HttpOnly` };
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
      .prepare('INSERT INTO "note" (text, created, topic_id, source, ai_confidence) VALUES (?, ?, ?, ?, NULL)')
      .run('keep me', '2026-01-01T00:00:00.000Z', thema.id, 'manual');

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
    expect(gehoert.account_id).toBe('konto-a');

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
    expect(falsch.json()).toEqual({ error: 'The email or password is wrong.' });
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
      payload: { text: 'Private #Work' },
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
      if (ruf.name === 'ok@example.com') {
        return { status: 200, body: { id: 'konto-ok' }, setCookie: null };
      }
      return { status: 401, body: { ok: false }, setCookie: null };
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
          if (art === 'tot') return { status: 401, body: { ok: false }, setCookie: null };
          return { status: 200, body: { konto: { id: 'konto-a' } }, setCookie: null };
        }
        if (art === 'down') return { status: 0, body: null, setCookie: null };
        return { status: 200, body: { konto: { id: 'konto-a' } }, setCookie: 'stride=abc; HttpOnly' };
      },
      () => jetzt,
    );
    const aus = await server.inject({
      method: 'POST',
      url: '/api/zugang',
      payload: { name: 'ada@example.com', passwort: 'secret' },
    });
    expect(aus.statusCode).toBe(503);
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
});
