import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { TOPIC_NAME_MAX, SPEICHER } from '../../../shared/kern/grenzen.ts';
import { oeffneDatenbank } from '../../kern/db.ts';
import { oeffneAngemeldet } from '../zugang/attrappe.ts';

function bestand(db: DatabaseSync) {
  return {
    topics: db.prepare('SELECT id, name, name_key, created FROM "topic" ORDER BY id').all(),
    notes: db
      .prepare(
        'SELECT id, text, created, topic_id, source, ai_confidence, client_id, pinned FROM "note" ORDER BY id',
      )
      .all(),
    corrections: db
      .prepare('SELECT id, note_id, from_topic_id, to_topic_id, created FROM "correction" ORDER BY id')
      .all(),
  };
}

describe('topic maintenance api', () => {
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

  async function lege(server: FastifyInstance, text: string): Promise<number> {
    const antwort = await server.inject({ method: 'POST', url: '/api/notes', payload: { text } });
    expect(antwort.statusCode).toBe(201);
    return (antwort.json() as { id: number }).id;
  }

  async function verschiebe(server: FastifyInstance, id: number, topic: string): Promise<void> {
    const antwort = await server.inject({ method: 'POST', url: `/api/notes/${id}/move`, payload: { topic } });
    expect(antwort.statusCode).toBe(200);
  }

  it('renames a topic, keeps its notes, and rejects empty, duplicate, and reserved names', async () => {
    const { server, db } = await paar();
    const id = await lege(server, '#Books\nChapter');
    const vorher = bestand(db);
    const gleich = await server.inject({
      method: 'POST',
      url: '/api/topics/rename',
      payload: { name: 'books', next: '  Books  ' },
    });
    expect(gleich.statusCode).toBe(200);
    expect(gleich.json()).toEqual({ topic: 'Books' });
    expect(bestand(db)).toEqual(vorher);

    const gross = await server.inject({
      method: 'POST',
      url: '/api/topics/rename',
      payload: { name: 'Books', next: 'BOOKS' },
    });
    expect(gross.statusCode).toBe(200);
    expect(gross.json()).toEqual({ topic: 'BOOKS' });
    const zeile = db.prepare('SELECT id, name, name_key, created FROM "topic" WHERE name = ?').get('BOOKS') as {
      id: number;
      name_key: string;
      created: string;
    };
    const alt = (vorher.topics as Array<{ name: string; id: number; created: string }>).find((thema) => thema.name === 'Books');
    expect(zeile.id).toBe(alt?.id);
    expect(zeile.name_key).toBe('books');
    expect(zeile.created).toBe(alt?.created);
    expect((bestand(db).notes as Array<{ id: number; topic_id: number }>).find((notiz) => notiz.id === id)?.topic_id).toBe(
      zeile.id,
    );

    const studio = await server.inject({
      method: 'POST',
      url: '/api/topics/rename',
      payload: { name: 'BOOKS', next: '  Side \u2013 Project  ' },
    });
    expect(studio.statusCode).toBe(200);
    expect(studio.json()).toEqual({ topic: 'Side \u2013 Project' });

    await lege(server, '#Home\nDesk');
    const doppelt = await server.inject({
      method: 'POST',
      url: '/api/topics/rename',
      payload: { name: 'Side \u2013 Project', next: 'home' },
    });
    expect(doppelt.statusCode).toBe(409);
    expect(doppelt.json()).toEqual({ error: 'A topic with this name already exists.' });
    expect(db.prepare('SELECT name FROM "topic" WHERE name_key = ?').get('side \u2013 project')).toEqual({
      name: 'Side \u2013 Project',
    });

    const faelle: Array<{ next: string; status: number; error: string }> = [
      { next: '   ', status: 400, error: 'Enter a name.' },
      { next: 'Inbox', status: 400, error: 'That name is reserved.' },
      { next: 'inbox', status: 400, error: 'That name is reserved.' },
      { next: '!!!', status: 400, error: 'The topic name is missing or invalid.' },
      { next: 'a'.repeat(TOPIC_NAME_MAX + 1), status: 400, error: 'The topic name is missing or invalid.' },
    ];
    for (const fall of faelle) {
      const antwort = await server.inject({
        method: 'POST',
        url: '/api/topics/rename',
        payload: { name: 'Side \u2013 Project', next: fall.next },
      });
      expect(antwort.statusCode).toBe(fall.status);
      expect(antwort.json()).toEqual({ error: fall.error });
    }
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/topics/rename',
          payload: { name: 'Missing', next: 'Studio' },
        })
      ).statusCode,
    ).toBe(404);
    const gesperrt = await server.inject({
      method: 'POST',
      url: '/api/topics/rename',
      payload: { name: 'Inbox', next: 'Post' },
    });
    expect(gesperrt.statusCode).toBe(400);
    expect(gesperrt.json()).toEqual({ error: 'Inbox cannot be changed.' });
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/topics/rename',
          payload: { name: 'Side \u2013 Project', next: 'Studio', extra: true },
        })
      ).statusCode,
    ).toBe(400);
    expect(db.prepare('SELECT name FROM "topic" WHERE name_key = ?').get('side \u2013 project')).toEqual({
      name: 'Side \u2013 Project',
    });
  });

  it('merges every note into the target and undo restores the rows', async () => {
    const { server, db } = await paar();
    const bleib = await lege(server, '#Ideas\nKeep this');
    const fest = await lege(server, 'Pinned thought');
    await verschiebe(server, fest, 'Work');
    const clientId = randomUUID();
    db.prepare(
      'UPDATE "note" SET source = ?, ai_confidence = ?, client_id = ?, pinned = ?, created = ? WHERE id = ?',
    ).run('ai', 0.4, clientId, 1, '2026-10-02T08:00:00.000Z', fest);
    const lose = await lege(server, '#Work\nLoose');
    const vorher = bestand(db);
    const workId = (vorher.topics as Array<{ id: number; name: string }>).find((thema) => thema.name === 'Work')?.id;

    const antwort = await server.inject({
      method: 'POST',
      url: '/api/topics/merge',
      payload: { name: 'work', into: 'ideas' },
    });
    expect(antwort.statusCode).toBe(200);
    const koerper = antwort.json() as { token: string; from: string; into: string; count: number };
    expect(koerper).toMatchObject({ from: 'Work', into: 'Ideas', count: 2 });
    expect(db.prepare('SELECT id FROM "topic" WHERE name = ?').get('Work')).toBeUndefined();
    const ideen = db.prepare('SELECT id FROM "topic" WHERE name = ?').get('Ideas') as { id: number };
    const gewandert = db.prepare('SELECT topic_id, pinned, source, ai_confidence, client_id, text FROM "note" WHERE id = ?').get(
      fest,
    ) as { topic_id: number; pinned: number; source: string; ai_confidence: number; client_id: string; text: string };
    expect(gewandert).toEqual({
      topic_id: ideen.id,
      pinned: 1,
      source: 'ai',
      ai_confidence: 0.4,
      client_id: clientId,
      text: '# Pinned thought',
    });
    expect((db.prepare('SELECT topic_id FROM "note" WHERE id = ?').get(lose) as { topic_id: number }).topic_id).toBe(
      ideen.id,
    );
    expect((db.prepare('SELECT topic_id FROM "note" WHERE id = ?').get(bleib) as { topic_id: number }).topic_id).toBe(
      ideen.id,
    );
    expect((db.prepare('SELECT COUNT(*) AS anzahl FROM "correction"').get() as { anzahl: number }).anzahl).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS anzahl FROM "note"').get() as { anzahl: number }).anzahl).toBe(3);

    const bibliothek = await server.inject({ method: 'GET', url: '/api/library' });
    expect(bibliothek.json()).toMatchObject({
      topics: [{ name: 'Ideas', count: 3 }],
    });
    expect((await server.inject({ method: 'GET', url: '/api/library/notes?topic=Work' })).statusCode).toBe(404);

    const zurueck = await server.inject({ method: 'POST', url: '/api/topics/undo', payload: { token: koerper.token } });
    expect(zurueck.statusCode).toBe(200);
    expect(zurueck.json()).toEqual({ topic: 'Work' });
    expect(bestand(db)).toEqual(vorher);
    expect((db.prepare('SELECT id FROM "topic" WHERE name = ?').get('Work') as { id: number }).id).toBe(workId);
    expect((await server.inject({ method: 'POST', url: '/api/topics/undo', payload: { token: koerper.token } })).statusCode).toBe(
      404,
    );
    expect((await server.inject({ method: 'POST', url: '/api/topics/undo', payload: { token: koerper.token } })).json()).toEqual({
      error: 'Nothing to undo.',
    });
  });

  it('deletes a topic into Inbox and undo restores notes and corrections', async () => {
    const { server, db } = await paar();
    const daheim = await lege(server, '#Home\nStays');
    const weg = await lege(server, '#Work\nWas in work');
    await verschiebe(server, weg, 'Home');
    const bleib = await lege(server, '#Work\nGoes to inbox');
    db.prepare('UPDATE "note" SET created = ? WHERE id = ?').run('2026-10-28T08:20:00.000Z', bleib);
    const vorher = bestand(db);
    const inboxVorher = (vorher.topics as Array<{ id: number; name: string }>).find((thema) => thema.name === 'Inbox')?.id;

    const antwort = await server.inject({ method: 'POST', url: '/api/topics/delete', payload: { name: 'WORK' } });
    expect(antwort.statusCode).toBe(200);
    const koerper = antwort.json() as { token: string; topic: string; count: number };
    expect(koerper).toMatchObject({ topic: 'Work', count: 1 });
    expect(db.prepare('SELECT id FROM "topic" WHERE name_key = ?').get('work')).toBeUndefined();
    expect((db.prepare('SELECT topic_id FROM "note" WHERE id = ?').get(bleib) as { topic_id: number }).topic_id).toBe(
      inboxVorher,
    );
    expect((db.prepare('SELECT topic_id, pinned FROM "note" WHERE id = ?').get(weg) as { topic_id: number; pinned: number })).toEqual(
      {
        topic_id: (vorher.topics as Array<{ id: number; name: string }>).find((thema) => thema.name === 'Home')?.id,
        pinned: 1,
      },
    );
    expect((db.prepare('SELECT topic_id FROM "note" WHERE id = ?').get(daheim) as { topic_id: number }).topic_id).toBe(
      (vorher.topics as Array<{ id: number; name: string }>).find((thema) => thema.name === 'Home')?.id,
    );
    expect((db.prepare('SELECT COUNT(*) AS anzahl FROM "correction"').get() as { anzahl: number }).anzahl).toBe(0);
    const liste = await server.inject({ method: 'GET', url: '/api/library' });
    expect(liste.json()).toMatchObject({
      inbox: { name: 'Inbox', count: 1 },
      topics: [{ name: 'Home', count: 2 }],
    });

    const zurueck = await server.inject({ method: 'POST', url: '/api/topics/undo', payload: { token: koerper.token } });
    expect(zurueck.statusCode).toBe(200);
    expect(bestand(db)).toEqual(vorher);
    const wieder = await server.inject({ method: 'GET', url: '/api/library/notes?topic=Work' });
    expect(wieder.json()).toMatchObject({
      topic: 'Work',
      notes: [{ id: bleib, text: '# Goes to inbox', created: '2026-10-28T08:20:00.000Z' }],
    });
  });

  it('keeps only the latest undo and refuses Inbox, itself, and unknown targets', async () => {
    const { server, db } = await paar();
    await lege(server, '#Books\nOne');
    await lege(server, '#Home\nTwo');
    const erstes = await server.inject({ method: 'POST', url: '/api/topics/delete', payload: { name: 'Books' } });
    const zweites = await server.inject({ method: 'POST', url: '/api/topics/delete', payload: { name: 'Home' } });
    const alt = (erstes.json() as { token: string }).token;
    const neu = (zweites.json() as { token: string }).token;
    expect((await server.inject({ method: 'POST', url: '/api/topics/undo', payload: { token: alt } })).statusCode).toBe(404);
    expect((await server.inject({ method: 'POST', url: '/api/topics/undo', payload: { token: neu } })).statusCode).toBe(200);
    expect(db.prepare('SELECT name FROM "topic" WHERE name = ?').get('Books')).toBeUndefined();
    expect(db.prepare('SELECT name FROM "topic" WHERE name = ?').get('Home')).toEqual({ name: 'Home' });

    await lege(server, '#Work\nThree');
    const vorher = bestand(db);
    const faelle = [
      { url: '/api/topics/delete', payload: { name: 'Inbox' }, status: 400, error: 'Inbox cannot be changed.' },
      { url: '/api/topics/merge', payload: { name: 'Inbox', into: 'Home' }, status: 400, error: 'Inbox cannot be changed.' },
      { url: '/api/topics/merge', payload: { name: 'Work', into: 'work' }, status: 400, error: 'Choose a different topic.' },
      { url: '/api/topics/merge', payload: { name: 'Work', into: 'Inbox' }, status: 400, error: 'That name is reserved.' },
      { url: '/api/topics/merge', payload: { name: 'Work', into: 'Nope' }, status: 404, error: 'Topic not found.' },
      { url: '/api/topics/merge', payload: { name: 'Missing', into: 'Home' }, status: 404, error: 'Topic not found.' },
      { url: '/api/topics/delete', payload: { name: 'Missing' }, status: 404, error: 'Topic not found.' },
      { url: '/api/topics/merge', payload: { name: 'Work', into: '!!!' }, status: 400, error: 'The topic name is missing or invalid.' },
      { url: '/api/topics/undo', payload: { token: 'not-a-token' }, status: 400, error: 'Nothing to undo.' },
    ];
    for (const fall of faelle) {
      const antwort = await server.inject({ method: 'POST', url: fall.url, payload: fall.payload });
      expect(antwort.statusCode).toBe(fall.status);
      expect(antwort.json()).toEqual({ error: fall.error });
    }
    expect(bestand(db)).toEqual(vorher);
  });
});
