import crypto from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { SPEICHER } from '../../shared/kern/grenzen.ts';
import { spalteAusText } from '../features/notes/lesen.ts';
import { oeffneDatenbank } from './db.ts';
import { MIGRATIONEN } from './migrationen.ts';
import { migriereSuchindex, SUCHINDEX_MARKE, suchindexMarke } from './suchindex.ts';

function schemaSha256(db: DatabaseSync): string {
  const zeilen = db
    .prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name')
    .all() as Array<{ type: string; name: string; tbl_name: string; sql: string | null }>;
  const text = zeilen
    .map((zeile) => `${zeile.type}|${zeile.name}|${zeile.tbl_name}|${zeile.sql ?? ''}`)
    .join('\n');
  return crypto.createHash('sha256').update(text).digest('hex').toUpperCase();
}

function ftsHash(db: DatabaseSync): string {
  const zeilen = db.prepare('SELECT rowid, text FROM note_fts ORDER BY rowid').all() as Array<{
    rowid: number;
    text: string;
  }>;
  return crypto.createHash('sha256').update(JSON.stringify(zeilen)).digest('hex');
}

function indexText(db: DatabaseSync, id: number): string | undefined {
  const zeile = db.prepare('SELECT text FROM note_fts WHERE rowid = ?').get(id) as { text: string } | undefined;
  return zeile?.text;
}

function sucheIds(db: DatabaseSync, anfrage: string): number[] {
  return (
    db.prepare('SELECT rowid AS id FROM note_fts WHERE note_fts MATCH ? ORDER BY rowid').all(anfrage) as Array<{
      id: number;
    }>
  ).map((zeile) => zeile.id);
}

describe('search index rebuild', () => {
  const offen: DatabaseSync[] = [];

  afterEach(() => {
    for (const db of offen) db.close();
    offen.length = 0;
  });

  function oeffne(ziel: string = SPEICHER): DatabaseSync {
    const db = oeffneDatenbank(ziel);
    offen.push(db);
    return db;
  }

  function legeNotiz(db: DatabaseSync, text: string, created: string): number {
    const thema = db.prepare('SELECT id FROM topic').get() as { id: number };
    const info = db
      .prepare(
        'INSERT INTO note (doc, created, topic_id, source, ai_confidence) VALUES (?, ?, ?, ?, NULL)',
      )
      .run(spalteAusText(text), created, thema.id, 'manual');
    return Number(info.lastInsertRowid);
  }

  it('rebuilds once when the mark is missing, then is a no-op, and keeps the 1.14.7 nachkontrolle green', () => {
    const db = oeffne();
    expect(suchindexMarke(db)).toBe(SUCHINDEX_MARKE);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(
      MIGRATIONEN.length,
    );
    expect(MIGRATIONEN.length).toBe(1);

    const eins = legeNotiz(db, '# Lantern\n\n- Milch\n\n**fett** and `code` and #tag', '2026-01-01T00:00:00.000Z');
    const zwei = legeNotiz(db, 'plain grocery list', '2026-01-02T00:00:00.000Z');
    const klartextEins = indexText(db, eins);
    expect(klartextEins).toBeTruthy();
    expect(klartextEins).not.toMatch(/\*\*|##/);
    expect(klartextEins).toMatch(/Lantern/);
    expect(sucheIds(db, 'Lantern')).toEqual([eins]);
    expect(sucheIds(db, 'grocery')).toEqual([zwei]);
    const trefferVorher = {
      lantern: sucheIds(db, 'Lantern'),
      grocery: sucheIds(db, 'grocery'),
      milch: sucheIds(db, 'Milch'),
      tag: sucheIds(db, 'tag'),
    };

    const schemaVorher = schemaSha256(db);
    const versionVorher = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    const notesVorher = db.prepare('SELECT id, doc FROM "note" ORDER BY id').all();

    db.exec('DELETE FROM note_fts');
    db.prepare('INSERT INTO note_fts(rowid, text) VALUES (?, ?)').run(eins, '**xyzzytoken** leftover ##mark');
    db.prepare('INSERT INTO note_fts(rowid, text) VALUES (?, ?)').run(zwei, 'plain grocery list');
    db.exec('PRAGMA application_id = 0');
    expect(suchindexMarke(db)).toBe(0);
    expect(sucheIds(db, 'xyzzytoken')).toEqual([eins]);
    expect(sucheIds(db, 'Lantern')).toEqual([]);

    const erster = migriereSuchindex(db);
    expect(erster).toEqual({ rebuilt: true });
    expect(suchindexMarke(db)).toBe(SUCHINDEX_MARKE);
    expect(indexText(db, eins)).toBe(klartextEins);
    expect(sucheIds(db, 'xyzzytoken')).toEqual([]);
    expect(sucheIds(db, 'Lantern')).toEqual(trefferVorher.lantern);
    expect(sucheIds(db, 'grocery')).toEqual(trefferVorher.grocery);
    expect(sucheIds(db, 'Milch')).toEqual(trefferVorher.milch);
    expect(sucheIds(db, 'tag')).toEqual(trefferVorher.tag);

    const indexHash = ftsHash(db);
    const zweiter = migriereSuchindex(db);
    expect(zweiter).toEqual({ rebuilt: false });
    expect(suchindexMarke(db)).toBe(SUCHINDEX_MARKE);
    expect(ftsHash(db)).toBe(indexHash);
    expect(sucheIds(db, 'Lantern')).toEqual(trefferVorher.lantern);
    expect(sucheIds(db, 'grocery')).toEqual(trefferVorher.grocery);
    expect(sucheIds(db, 'Milch')).toEqual(trefferVorher.milch);
    expect(sucheIds(db, 'tag')).toEqual(trefferVorher.tag);

    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(versionVorher);
    expect(versionVorher).toBe(1);
    expect(schemaSha256(db)).toBe(schemaVorher);
    expect(db.prepare('SELECT id, doc FROM "note" ORDER BY id').all()).toEqual(notesVorher);
    const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    expect(integrity.integrity_check).toBe('ok');
  });

  it('rebuilds a file database through oeffneDatenbank when the mark is old', () => {
    const ordner = path.resolve('tmp-test', 'f2h3a-suchindex');
    mkdirSync(ordner, { recursive: true });
    const datei = path.join(ordner, 'probe.db');
    rmSync(datei, { force: true });
    rmSync(datei + '-wal', { force: true });
    rmSync(datei + '-shm', { force: true });
    try {
      const erst = oeffne(datei);
      const id = legeNotiz(erst, 'Harbor light', '2026-01-03T00:00:00.000Z');
      expect(sucheIds(erst, 'Harbor')).toEqual([id]);
      erst.exec('PRAGMA application_id = 0');
      erst.exec("UPDATE note_fts SET text = 'stale xyzzytoken' WHERE rowid = " + id);
      erst.close();
      offen.pop();

      const wieder = oeffne(datei);
      expect(suchindexMarke(wieder)).toBe(SUCHINDEX_MARKE);
      expect(sucheIds(wieder, 'xyzzytoken')).toEqual([]);
      expect(sucheIds(wieder, 'Harbor')).toEqual([id]);
      expect((wieder.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(1);
    } finally {
      while (offen.length) {
        const db = offen.pop();
        if (db) db.close();
      }
      rmSync(ordner, { recursive: true, force: true });
    }
  });
});
