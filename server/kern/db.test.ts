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
    expect(version.user_version).toBe(MIGRATIONEN.length);
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
    expect(version.user_version).toBe(MIGRATIONEN.length);
    const notiz = db.prepare('SELECT text, pinned, client_id, account_id FROM note').get() as {
      text: string;
      pinned: number;
      client_id: string | null;
      account_id: string | null;
    };
    expect(notiz).toEqual({ text: 'keep me', pinned: 0, client_id: null, account_id: null });
    const indexiert = db.prepare('SELECT count(*) AS n FROM note_fts').get() as { n: number };
    expect(Number(indexiert.n)).toBe(1);
    const treffer = db.prepare('SELECT rowid FROM note_fts WHERE note_fts MATCH ?').all('"keep"');
    expect(treffer).toHaveLength(1);
    const tabelle = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'correction'")
      .get();
    expect(tabelle).toEqual({ name: 'correction' });
    const undo = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'topic_undo'").get();
    expect(undo).toEqual({ name: 'topic_undo' });
    migriere(db);
    const nochmal = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(nochmal.user_version).toBe(MIGRATIONEN.length);
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

  it('adds a version stand for existing accounts and keeps their notes', () => {
    const db = new DatabaseSync(SPEICHER);
    offen.push(db);
    db.exec('PRAGMA foreign_keys = OFF');
    for (let index = 0; index < 6; index += 1) db.exec(MIGRATIONEN[index] ?? '');
    db.exec('PRAGMA user_version = 6');
    db.exec('PRAGMA foreign_keys = ON');
    const sql = MIGRATIONEN.find((eintrag) => eintrag.includes('version_hint'));
    expect(sql).toBeTruthy();
    expect(sql).not.toMatch(/DELETE/i);
    expect(sql).not.toMatch(/DROP/i);
    const inbox = db.prepare(`SELECT id FROM "topic" WHERE name_key = 'inbox'`).get() as { id: number };
    db.prepare('UPDATE "topic" SET account_id = ? WHERE id = ?').run('ada', inbox.id);
    db.prepare(
      `INSERT INTO "note" (text, created, topic_id, source, ai_confidence, pinned, account_id)
       VALUES (?, ?, ?, 'manual', NULL, 0, ?)`,
    ).run('keep the note', '2026-10-01T00:00:00.000Z', inbox.id, 'ada');
    db.prepare(
      `INSERT INTO "note" (text, created, topic_id, source, ai_confidence, pinned, account_id)
       VALUES (?, ?, ?, 'manual', NULL, 0, NULL)`,
    ).run('orphan stays', '2026-10-02T00:00:00.000Z', inbox.id);
    const home = db
      .prepare(`INSERT INTO "topic" (name, name_key, created, account_id) VALUES ('Home', 'home', ?, ?)`)
      .run('2026-10-03T00:00:00.000Z', 'bea');
    db.prepare(
      `INSERT INTO "note" (text, created, topic_id, source, ai_confidence, pinned, account_id)
       VALUES (?, ?, ?, 'manual', NULL, 0, ?)`,
    ).run('bea note', '2026-10-03T00:00:00.000Z', Number(home.lastInsertRowid), 'bea');
    db.prepare(
      `INSERT INTO "session" (token_hash, account_id, created, expires, stride_checked, stride_material)
       VALUES ('abc', 'ada', '2026-10-01T00:00:00.000Z', '2027-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', NULL)`,
    ).run();
    const vorher = db.prepare('SELECT text, account_id FROM "note" ORDER BY id').all();
    const themen = db.prepare('SELECT name, account_id FROM "topic" ORDER BY id').all();
    migriere(db);
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(version.user_version).toBe(MIGRATIONEN.length);
    expect(db.prepare('SELECT text, account_id FROM "note" ORDER BY id').all()).toEqual(vorher);
    expect(db.prepare('SELECT name, account_id FROM "topic" ORDER BY id').all()).toEqual(themen);
    const stand = db.prepare('SELECT account_id, notified, seen FROM "version_hint" ORDER BY account_id').all();
    expect(stand).toEqual([
      { account_id: 'ada', notified: null, seen: null },
      { account_id: 'bea', notified: null, seen: null },
    ]);
    migriere(db);
    expect(db.prepare('SELECT text FROM "note" ORDER BY id').all()).toEqual(
      vorher.map((zeile) => ({ text: (zeile as { text: string }).text })),
    );
    const nochmal = db.prepare('SELECT COUNT(*) AS n FROM "version_hint"').get() as { n: number };
    expect(Number(nochmal.n)).toBe(2);
  });

  it('refuses a database inside data/ and allows memory and tmp-test', () => {
    expect(() => verweigereEchteDatenbank(path.join('data', 'cortex.db'))).toThrow(/data/);
    expect(verweigereEchteDatenbank(SPEICHER)).toBe(SPEICHER);
    expect(verweigereEchteDatenbank(path.resolve('tmp-test', 'probe.db'))).toContain('tmp-test');
  });
});
