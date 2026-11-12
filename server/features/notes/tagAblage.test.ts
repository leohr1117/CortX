import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { SPEICHER } from '../../../shared/kern/grenzen.ts';
import { oeffneDatenbank } from '../../kern/db.ts';
import { oeffneAngemeldet } from '../zugang/attrappe.ts';

// Today's filing, pinned before the node rebuild (Clara, 12.11.2026 05:57: filing on the server stays as it is).
// Columns: text, topic of the filed note, stored text.
const FAELLE: Array<[string, string, string]> = [
  ['a **#fett** b', 'Inbox', 'a **#fett** b'],
  ['a `#code` b', 'Inbox', 'a `#code` b'],
  ['a *#kursiv* b', 'Inbox', 'a *#kursiv* b'],
  ['a _#unter_ b', 'Inbox', 'a _#unter_ b'],
  ['x**y**#z', 'Inbox', 'x**y**#z'],
  ['x`y`#z', 'Inbox', 'x`y`#z'],
  ['\\#kein', 'Inbox', '\\#kein'],
  ['a [#link](https://x.de) b', 'Inbox', 'a [#link](https://x.de) b'],
  ['**a#b**', 'Inbox', '**a#b**'],
  ['a ~~#durch~~ b', 'Inbox', 'a ~~#durch~~ b'],
  ['# Titel #tag', 'Inbox', '# Titel #tag'],
  ['- [ ] #kasten', 'kasten', 'kasten'],
  ['1. #nummer', 'nummer', 'nummer'],
  ['**#fett/unter** x', 'fett', 'unter\n\nx'],
  ['#a`b`', 'ab', 'ab'],
  ['`x`#a', 'Inbox', '`x`#a'],
];

describe('filing by tag stays as today', () => {
  const dbs: DatabaseSync[] = [];
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    for (const app of apps) await app.close();
    for (const db of dbs) db.close();
    apps.length = 0;
    dbs.length = 0;
  });

  it('covers all sixteen cases', () => {
    expect(FAELLE).toHaveLength(16);
  });

  it.each(FAELLE)('%s', async (text, thema, gespeichert) => {
    const db = oeffneDatenbank(SPEICHER);
    dbs.push(db);
    const server = await oeffneAngemeldet(db);
    apps.push(server);
    const antwort = await server.inject({ method: 'POST', url: '/api/notes', payload: { text } });
    expect(antwort.statusCode).toBe(201);
    expect(antwort.json()).toMatchObject({ topic: thema, text: gespeichert });
  });
});
