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
      text: '# Buy milk',
      topic: 'Inbox',
      source: 'manual',
      aiConfidence: null,
    });
    const themen = await server.inject({ method: 'GET', url: '/api/topics' });
    expect(themen.json()).toEqual({ topics: [{ name: 'Inbox', count: 1 }] });
  });

  it('creates an unknown topic, strips the tag, and counts notes', async () => {
    const server = await app();
    const erste = await post(server, '#Garten\nCall tomorrow');
    expect(erste.statusCode).toBe(201);
    expect(erste.json()).toMatchObject({ text: '# Call tomorrow', topic: 'Garten', source: 'tag' });
    const zweite = await post(server, '#garten\nAgain');
    expect(zweite.json()).toMatchObject({ text: '# Again', topic: 'Garten', source: 'tag' });
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
      const antwort = await post(server, `#Work\nn ${index}`);
      expect(antwort.statusCode).toBe(201);
    }
    await post(server, '#Workout\none');
    const abgelegt = await post(server, '#wo\nFix and #home');
    expect(abgelegt.json()).toMatchObject({ text: '# Fix and #home', topic: 'Work', source: 'tag' });
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
      text: '# Buy milk',
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
    const abgelegt = await post(server, '#Home\nCall tomorrow');
    const id = abgelegt.json().id as number;
    const gleich = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}/move`,
      payload: { topic: 'home' },
    });
    expect(gleich.statusCode).toBe(200);
    expect(gleich.json()).toMatchObject({ topic: 'Home', source: 'tag', text: '# Call tomorrow' });
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

  it('appends to a page or section and keeps a stale edit', async () => {
    const { server, db } = await paar();
    const seite = await post(server, '#school/Mathe Limits');
    expect(seite.statusCode).toBe(201);
    expect(seite.json()).toMatchObject({ text: '# Mathe\n\nLimits', topic: 'school', ziel: 'school > Mathe' });
    const id = seite.json().id as number;
    const vorher = db.prepare('SELECT source, created FROM note WHERE id = ?').get(id) as {
      source: string;
      created: string;
    };

    const leer = await post(server, '#school/Mathe');
    expect(leer.statusCode).toBe(400);
    expect(leer.json()).toEqual({ error: 'Write something to add.' });
    expect((await post(server, '#a/b/c/d Too')).json()).toEqual({ error: 'A path has at most three levels.' });
    expect((await post(server, '#a//b Gap')).json()).toEqual({ error: 'That path is missing a name.' });

    const ende = await post(server, '#school/mathe First block');
    expect(ende.statusCode).toBe(200);
    expect(ende.json()).toMatchObject({ id, ziel: 'Mathe', text: '# Mathe\n\nLimits\n\nFirst block' });
    expect(db.prepare('SELECT text, version FROM note_revision WHERE note_id = ?').all(id)).toEqual([
      { text: '# Mathe\n\nLimits', version: 1 },
    ]);

    const abschnitt = await post(server, '#school/Mathe/Analysis Inside');
    expect(abschnitt.json()).toMatchObject({
      ziel: 'Mathe > Analysis',
      text: '# Mathe\n\nLimits\n\nFirst block\n\n## Analysis\n\nInside',
    });
    const beweise = await post(server, '#school/Mathe/Proofs Next');
    expect(beweise.json().text).toBe(
      '# Mathe\n\nLimits\n\nFirst block\n\n## Analysis\n\nInside\n\n## Proofs\n\nNext',
    );
    const mitten = await post(server, '#school/Mathe/Analysis Still');
    const mittenText =
      '# Mathe\n\nLimits\n\nFirst block\n\n## Analysis\n\nInside\n\nStill\n\n## Proofs\n\nNext';
    expect(mitten.json()).toMatchObject({ ziel: 'Mathe > Analysis', text: mittenText });
    expect(db.prepare('SELECT source, created FROM note WHERE id = ?').get(id)).toEqual(vorher);
    expect((db.prepare('SELECT COUNT(*) AS anzahl FROM note').get() as { anzahl: number }).anzahl).toBe(1);

    const konflikt = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}`,
      payload: { text: 'stale draft', version: 1 },
    });
    expect(konflikt.statusCode).toBe(409);
    expect(konflikt.json()).toEqual({ error: 'This page changed. Reload it and try again.' });
    expect((db.prepare('SELECT text FROM note WHERE id = ?').get(id) as { text: string }).text).toBe(mittenText);

    const zurueck = await server.inject({
      method: 'POST',
      url: '/api/notes/undo',
      payload: { token: mitten.json().undo },
    });
    expect(zurueck.statusCode).toBe(200);
    expect((db.prepare('SELECT text FROM note WHERE id = ?').get(id) as { text: string }).text).toBe(beweise.json().text);
  });

  it('files one note onto several pages and undoes every part', async () => {
    const server = await app();
    const roh = '#school/Thema1 text1\ntext1 text1\n#school/Thema2 text2\ntext2 text2';
    const antwort = await post(server, roh);
    expect(antwort.statusCode).toBe(201);
    const koerper = antwort.json() as { text: string; ziel: string; undo: string };
    expect(koerper.text).toBe('# Thema2\n\ntext2\ntext2 text2');
    expect(koerper.ziel).toBe('school > Thema1 · school > Thema2');
    const seiten = await server.inject({ method: 'GET', url: '/api/library/notes?topic=school' });
    const notizen = (seiten.json() as { notes: Array<{ text: string }> }).notes.map((notiz) => notiz.text).sort();
    expect(notizen).toEqual(['# Thema1\n\ntext1\ntext1 text1', '# Thema2\n\ntext2\ntext2 text2']);
    expect(notizen.join('\n').includes('#school')).toBe(false);

    const zurueck = await server.inject({
      method: 'POST',
      url: '/api/notes/undo',
      payload: { token: koerper.undo },
    });
    expect(zurueck.statusCode).toBe(200);
    const danach = await server.inject({ method: 'GET', url: '/api/library/notes?topic=school' });
    expect((danach.json() as { notes: unknown[] }).notes).toEqual([]);
    const themen = await server.inject({ method: 'GET', url: '/api/topics' });
    expect((themen.json() as { topics: Array<{ name: string; count: number }> }).topics).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'school', count: 0 })]),
    );
  });

  it('keeps text before the first target line in the inbox and a hash inside the line', async () => {
    const server = await app();
    const antwort = await post(server, 'before\n#school/Thema1 stays #tag');
    expect(antwort.statusCode).toBe(201);
    const inbox = await server.inject({ method: 'GET', url: '/api/library/notes?topic=Inbox' });
    expect((inbox.json() as { notes: Array<{ text: string }> }).notes.map((notiz) => notiz.text)).toEqual(['# before']);
    const schule = await server.inject({ method: 'GET', url: '/api/library/notes?topic=school' });
    expect((schule.json() as { notes: Array<{ text: string }> }).notes.map((notiz) => notiz.text)).toEqual([
      '# Thema1\n\nstays #tag',
    ]);
  });
});
