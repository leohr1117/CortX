import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { SPEICHER } from '../../shared/kern/grenzen.ts';
import { spalteAusText, textAusSpalte } from '../features/notes/lesen.ts';
import { ALTES_SCHEMA, migriere, oeffneDatenbank } from './db.ts';
import { MIGRATIONEN, migrationsSql } from './migrationen.ts';
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

  function spalten(db: DatabaseSync, tabelle: string): string[] {
    return (db.prepare(`PRAGMA table_info("${tabelle}")`).all() as Array<{ name: string }>).map((spalte) => spalte.name);
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
    expect(spalten(db, 'note')).toContain('doc');
    expect(spalten(db, 'note')).not.toContain('text');
    expect(spalten(db, 'note_revision')).toContain('doc');
    expect(spalten(db, 'note_revision')).not.toContain('text');
  });

  it('stores a note as doc and finds it without rewriting a revision', () => {
    const db = oeffne();
    const thema = db.prepare('SELECT id FROM topic').get() as { id: number };
    const doc = spalteAusText('keep me');
    db.prepare(
      'INSERT INTO note (doc, created, topic_id, source, ai_confidence) VALUES (?, ?, ?, ?, NULL)',
    ).run(doc, '2026-01-01T00:00:00.000Z', thema.id, 'manual');
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(version.user_version).toBe(MIGRATIONEN.length);
    const notiz = db.prepare('SELECT doc, pinned, client_id, account_id FROM note').get() as {
      doc: string;
      pinned: number;
      client_id: string | null;
      account_id: string | null;
    };
    expect(notiz).toEqual({ doc, pinned: 0, client_id: null, account_id: null });
    expect(textAusSpalte(notiz.doc)).toBe('keep me');
    expect(db.prepare('SELECT doc FROM "note_revision"').get()).toBeUndefined();
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
    expect(db.prepare('SELECT doc FROM note').get()).toEqual({ doc });
    const notizUndo = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'note_undo'").get();
    expect(notizUndo).toEqual({ name: 'note_undo' });
  });

  it('stores ai as a source and rejects an unknown source', () => {
    const db = oeffne();
    const thema = db.prepare('SELECT id FROM topic').get() as { id: number };
    db.prepare(
      'INSERT INTO note (doc, created, topic_id, source, ai_confidence) VALUES (?, ?, ?, ?, ?)',
    ).run(spalteAusText('sorted'), '2026-01-01T00:00:00.000Z', thema.id, 'ai', 0.4);
    const zeile = db.prepare('SELECT source, ai_confidence FROM note').get() as {
      source: string;
      ai_confidence: number;
    };
    expect(zeile).toEqual({ source: 'ai', ai_confidence: 0.4 });
    expect(() =>
      db
        .prepare('INSERT INTO note (doc, created, topic_id, source, ai_confidence) VALUES (?, ?, ?, ?, NULL)')
        .run(spalteAusText('nope'), '2026-01-01T00:00:00.000Z', thema.id, 'guess'),
    ).toThrow(/CHECK/);
  });

  it('keeps notes on a second migration and leaves version hints empty', () => {
    const db = oeffne();
    const sql = migrationsSql(0);
    expect(sql).toContain('doc TEXT NOT NULL');
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+"(?:note|topic|note_revision)"/i);
    const inbox = db.prepare(`SELECT id FROM "topic" WHERE name_key = 'inbox'`).get() as { id: number };
    db.prepare('UPDATE "topic" SET account_id = ? WHERE id = ?').run('ada', inbox.id);
    db.prepare(
      `INSERT INTO "note" (doc, created, topic_id, source, ai_confidence, pinned, account_id)
       VALUES (?, ?, ?, 'manual', NULL, 0, ?)`,
    ).run(spalteAusText('keep the note'), '2026-10-01T00:00:00.000Z', inbox.id, 'ada');
    db.prepare(
      `INSERT INTO "note" (doc, created, topic_id, source, ai_confidence, pinned, account_id)
       VALUES (?, ?, ?, 'manual', NULL, 0, NULL)`,
    ).run(spalteAusText('orphan stays'), '2026-10-02T00:00:00.000Z', inbox.id);
    const home = db
      .prepare(`INSERT INTO "topic" (name, name_key, created, account_id) VALUES ('Home', 'home', ?, ?)`)
      .run('2026-10-03T00:00:00.000Z', 'bea');
    db.prepare(
      `INSERT INTO "note" (doc, created, topic_id, source, ai_confidence, pinned, account_id)
       VALUES (?, ?, ?, 'manual', NULL, 0, ?)`,
    ).run(spalteAusText('bea note'), '2026-10-03T00:00:00.000Z', Number(home.lastInsertRowid), 'bea');
    db.prepare(
      `INSERT INTO "session" (token_hash, account_id, created, expires, stride_checked, stride_material)
       VALUES ('abc', 'ada', '2026-10-01T00:00:00.000Z', '2027-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', NULL)`,
    ).run();
    const vorher = db.prepare('SELECT doc, account_id FROM "note" ORDER BY id').all();
    const themen = db.prepare('SELECT name, account_id FROM "topic" ORDER BY id').all();
    migriere(db);
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(version.user_version).toBe(MIGRATIONEN.length);
    expect(db.prepare('SELECT doc, account_id FROM "note" ORDER BY id').all()).toEqual(vorher);
    expect(db.prepare('SELECT name, account_id FROM "topic" ORDER BY id').all()).toEqual(themen);
    expect(db.prepare('SELECT account_id, notified, seen FROM "version_hint" ORDER BY account_id').all()).toEqual([]);
    migriere(db);
    expect(db.prepare('SELECT doc FROM "note" ORDER BY id').all()).toEqual(
      vorher.map((zeile) => ({ doc: (zeile as { doc: string }).doc })),
    );
    const nochmal = db.prepare('SELECT COUNT(*) AS n FROM "version_hint"').get() as { n: number };
    expect(Number(nochmal.n)).toBe(0);
  });

  it('refuses a database inside data/ and allows memory and tmp-test', () => {
    expect(() => verweigereEchteDatenbank(path.join('data', 'cortex.db'))).toThrow(/data/);
    expect(verweigereEchteDatenbank(SPEICHER)).toBe(SPEICHER);
    expect(verweigereEchteDatenbank(path.resolve('tmp-test', 'probe.db'))).toContain('tmp-test');
  });

  it('rejects an old database without doc and leaves the file unchanged', () => {
    const ziel = path.resolve('tmp-test', 'f2bc-alt.db');
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    for (const extra of ['', '-wal', '-shm']) {
      const datei = extra === '' ? ziel : `${ziel}${extra}`;
      if (fs.existsSync(datei)) fs.rmSync(datei);
    }
    const roh = new DatabaseSync(ziel);
    try {
      roh.exec('CREATE TABLE "note" (id INTEGER PRIMARY KEY, text TEXT NOT NULL)');
    } finally {
      roh.close();
    }
    const vorher = fs.readFileSync(ziel);
    const hash = crypto.createHash('sha256').update(vorher).digest('hex');
    try {
      expect(() => oeffneDatenbank(ziel)).toThrow(ALTES_SCHEMA);
      const nachher = fs.readFileSync(ziel);
      expect(crypto.createHash('sha256').update(nachher).digest('hex')).toBe(hash);
      expect(nachher.equals(vorher)).toBe(true);
      expect(fs.existsSync(`${ziel}-wal`)).toBe(false);
      expect(fs.existsSync(`${ziel}-shm`)).toBe(false);
    } finally {
      if (fs.existsSync(ziel)) fs.rmSync(ziel);
      for (const extra of ['-wal', '-shm']) {
        const datei = `${ziel}${extra}`;
        if (fs.existsSync(datei)) fs.rmSync(datei);
      }
    }
  });
});
