import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { NOTE_TEXT_MAX, SPEICHER } from '../../../shared/kern/grenzen.ts';
import { erstelleApp } from '../../kern/app.ts';
import { oeffneDatenbank } from '../../kern/db.ts';

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
    const gebaut = await erstelleApp(db);
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
});
