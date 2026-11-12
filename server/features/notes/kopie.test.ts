import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { packeDokument, pruefeDokument } from '../../../shared/features/format/dokument.ts';
import { exportiere, importiere } from '../../../shared/features/format/md.ts';
import { SPEICHER } from '../../../shared/kern/grenzen.ts';
import { oeffneDatenbank } from '../../kern/db.ts';
import { oeffneAngemeldet } from '../zugang/attrappe.ts';

describe('conflict copy', () => {
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

  function anzahl(db: DatabaseSync): number {
    return (db.prepare('SELECT COUNT(*) AS anzahl FROM note').get() as { anzahl: number }).anzahl;
  }

  async function original(server: FastifyInstance): Promise<{ id: number; topic: string; version: number }> {
    const erstellt = await server.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { doc: packeDokument(importiere('#work/Sprint\n\nOld line')) },
    });
    expect(erstellt.statusCode).toBe(201);
    return erstellt.json() as { id: number; topic: string; version: number };
  }

  function kopie(server: FastifyInstance, id: number, text: string, clientId: string) {
    return server.inject({
      method: 'POST',
      url: `/api/notes/${id}/copy`,
      payload: { doc: packeDokument(importiere(text)), clientId },
    });
  }

  it('files the copy as sent in the topic of the original and leaves the original alone', async () => {
    const { server, db } = await paar();
    const alt = await original(server);
    const vorher = await server.inject({ method: 'GET', url: `/api/notes/${alt.id}` });
    const text = 'Sprint (Conflict \u00b7 12 Nov, 00:30)\n\n#home/Keys stays a line here\n\nTyped elsewhere';
    const antwort = await kopie(server, alt.id, text, randomUUID());
    expect(antwort.statusCode).toBe(201);
    const neu = antwort.json() as { id: number; topic: string; doc: unknown; text: string };
    expect(neu.id).not.toBe(alt.id);
    expect(neu.topic).toBe(alt.topic);
    expect(pruefeDokument(neu.doc)!.eq(importiere(text))).toBe(true);
    expect(exportiere(pruefeDokument(neu.doc)!)).toBe(text);
    expect(anzahl(db)).toBe(2);
    const nachher = await server.inject({ method: 'GET', url: `/api/notes/${alt.id}` });
    expect(nachher.json()).toEqual(vorher.json());
  });

  it('returns the same copy for a repeated client id', async () => {
    const { server, db } = await paar();
    const alt = await original(server);
    const clientId = randomUUID();
    const erste = await kopie(server, alt.id, 'Sprint (copy)\n\nOnce', clientId);
    const zweite = await kopie(server, alt.id, 'Sprint (copy)\n\nOnce', clientId);
    expect(erste.statusCode).toBe(201);
    expect(zweite.statusCode).toBe(200);
    expect(zweite.json().id).toBe(erste.json().id);
    expect(anzahl(db)).toBe(2);
  });

  it('rejects an unknown note, an empty document and a missing client id', async () => {
    const { server, db } = await paar();
    const alt = await original(server);
    expect((await kopie(server, alt.id + 99, 'Lost?', randomUUID())).statusCode).toBe(404);
    expect((await kopie(server, alt.id, '   ', randomUUID())).statusCode).toBe(400);
    const ohne = await server.inject({
      method: 'POST',
      url: `/api/notes/${alt.id}/copy`,
      payload: { doc: packeDokument(importiere('No id')) },
    });
    expect(ohne.statusCode).toBe(400);
    expect(anzahl(db)).toBe(1);
  });
});
