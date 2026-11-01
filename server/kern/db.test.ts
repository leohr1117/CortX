import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { SPEICHER } from '../../shared/kern/grenzen.ts';
import { migriere, oeffneDatenbank } from './db.ts';
import { MIGRATIONEN } from './migrationen.ts';
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
    expect(version.user_version).toBe(5);
    const session = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session'").get();
    expect(session).toEqual({ name: 'session' });
  });

  it('migrates a schema 1 database without losing its notes', () => {
    const db = new DatabaseSync(SPEICHER);
    offen.push(db);
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(MIGRATIONEN[0] ?? '');
    db.exec('PRAGMA user_version = 1');
    const thema = db.prepare('SELECT id FROM topic').get() as { id: number };
    db.prepare(
      'INSERT INTO note (text, created, topic_id, source, ai_confidence) VALUES (?, ?, ?, ?, NULL)',
    ).run('keep me', '2026-01-01T00:00:00.000Z', thema.id, 'manual');
    migriere(db);
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(version.user_version).toBe(5);
    const notiz = db.prepare('SELECT text, pinned, client_id, account_id FROM note').get() as {
      text: string;
      pinned: number;
      client_id: string | null;
      account_id: string | null;
    };
    expect(notiz).toEqual({ text: 'keep me', pinned: 0, client_id: null, account_id: null });
    const tabelle = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'correction'")
      .get();
    expect(tabelle).toEqual({ name: 'correction' });
    const undo = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'topic_undo'").get();
    expect(undo).toEqual({ name: 'topic_undo' });
    migriere(db);
    const nochmal = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(nochmal.user_version).toBe(5);
    const notizUndo = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'note_undo'").get();
    expect(notizUndo).toEqual({ name: 'note_undo' });
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

  it('refuses a database inside data/ and allows memory and tmp-test', () => {
    expect(() => verweigereEchteDatenbank(path.join('data', 'cortex.db'))).toThrow(/data/);
    expect(verweigereEchteDatenbank(SPEICHER)).toBe(SPEICHER);
    expect(verweigereEchteDatenbank(path.resolve('tmp-test', 'probe.db'))).toContain('tmp-test');
  });
});
