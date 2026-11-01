import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { NOTE_TEXT_MAX, TOPIC_NAME_MAX, SPEICHER } from '../../../shared/kern/grenzen.ts';
import { oeffneDatenbank } from '../../kern/db.ts';
import { oeffneAngemeldet } from '../zugang/attrappe.ts';

describe('filing api', () => {
  const dbs: DatabaseSync[] = [];
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    for (const app of apps) await app.close();
    for (const db of dbs) db.close();
    apps.length = 0;
    dbs.length = 0;
  });

  async function app(): Promise<FastifyInstance> {
    const db = oeffneDatenbank(SPEICHER);
    dbs.push(db);
    const gebaut = await oeffneAngemeldet(db);
    apps.push(gebaut);
    return gebaut;
  }

  async function post(server: FastifyInstance, text: unknown, extra?: Record<string, unknown>) {
    return server.inject({
      method: 'POST',
      url: '/api/notes',
      payload: extra ? { text, ...extra } : { text },
    });
  }

  it('files a note without a tag in the Inbox', async () => {
    const server = await app();
    const antwort = await post(server, '  Buy milk  ');
    expect(antwort.statusCode).toBe(201);
    expect(antwort.json()).toMatchObject({
      text: 'Buy milk',
      topic: 'Inbox',
      source: 'manual',
      aiConfidence: null,
    });
    const themen = await server.inject({ method: 'GET', url: '/api/topics' });
    expect(themen.json()).toEqual({ topics: [{ name: 'Inbox', count: 1 }] });
  });

  it('creates an unknown topic, strips the tag, and counts notes', async () => {
    const server = await app();
    const erste = await post(server, 'Call #Garten tomorrow');
    expect(erste.statusCode).toBe(201);
    expect(erste.json()).toMatchObject({ text: 'Call tomorrow', topic: 'Garten', source: 'tag' });
    const zweite = await post(server, 'Again #garten');
    expect(zweite.json()).toMatchObject({ text: 'Again', topic: 'Garten', source: 'tag' });
    const themen = await server.inject({ method: 'GET', url: '/api/topics' });
    expect(themen.json()).toEqual({
      topics: [
        { name: 'Garten', count: 2 },
        { name: 'Inbox', count: 0 },
      ],
    });
  });

  it('uses the first tag and resolves a prefix to the busiest topic', async () => {
    const server = await app();
    for (let index = 0; index < 3; index += 1) {
      const antwort = await post(server, `n ${index} #Work`);
      expect(antwort.statusCode).toBe(201);
    }
    await post(server, 'one #Workout');
    const abgelegt = await post(server, 'Fix #wo and #home');
    expect(abgelegt.json()).toMatchObject({ text: 'Fix and #home', topic: 'Work', source: 'tag' });
  });

  it('rejects empty, mistyped, and oversized notes', async () => {
    const server = await app();
    expect((await post(server, '   ')).statusCode).toBe(400);
    expect((await post(server, '   ')).json()).toEqual({ error: 'Write something to file.' });
    expect((await post(server, 12)).statusCode).toBe(400);
    expect((await post(server, 'hi', { extra: true })).statusCode).toBe(400);
    expect((await post(server, 'a'.repeat(NOTE_TEXT_MAX + 1))).statusCode).toBe(400);
    const themen = await server.inject({ method: 'GET', url: '/api/topics' });
    expect(themen.json()).toEqual({ topics: [{ name: 'Inbox', count: 0 }] });
  });

  async function paar(): Promise<{ server: FastifyInstance; db: DatabaseSync }> {
    const server = await app();
    const db = dbs.at(-1);
    if (!db) throw new Error('Missing database.');
    return { server, db };
  }

  it('returns the original note when the same client id is sent again', async () => {
    const { server, db } = await paar();
    const clientId = randomUUID();
    const erste = await server.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { text: 'Buy milk', clientId },
    });
    expect(erste.statusCode).toBe(201);
    const zweite = await server.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { text: 'Different #Home', clientId },
    });
    expect(zweite.statusCode).toBe(200);
    expect(zweite.json()).toMatchObject({
      id: erste.json().id,
      text: 'Buy milk',
      topic: 'Inbox',
      source: 'manual',
    });
    const anzahl = db.prepare('SELECT COUNT(*) AS anzahl FROM note').get() as { anzahl: number };
    expect(anzahl.anzahl).toBe(1);
    const fest = db.prepare('SELECT pinned FROM note').get() as { pinned: number };
    expect(fest.pinned).toBe(0);
    expect((await post(server, 'nope', { clientId: 'not-a-uuid' })).statusCode).toBe(400);
  });

  it('moves a note, records the correction, and pins it', async () => {
    const { server, db } = await paar();
    const abgelegt = await post(server, 'Call tomorrow #Home');
    const id = abgelegt.json().id as number;
    const gleich = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}/move`,
      payload: { topic: 'home' },
    });
    expect(gleich.statusCode).toBe(200);
    expect(gleich.json()).toMatchObject({ topic: 'Home', source: 'tag', text: 'Call tomorrow' });
    expect((db.prepare('SELECT COUNT(*) AS anzahl FROM correction').get() as { anzahl: number }).anzahl).toBe(0);

    const verschoben = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}/move`,
      payload: { topic: 'Travel \u2013 Lisbon' },
    });
    expect(verschoben.statusCode).toBe(200);
    expect(verschoben.json()).toMatchObject({ id, topic: 'Travel \u2013 Lisbon', source: 'tag' });
    const pin = db.prepare('SELECT pinned FROM note WHERE id = ?').get(id) as { pinned: number };
    expect(pin.pinned).toBe(1);
    const korrektur = db
      .prepare('SELECT from_topic_id, to_topic_id FROM correction WHERE note_id = ?')
      .all(id) as Array<{ from_topic_id: number; to_topic_id: number }>;
    expect(korrektur).toHaveLength(1);
    const von = db.prepare('SELECT name FROM topic WHERE id = ?').get(korrektur[0]?.from_topic_id) as { name: string };
    const nach = db.prepare('SELECT name FROM topic WHERE id = ?').get(korrektur[0]?.to_topic_id) as { name: string };
    expect(von.name).toBe('Home');
    expect(nach.name).toBe('Travel \u2013 Lisbon');

    const nochmal = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}/move`,
      payload: { topic: 'Inbox' },
    });
    expect(nochmal.json()).toMatchObject({ topic: 'Inbox' });
    expect((db.prepare('SELECT COUNT(*) AS anzahl FROM correction').get() as { anzahl: number }).anzahl).toBe(2);
    expect((db.prepare('SELECT pinned FROM note WHERE id = ?').get(id) as { pinned: number }).pinned).toBe(1);

    const themen = await server.inject({ method: 'GET', url: '/api/topics' });
    expect(themen.json().topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Inbox', count: 1 }),
        expect.objectContaining({ name: 'Home', count: 0 }),
        expect.objectContaining({ name: 'Travel \u2013 Lisbon', count: 0 }),
      ]),
    );
  });

  it('rejects a bad move and leaves the note where it is', async () => {
    const { server, db } = await paar();
    const abgelegt = await post(server, 'Buy milk');
    const id = abgelegt.json().id as number;
    expect((await server.inject({ method: 'POST', url: '/api/notes/0/move', payload: { topic: 'Home' } })).statusCode).toBe(404);
    expect((await server.inject({ method: 'POST', url: '/api/notes/nope/move', payload: { topic: 'Home' } })).statusCode).toBe(404);
    expect((await server.inject({ method: 'POST', url: '/api/notes/999/move', payload: { topic: 'Home' } })).statusCode).toBe(404);
    expect(
      (await server.inject({ method: 'POST', url: `/api/notes/${id}/move`, payload: { topic: '   ' } })).json(),
    ).toEqual({ error: 'The topic name is missing or invalid.' });
    expect(
      (await server.inject({ method: 'POST', url: `/api/notes/${id}/move`, payload: { topic: '!!!' } })).statusCode,
    ).toBe(400);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: `/api/notes/${id}/move`,
          payload: { topic: 'a'.repeat(TOPIC_NAME_MAX + 1) },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await server.inject({ method: 'POST', url: `/api/notes/${id}/move`, payload: { topic: 'Home', extra: true } }))
        .statusCode,
    ).toBe(400);
    const fest = db.prepare('SELECT pinned, topic_id FROM note WHERE id = ?').get(id) as {
      pinned: number;
      topic_id: number;
    };
    expect(fest.pinned).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS anzahl FROM correction').get() as { anzahl: number }).anzahl).toBe(0);
  });
});
