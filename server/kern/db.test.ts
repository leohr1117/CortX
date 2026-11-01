import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { SPEICHER } from '../../shared/kern/grenzen.ts';
import { migriere, oeffneDatenbank } from './db.ts';
import { verweigereEchteDatenbank } from './testpfad.ts';

describe('database', () => {
  const offen: DatabaseSync[] = [];

  afterEach(() => {
    for (const db of offen) db.close();
    offen.length = 0;
  });

  function oeffne(): DatabaseSync {
    const db = oeffneDatenbank(SPEICHER);
    offen.push(db);
    return db;
  }

  it('seeds Inbox and does not seed it twice', () => {
    const db = oeffne();
    const vorher = db.prepare('SELECT COUNT(*) AS anzahl FROM topic').get() as { anzahl: number };
    expect(vorher.anzahl).toBe(1);
    const inbox = db.prepare('SELECT name, name_key FROM topic').get() as { name: string; name_key: string };
    expect(inbox).toEqual({ name: 'Inbox', name_key: 'inbox' });
    migriere(db);
    const nachher = db.prepare('SELECT COUNT(*) AS anzahl FROM topic').get() as { anzahl: number };
    expect(nachher.anzahl).toBe(1);
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(version.user_version).toBe(1);
  });

  it('stores ai as a source and rejects an unknown source', () => {
    const db = oeffne();
    const thema = db.prepare('SELECT id FROM topic').get() as { id: number };
    db.prepare(
      'INSERT INTO note (text, created, topic_id, source, ai_confidence) VALUES (?, ?, ?, ?, ?)',
    ).run('sorted', '2026-01-01T00:00:00.000Z', thema.id, 'ai', 0.4);
    const zeile = db.prepare('SELECT source, ai_confidence FROM note').get() as {
      source: string;
      ai_confidence: number;
    };
    expect(zeile).toEqual({ source: 'ai', ai_confidence: 0.4 });
    expect(() =>
      db
        .prepare('INSERT INTO note (text, created, topic_id, source, ai_confidence) VALUES (?, ?, ?, ?, NULL)')
        .run('nope', '2026-01-01T00:00:00.000Z', thema.id, 'guess'),
    ).toThrow(/CHECK/);
  });

  it('refuses a database inside data/ and allows memory and tmp-bau', () => {
    expect(() => verweigereEchteDatenbank(path.join('data', 'cortex.db'))).toThrow(/data/);
    expect(verweigereEchteDatenbank(SPEICHER)).toBe(SPEICHER);
    expect(verweigereEchteDatenbank(path.resolve('tmp-bau', 'probe.db'))).toContain('tmp-bau');
  });
});
