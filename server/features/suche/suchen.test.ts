import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { SUCH_LIMIT, SUCH_MAX } from '../../../shared/features/suche/index.ts';
import { SPEICHER } from '../../../shared/kern/grenzen.ts';
import { migriere, oeffneDatenbank } from '../../kern/db.ts';
import { migrationsSql } from '../../kern/migrationen.ts';
import { PROBE_KONTO, oeffneAngemeldet } from '../zugang/attrappe.ts';
import { sucheNotizen } from './index.ts';

interface Treffer {
  id: number;
  text: string;
  topic: string;
  created: string;
}

describe('note search', () => {
  const dbs: DatabaseSync[] = [];
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    for (const app of apps) await app.close();
    for (const db of dbs) db.close();
    apps.length = 0;
    dbs.length = 0;
  });

  async function app(): Promise<{ server: FastifyInstance; db: DatabaseSync }> {
    const db = oeffneDatenbank(SPEICHER);
    dbs.push(db);
    const server = await oeffneAngemeldet(db);
    apps.push(server);
    return { server, db };
  }

  async function lege(server: FastifyInstance, text: string): Promise<number> {
    const antwort = await server.inject({ method: 'POST', url: '/api/notes', payload: { text } });
    expect(antwort.statusCode).toBe(201);
    return (antwort.json() as { id: number }).id;
  }

  async function treffer(server: FastifyInstance, q: string): Promise<{ status: number; hits: Treffer[] }> {
    const antwort = await server.inject({ method: 'GET', url: `/api/search?q=${encodeURIComponent(q)}` });
    const hits = antwort.statusCode === 200 ? (antwort.json() as { hits: Treffer[] }).hits : [];
    return { status: antwort.statusCode, hits };
  }

  function indexGanz(db: DatabaseSync): void {
    db.prepare("INSERT INTO note_fts(note_fts) VALUES ('integrity-check')").run();
    const notizen = db.prepare('SELECT count(*) AS n FROM "note"').get() as { n: number };
    const index = db.prepare('SELECT count(*) AS n FROM note_fts').get() as { n: number };
    expect(Number(index.n)).toBe(Number(notizen.n));
  }

  it('requires a signed-in account and a real query', async () => {
    const { server } = await app();
    const offen = await server.inject({
      method: 'GET',
      url: '/api/search?q=lantern',
      headers: { cookie: 'cortex_session=nein' },
    });
    expect(offen.statusCode).toBe(401);

    const fehlt = await server.inject({ method: 'GET', url: '/api/search' });
    expect(fehlt.statusCode).toBe(400);
    expect(fehlt.json()).toEqual({ error: 'The search is missing or invalid.' });

    const leer = await server.inject({ method: 'GET', url: '/api/search?q=%20%20' });
    expect(leer.statusCode).toBe(400);
    expect(leer.json()).toEqual({ error: 'The search is missing or invalid.' });

    const lang = await server.inject({ method: 'GET', url: `/api/search?q=${'a'.repeat(SUCH_MAX + 1)}` });
    expect(lang.statusCode).toBe(400);
    expect(lang.json()).toEqual({ error: 'The search is too long.' });

    const extra = await server.inject({ method: 'GET', url: '/api/search?q=lantern&x=1' });
    expect(extra.statusCode).toBe(400);
  });

  it('finds one account’s notes across topics, newest first, and keeps the full text', async () => {
    const { server, db } = await app();
    const aelter = await lege(server, 'Loose lantern bulb');
    const mittel = await lege(server, `Hang the porch lantern ${'alpha '.repeat(40)}tailmarker #Home`);
    const neuer = await lege(server, 'Meet at 50% (draft) about the lantern budget #Work');
    db.prepare('UPDATE "note" SET created = ? WHERE id = ?').run('2026-10-01T09:00:00.000Z', aelter);
    db.prepare('UPDATE "note" SET created = ? WHERE id = ?').run('2026-10-15T18:00:00.000Z', mittel);
    db.prepare('UPDATE "note" SET created = ? WHERE id = ?').run('2026-11-01T16:00:00.000Z', neuer);

    const fremdThema = db
      .prepare(`INSERT INTO "topic" (name, name_key, created, account_id) VALUES ('Inbox', 'inbox', ?, ?)`)
      .run('2026-10-01T00:00:00.000Z', 'other-account');
    db.prepare(
      `INSERT INTO "note" (text, created, topic_id, source, ai_confidence, client_id, pinned, account_id)
       VALUES (?, ?, ?, 'manual', NULL, NULL, 0, ?)`,
    ).run(
      'lantern hidden quicksilver ledger',
      '2026-11-02T00:00:00.000Z',
      Number(fremdThema.lastInsertRowid),
      'other-account',
    );

    const liste = await treffer(server, 'lantern');
    expect(liste.status).toBe(200);
    expect(liste.hits.map((hit) => hit.topic)).toEqual(['Work', 'Home', 'Inbox']);
    expect(liste.hits[0]?.text).toContain('50%');
    expect(liste.hits[1]?.text.includes('tailmarker')).toBe(true);
    expect(liste.hits[1]?.text.endsWith('...')).toBe(false);
    expect(liste.hits.some((hit) => hit.text.includes('quicksilver'))).toBe(false);

    const sonder = await treffer(server, '(draft)');
    expect(sonder.status).toBe(200);
    expect(sonder.hits).toHaveLength(1);
    expect(sonder.hits[0]?.topic).toBe('Work');

    const prozent = await treffer(server, '50%');
    expect(prozent.hits).toHaveLength(1);

    const zeichen = await treffer(server, '*** (" : OR text:secret');
    expect(zeichen.status).toBe(200);
    expect(zeichen.hits).toEqual([]);

    const fremd = await treffer(server, 'quicksilver');
    expect(fremd.hits).toEqual([]);
    expect(sucheNotizen(db, 'quicksilver', 'other-account')).toHaveLength(1);
    expect(sucheNotizen(db, 'quicksilver', PROBE_KONTO)).toEqual([]);
    indexGanz(db);
  });

  it('returns at most the newest matches', async () => {
    const { server, db } = await app();
    const ids: number[] = [];
    for (let index = 0; index <= SUCH_LIMIT; index += 1) {
      ids.push(await lege(server, `needle ${index}`));
    }
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      db.prepare('UPDATE "note" SET created = ? WHERE id = ?').run(
        new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
        id,
      );
    }
    const liste = await treffer(server, 'needle');
    expect(liste.hits).toHaveLength(SUCH_LIMIT);
    expect(liste.hits[0]?.text).toBe(`# needle ${SUCH_LIMIT}`);
    expect(liste.hits.at(-1)?.text).toBe('# needle 1');
    expect(liste.hits.some((hit) => hit.text === '# needle 0')).toBe(false);
  });

  it('follows filing, editing, moving, topic changes, delete, and undo', async () => {
    const { server, db } = await app();
    const id = await lege(server, 'Lantern in the shop #Shop');
    await lege(server, 'A quiet shelf #Shelf');

    const zuerst = await treffer(server, 'lantern');
    expect(zuerst.hits).toEqual([expect.objectContaining({ id, topic: 'Shop', text: '# Lantern in the shop' })]);

    const edit = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}`,
      payload: { text: 'Only the budget remains', version: 1 },
    });
    expect(edit.statusCode).toBe(200);
    expect((await treffer(server, 'lantern')).hits).toEqual([]);
    expect((await treffer(server, 'budget')).hits).toEqual([
      expect.objectContaining({ id, topic: 'Shop', text: 'Only the budget remains' }),
    ]);

    const verschoben = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}/move`,
      payload: { topic: 'Home' },
    });
    expect(verschoben.statusCode).toBe(200);
    expect((await treffer(server, 'budget')).hits[0]?.topic).toBe('Home');

    const neu = await server.inject({
      method: 'POST',
      url: '/api/topics/rename',
      payload: { name: 'Home', next: 'House' },
    });
    expect(neu.statusCode).toBe(200);
    expect((await treffer(server, 'budget')).hits[0]?.topic).toBe('House');

    const zusammen = await server.inject({
      method: 'POST',
      url: '/api/topics/merge',
      payload: { name: 'House', into: 'Shelf' },
    });
    expect(zusammen.statusCode).toBe(200);
    expect((await treffer(server, 'budget')).hits).toHaveLength(1);
    expect((await treffer(server, 'budget')).hits[0]?.topic).toBe('Shelf');

    const geloescht = await server.inject({
      method: 'POST',
      url: '/api/topics/delete',
      payload: { name: 'Shelf' },
    });
    expect(geloescht.statusCode).toBe(200);
    expect((await treffer(server, 'budget')).hits[0]?.topic).toBe('Inbox');
    const themaToken = (geloescht.json() as { token: string }).token;
    const themaZurueck = await server.inject({
      method: 'POST',
      url: '/api/topics/undo',
      payload: { token: themaToken },
    });
    expect(themaZurueck.statusCode).toBe(200);
    expect((await treffer(server, 'budget')).hits[0]?.topic).toBe('Shelf');

    const weg = await server.inject({ method: 'POST', url: `/api/notes/${id}/delete` });
    expect(weg.statusCode).toBe(200);
    expect((await treffer(server, 'budget')).hits).toEqual([]);
    const notizToken = (weg.json() as { token: string }).token;
    const notizZurueck = await server.inject({
      method: 'POST',
      url: '/api/notes/undo',
      payload: { token: notizToken },
    });
    expect(notizZurueck.statusCode).toBe(200);
    expect((await treffer(server, 'budget')).hits).toEqual([
      expect.objectContaining({ id, topic: 'Shelf' }),
    ]);
    indexGanz(db);
  });

  it('indexes notes that were already stored before the search index existed', () => {
    const db = new DatabaseSync(SPEICHER);
    dbs.push(db);
    db.exec('PRAGMA foreign_keys = OFF');
    for (let index = 0; index < 5; index += 1) db.exec(migrationsSql(index));
    db.exec('PRAGMA user_version = 5');
    db.exec('PRAGMA foreign_keys = ON');
    const inbox = db.prepare(`SELECT id FROM "topic" WHERE name_key = 'inbox'`).get() as { id: number };
    db.prepare('UPDATE "topic" SET account_id = ? WHERE id = ?').run('konto', inbox.id);
    db.prepare(
      `INSERT INTO "note" (text, created, topic_id, source, ai_confidence, client_id, pinned, account_id)
       VALUES (?, ?, ?, 'manual', NULL, NULL, 0, NULL)`,
    ).run('already filed lantern', '2026-10-01T00:00:00.000Z', inbox.id);
    migriere(db);
    db.prepare('UPDATE "note" SET account_id = ? WHERE account_id IS NULL').run('konto');
    const treffer = sucheNotizen(db, 'lantern', 'konto');
    expect(treffer).toHaveLength(1);
    expect(treffer[0]).toMatchObject({ text: '# already filed lantern', topic: 'Inbox' });
    expect(sucheNotizen(db, 'lantern', 'other-account')).toEqual([]);
    const trigger = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'note_fts_%' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(trigger.map((zeile) => zeile.name)).toEqual(['note_fts_delete', 'note_fts_insert', 'note_fts_update']);
    indexGanz(db);
  });
});
