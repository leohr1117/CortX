import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { STRIDE_COOKIE } from '../../../shared/features/zugang/index.ts';
import { AKTUELLE_VERSION } from '../../../shared/versionen.ts';
import { SPEICHER } from '../../../shared/kern/grenzen.ts';
import { erstelleApp } from '../../kern/app.ts';
import { oeffneDatenbank } from '../../kern/db.ts';
import type { StridePruefer, StrideRoh } from '../zugang/stride.ts';

const ADA = 'ada@example.com';
const BEA = 'bea@example.com';

function strideOk(benutzername: string): StrideRoh {
  return {
    status: 200,
    body: { modus: 'bereit', benutzername, rolle: 'inhaber', admin: false },
    setCookie: `${STRIDE_COOKIE}=token; HttpOnly; Path=/; SameSite=Lax`,
  };
}

function cookieAus(kopf: string | string[] | undefined): string {
  const zeile = Array.isArray(kopf) ? kopf[0] : kopf;
  return zeile?.split(';')[0] ?? '';
}

describe('version stand', () => {
  const dbs: DatabaseSync[] = [];
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    for (const app of apps) await app.close();
    for (const db of dbs) db.close();
    apps.length = 0;
    dbs.length = 0;
  });

  async function server(): Promise<{ app: FastifyInstance; db: DatabaseSync }> {
    const db = oeffneDatenbank(SPEICHER);
    dbs.push(db);
    const stride: StridePruefer = async (ruf) => {
      if (ruf.art === 'nachpruefen') return strideOk(ruf.name);
      if ((ruf.name === ADA || ruf.name === BEA) && ruf.passwort === 'secret') return strideOk(ruf.name);
      return { status: 401, body: { fehler: 'Anmeldung fehlgeschlagen.' }, setCookie: null };
    };
    const app = await erstelleApp(db, null, false, { stride, jetzt: () => Date.parse('2026-11-02T08:00:00.000Z') });
    apps.push(app);
    return { app, db };
  }

  async function anmelden(app: FastifyInstance, name: string): Promise<string> {
    const antwort = await app.inject({
      method: 'POST',
      url: '/api/zugang',
      payload: { name, passwort: 'secret' },
    });
    expect(antwort.statusCode).toBe(200);
    return cookieAus(antwort.headers['set-cookie']);
  }

  it('keeps notes, treats a new account as fresh, and remembers each account', async () => {
    const { app, db } = await server();
    const ohne = await app.inject({ method: 'GET', url: '/api/version' });
    expect(ohne.statusCode).toBe(401);
    const cookie = await anmelden(app, ADA);
    const frisch = await app.inject({ method: 'GET', url: '/api/version', headers: { cookie } });
    expect(frisch.statusCode).toBe(200);
    expect(frisch.json()).toEqual({ notified: null, seen: null, fresh: true });

    const thema = db.prepare('SELECT id FROM "topic" WHERE account_id = ?').get(ADA) as { id: number };
    db.prepare(
      `INSERT INTO "note" (text, created, topic_id, source, ai_confidence, pinned, account_id)
       VALUES (?, ?, ?, 'manual', NULL, 0, ?)`,
    ).run('stay put', '2026-10-01T00:00:00.000Z', thema.id, ADA);

    const leer = await app.inject({ method: 'PATCH', url: '/api/version', headers: { cookie }, payload: {} });
    expect(leer.statusCode).toBe(400);
    const falsch = await app.inject({
      method: 'PATCH',
      url: '/api/version',
      headers: { cookie },
      payload: { notified: 'drei' },
    });
    expect(falsch.statusCode).toBe(400);
    expect(db.prepare('SELECT text FROM "note"').all()).toEqual([{ text: 'stay put' }]);

    const gesetzt = await app.inject({
      method: 'PATCH',
      url: '/api/version',
      headers: { cookie },
      payload: { notified: '1.0.0', seen: '1.0.0' },
    });
    expect(gesetzt.statusCode).toBe(200);
    expect(gesetzt.json()).toEqual({ notified: '1.0.0', seen: '1.0.0', fresh: false });
    expect(db.prepare('SELECT text FROM "note"').all()).toEqual([{ text: 'stay put' }]);

    db.prepare('UPDATE "version_hint" SET notified = NULL, seen = NULL WHERE account_id = ?').run(ADA);
    const bestand = await app.inject({ method: 'GET', url: '/api/version', headers: { cookie } });
    expect(bestand.json()).toEqual({ notified: null, seen: null, fresh: false });

    const nurNotiz = await app.inject({
      method: 'PATCH',
      url: '/api/version',
      headers: { cookie },
      payload: { notified: AKTUELLE_VERSION },
    });
    expect(nurNotiz.json()).toEqual({ notified: AKTUELLE_VERSION, seen: null, fresh: false });
    const gesehen = await app.inject({
      method: 'PATCH',
      url: '/api/version',
      headers: { cookie },
      payload: { seen: AKTUELLE_VERSION },
    });
    expect(gesehen.json()).toEqual({ notified: AKTUELLE_VERSION, seen: AKTUELLE_VERSION, fresh: false });
    expect(db.prepare('SELECT COUNT(*) AS n FROM "note"').get()).toEqual({ n: 1 });

    const beaCookie = await anmelden(app, BEA);
    const bea = await app.inject({ method: 'GET', url: '/api/version', headers: { cookie: beaCookie } });
    expect(bea.json()).toEqual({ notified: null, seen: null, fresh: true });
    const ada = await app.inject({ method: 'GET', url: '/api/version', headers: { cookie } });
    expect(ada.json()).toEqual({ notified: AKTUELLE_VERSION, seen: AKTUELLE_VERSION, fresh: false });
  });
});
