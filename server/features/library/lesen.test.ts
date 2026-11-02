import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { TOPIC_NAME_MAX, SPEICHER } from '../../../shared/kern/grenzen.ts';
import { oeffneDatenbank } from '../../kern/db.ts';
import { oeffneAngemeldet } from '../zugang/attrappe.ts';

describe('library api', () => {
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

  it('starts empty and reports the newest note per topic', async () => {
    const { server, db } = await app();
    const leer = await server.inject({ method: 'GET', url: '/api/library' });
    expect(leer.statusCode).toBe(200);
    expect(leer.json()).toEqual({ inbox: { name: 'Inbox', count: 0, lastNote: null }, topics: [] });

    const aelter = await lege(server, '#Books\nOlder');
    const neuer = await lege(server, '#Books\nNewer');
    await lege(server, 'Loose thought');
    db.prepare('UPDATE "note" SET created = ? WHERE id = ?').run('2026-10-30T10:00:00.000Z', aelter);
    db.prepare('UPDATE "note" SET created = ? WHERE id = ?').run('2026-10-31T10:00:00.000Z', neuer);

    const liste = await server.inject({ method: 'GET', url: '/api/library' });
    expect(liste.json()).toEqual({
      inbox: { name: 'Inbox', count: 1, lastNote: expect.any(String) },
      topics: [{ name: 'Books', count: 2, lastNote: '2026-10-31T10:00:00.000Z' }],
    });
    const themen = await server.inject({ method: 'GET', url: '/api/topics' });
    expect(themen.json()).toEqual({
      topics: [
        { name: 'Books', count: 2 },
        { name: 'Inbox', count: 1 },
      ],
    });
  });

  it('returns one topic’s notes, newest first, and hides the other topics', async () => {
    const { server, db } = await app();
    const erst = await lege(server, '#Work\nFirst');
    const zweit = await lege(server, '#Work\nSecond');
    await lege(server, '#Home\nElsewhere');
    db.prepare('UPDATE "note" SET created = ? WHERE id = ?').run('2026-10-28T08:20:00.000Z', erst);
    db.prepare('UPDATE "note" SET created = ? WHERE id = ?').run('2026-11-01T14:32:00.000Z', zweit);

    const gross = await server.inject({ method: 'GET', url: '/api/library/notes?topic=work' });
    expect(gross.statusCode).toBe(200);
    expect(gross.headers['cache-control']).toBe('no-store');
    expect(gross.json()).toMatchObject({
      topic: 'Work',
      notes: [
        { text: '# Second', created: '2026-11-01T14:32:00.000Z', topic: 'Work' },
        { text: '# First', created: '2026-10-28T08:20:00.000Z', topic: 'Work' },
      ],
    });

    const flug = await lege(server, 'Flight');
    const verschoben = await server.inject({
      method: 'POST',
      url: `/api/notes/${flug}/move`,
      payload: { topic: 'Travel \u2013 Lisbon' },
    });
    expect(verschoben.statusCode).toBe(200);
    const lisbon = encodeURIComponent('Travel \u2013 Lisbon');
    const reise = await server.inject({ method: 'GET', url: `/api/library/notes?topic=${lisbon}` });
    expect(reise.statusCode).toBe(200);
    expect(reise.json()).toMatchObject({ topic: 'Travel \u2013 Lisbon', notes: [{ text: '# Flight' }] });
  });

  it('rejects a missing, unknown, or invalid topic', async () => {
    const { server } = await app();
    const fehlt = await server.inject({ method: 'GET', url: '/api/library/notes' });
    expect(fehlt.statusCode).toBe(400);
    expect(fehlt.json()).toEqual({ error: 'The topic name is missing or invalid.' });

    const leer = await server.inject({ method: 'GET', url: '/api/library/notes?topic=%20%20' });
    expect(leer.statusCode).toBe(400);

    const unbekannt = await server.inject({ method: 'GET', url: '/api/library/notes?topic=Missing' });
    expect(unbekannt.statusCode).toBe(404);
    expect(unbekannt.json()).toEqual({ error: 'Topic not found.' });

    const zeichen = await server.inject({ method: 'GET', url: '/api/library/notes?topic=Bad!' });
    expect(zeichen.statusCode).toBe(400);

    const lang = 'a'.repeat(TOPIC_NAME_MAX + 1);
    const zuLang = await server.inject({
      method: 'GET',
      url: `/api/library/notes?topic=${lang}`,
    });
    expect(zuLang.statusCode).toBe(400);

    const extra = await server.inject({ method: 'GET', url: '/api/library/notes?topic=Work&extra=1' });
    expect(extra.statusCode).toBe(400);

    const inbox = await server.inject({ method: 'GET', url: '/api/library/notes?topic=Inbox' });
    expect(inbox.statusCode).toBe(200);
    expect(inbox.json()).toEqual({ topic: 'Inbox', notes: [] });
  });
});
