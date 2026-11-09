import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { NOTE_TEXT_MAX, SPEICHER } from '../../../shared/kern/grenzen.ts';
import { oeffneDatenbank } from '../../kern/db.ts';
import { oeffneAngemeldet } from '../zugang/attrappe.ts';
import { dokumentAusText, spalteAusText, textAusSpalte } from './lesen.ts';

interface NotizFest {
  id: number;
  doc: string;
  created: string;
  topic_id: number;
  source: string;
  ai_confidence: number | null;
  client_id: string | null;
  pinned: number;
}

interface KorrekturFest {
  id: number;
  note_id: number;
  from_topic_id: number;
  to_topic_id: number;
  created: string;
}

describe('note edit and delete', () => {
  const dbs: DatabaseSync[] = [];
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    for (const app of apps) await app.close();
    for (const db of dbs) db.close();
    apps.length = 0;
    dbs.length = 0;
  });

  async function paar(): Promise<{ server: FastifyInstance; db: DatabaseSync }> {
    const db = oeffneDatenbank(SPEICHER);
    dbs.push(db);
    const server = await oeffneAngemeldet(db);
    apps.push(server);
    return { server, db };
  }

  function fest(db: DatabaseSync, id: number): NotizFest {
    return db
      .prepare(
        `SELECT id, doc, created, topic_id, source, ai_confidence, client_id, pinned
         FROM "note" WHERE id = ?`,
      )
      .get(id) as unknown as NotizFest;
  }

  function korrekturen(db: DatabaseSync): KorrekturFest[] {
    return db
      .prepare('SELECT id, note_id, from_topic_id, to_topic_id, created FROM "correction" ORDER BY id')
      .all() as unknown as KorrekturFest[];
  }

  async function notiz(server: FastifyInstance, text: string): Promise<number> {
    const antwort = await server.inject({ method: 'POST', url: '/api/notes', payload: { text } });
    expect(antwort.statusCode).toBe(201);
    return antwort.json().id as number;
  }

  it('saves trimmed text and leaves topic, time, pin, and corrections alone', async () => {
    const { server, db } = await paar();
    const id = await notiz(server, '#Work\nCall tomorrow');
    const verschoben = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}/move`,
      payload: { topic: 'Inbox' },
    });
    expect(verschoben.statusCode).toBe(200);
    const vorher = fest(db, id);
    const korrekturVorher = korrekturen(db);
    expect(vorher.pinned).toBe(1);
    expect(korrekturVorher).toHaveLength(1);

    const gleich = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}`,
      payload: { text: textAusSpalte(vorher.doc), version: 1 },
    });
    expect(gleich.statusCode).toBe(200);
    expect(fest(db, id)).toEqual(vorher);

    const gespeichert = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}`,
      payload: { text: '  Call tomorrow, bring the notes  ', version: 1 },
    });
    expect(gespeichert.statusCode).toBe(200);
    expect(gespeichert.json()).toMatchObject({ id, text: 'Call tomorrow, bring the notes  ', topic: 'Inbox' });
    const nachher = fest(db, id);
    expect(nachher).toEqual({ ...vorher, doc: spalteAusText('Call tomorrow, bring the notes  ') });
    expect(korrekturen(db)).toEqual(korrekturVorher);
  });

  it('rejects an empty, mistyped, or unknown note without writing', async () => {
    const { server, db } = await paar();
    const id = await notiz(server, 'Keep me');
    const vorher = fest(db, id);
    const leer = await server.inject({ method: 'POST', url: `/api/notes/${id}`, payload: { text: '  \n  ', version: 1 } });
    expect(leer.statusCode).toBe(400);
    expect(leer.json()).toEqual({ error: 'Write something to save.' });
    expect(fest(db, id)).toEqual(vorher);
    expect((await server.inject({ method: 'POST', url: `/api/notes/${id}`, payload: { text: 4 } })).statusCode).toBe(400);
    expect(
      (await server.inject({ method: 'POST', url: `/api/notes/${id}`, payload: { text: 'Hi', extra: true } })).statusCode,
    ).toBe(400);
    expect(
      (await server.inject({ method: 'POST', url: `/api/notes/${id}`, payload: { text: 'a'.repeat(NOTE_TEXT_MAX + 1) } }))
        .statusCode,
    ).toBe(400);
    expect((await server.inject({ method: 'POST', url: '/api/notes/99', payload: { text: 'Missing', version: 1 } })).statusCode).toBe(
      404,
    );
    expect(fest(db, id)).toEqual(vorher);
    const gelesen = await server.inject({ method: 'GET', url: `/api/notes/${id}` });
    expect(gelesen.statusCode).toBe(200);
    expect(gelesen.json()).toMatchObject({ id, text: 'Keep me' });
    expect((await server.inject({ method: 'GET', url: '/api/notes/nope' })).statusCode).toBe(404);
  });

  it('deletes a note and undo restores text, topic, time, pin, and corrections', async () => {
    const { server, db } = await paar();
    const id = await notiz(server, '#Work\nPinned thought');
    const clientId = randomUUID();
    const created = '2026-10-28T08:20:00.000Z';
    db.prepare('UPDATE "note" SET created = ?, source = ?, ai_confidence = ?, client_id = ?, pinned = 1 WHERE id = ?').run(
      created,
      'ai',
      0.4,
      clientId,
      id,
    );
    const thema = db.prepare('SELECT id FROM "topic" WHERE name_key = ?').get('work') as { id: number };
    const inbox = db.prepare('SELECT id FROM "topic" WHERE name_key = ?').get('inbox') as { id: number };
    db.prepare(
      'INSERT INTO "correction" (id, note_id, from_topic_id, to_topic_id, created) VALUES (?, ?, ?, ?, ?)',
    ).run(7, id, inbox.id, thema.id, '2026-10-28T09:00:00.000Z');
    const themaToken = randomUUID();
    db.prepare('INSERT INTO "topic_undo" (token, payload, created) VALUES (?, ?, ?)').run(
      themaToken,
      '{}',
      '2026-01-01T00:00:00.000Z',
    );
    const vorher = fest(db, id);
    const korrekturVorher = korrekturen(db);

    const weg = await server.inject({ method: 'POST', url: `/api/notes/${id}/delete` });
    expect(weg.statusCode).toBe(200);
    const token = weg.json().token as string;
    expect(db.prepare('SELECT id FROM "note" WHERE id = ?').get(id)).toBeUndefined();
    expect(korrekturen(db)).toEqual([]);
    expect(db.prepare('SELECT token FROM "topic_undo"').all()).toEqual([{ token: themaToken }]);
    const liste = await server.inject({ method: 'GET', url: '/api/library/notes?topic=Work' });
    expect(liste.json().notes).toEqual([]);

    const zurueck = await server.inject({ method: 'POST', url: '/api/notes/undo', payload: { token } });
    expect(zurueck.statusCode).toBe(200);
    expect(zurueck.json()).toMatchObject({ id, text: 'Pinned thought', topic: 'Work', source: 'ai', aiConfidence: 0.4 });
    expect(zurueck.json()).not.toHaveProperty('erfasst');
    expect(fest(db, id)).toEqual(vorher);
    expect(korrekturen(db)).toEqual(korrekturVorher);
    expect(db.prepare('SELECT token FROM "topic_undo"').all()).toEqual([{ token: themaToken }]);
    expect((await server.inject({ method: 'POST', url: '/api/notes/undo', payload: { token } })).statusCode).toBe(404);

    const nochmal = await server.inject({ method: 'POST', url: `/api/notes/${id}/delete` });
    const alt = await server.inject({ method: 'POST', url: '/api/notes/undo', payload: { token } });
    expect(alt.statusCode).toBe(404);
    const neu = await server.inject({
      method: 'POST',
      url: '/api/notes/undo',
      payload: { token: nochmal.json().token },
    });
    expect(neu.statusCode).toBe(200);
    expect(fest(db, id)).toEqual(vorher);
  });

  it('undo fails when the note or its topic cannot be restored', async () => {
    const { server, db } = await paar();
    const id = await notiz(server, '#Work\nGone');
    const weg = await server.inject({ method: 'POST', url: `/api/notes/${id}/delete` });
    const token = weg.json().token as string;
    db.prepare('DELETE FROM "topic" WHERE name_key = ?').run('work');
    const ohneThema = await server.inject({ method: 'POST', url: '/api/notes/undo', payload: { token } });
    expect(ohneThema.statusCode).toBe(409);
    expect(db.prepare('SELECT id FROM "note"').all()).toEqual([]);
    expect((await server.inject({ method: 'POST', url: '/api/notes/undo', payload: { token: 'nope' } })).statusCode).toBe(
      400,
    );
    expect((await server.inject({ method: 'POST', url: '/api/notes/9/delete' })).statusCode).toBe(404);
  });

  it('rounds a document through create, read, move, save, and undo', async () => {
    const { server, db } = await paar();
    const doc = dokumentAusText('Round trip note');
    const angelegt = await server.inject({ method: 'POST', url: '/api/notes', payload: { doc } });
    expect(angelegt.statusCode).toBe(201);
    const id = angelegt.json().id as number;
    expect(angelegt.json()).toMatchObject({ text: 'Round trip note', doc, topic: 'Inbox' });
    const gelesen = await server.inject({ method: 'GET', url: `/api/notes/${id}` });
    expect(gelesen.statusCode).toBe(200);
    expect(gelesen.json()).toMatchObject({ id, text: 'Round trip note', doc });
    const verschoben = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}/move`,
      payload: { topic: 'Home' },
    });
    expect(verschoben.statusCode).toBe(200);
    expect(verschoben.json()).toMatchObject({ id, text: 'Round trip note', doc, topic: 'Home' });
    const neu = dokumentAusText('Updated round trip');
    const gespeichert = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}`,
      payload: { doc: neu, version: 1 },
    });
    expect(gespeichert.statusCode).toBe(200);
    expect(gespeichert.json()).toMatchObject({ id, text: 'Updated round trip', doc: neu, topic: 'Home' });
    const weg = await server.inject({ method: 'POST', url: `/api/notes/${id}/delete` });
    expect(weg.statusCode).toBe(200);
    const zurueck = await server.inject({
      method: 'POST',
      url: '/api/notes/undo',
      payload: { token: weg.json().token },
    });
    expect(zurueck.statusCode).toBe(200);
    expect(zurueck.json()).toMatchObject({ id, text: 'Updated round trip', doc: neu, topic: 'Home' });
    expect((db.prepare('SELECT doc FROM "note" WHERE id = ?').get(id) as { doc: string }).doc).toBe(
      spalteAusText('Updated round trip'),
    );
  });

  it('rejects a broken document and still accepts text', async () => {
    const { server, db } = await paar();
    const kaputt = await server.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { doc: { schema_version: 1, type: 'doc', content: 'nope' } },
    });
    expect(kaputt.statusCode).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS n FROM "note"').get()).toEqual({ n: 0 });
    const beides = await server.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { text: 'Buy milk', doc: { schema_version: 99, type: 'doc', content: [] } },
    });
    expect(beides.statusCode).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS n FROM "note"').get()).toEqual({ n: 0 });
    const text = await server.inject({ method: 'POST', url: '/api/notes', payload: { text: 'Buy milk' } });
    expect(text.statusCode).toBe(201);
    expect(text.json()).toMatchObject({ text: 'Buy milk', doc: dokumentAusText('Buy milk') });
    const id = text.json().id as number;
    const schlecht = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}`,
      payload: { doc: { type: 'doc' }, version: 1 },
    });
    expect(schlecht.statusCode).toBe(400);
    expect(textAusSpalte((db.prepare('SELECT doc FROM "note" WHERE id = ?').get(id) as { doc: string }).doc)).toBe(
      'Buy milk',
    );
  });
});
