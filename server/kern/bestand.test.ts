import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { SPEICHER } from '../../shared/kern/grenzen.ts';
import { spalteAusText, textAusSpalte } from '../features/notes/lesen.ts';
import { migriere, oeffneDatenbank } from './db.ts';
import { MIGRATIONEN } from './migrationen.ts';

describe('note schema', () => {
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

  function lege(db: DatabaseSync, text: string, version = 1): void {
    const inbox = db.prepare(`SELECT id FROM "topic" WHERE name_key = 'inbox'`).get() as { id: number };
    db.prepare('UPDATE "topic" SET account_id = ? WHERE id = ?').run('ada', inbox.id);
    db.prepare(
      `INSERT INTO "note" (doc, created, topic_id, source, ai_confidence, pinned, account_id, version)
       VALUES (?, ?, ?, 'manual', NULL, 0, ?, ?)`,
    ).run(spalteAusText(text), '2026-10-01T00:00:00.000Z', inbox.id, 'ada', version);
  }

  it('stores doc and version, has no text column, and does not retitle on migrate', () => {
    const db = oeffne();
    const namen = (db.prepare('PRAGMA table_info("note")').all() as Array<{ name: string }>).map((spalte) => spalte.name);
    expect(namen).toContain('doc');
    expect(namen).toContain('version');
    expect(namen).not.toContain('text');
    lege(db, 'plain line');
    migriere(db);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONEN.length);
    const zeile = db.prepare('SELECT doc, version FROM "note"').get() as { doc: string; version: number };
    expect(zeile.version).toBe(1);
    expect(zeile.doc).toBe(spalteAusText('plain line'));
    expect(textAusSpalte(zeile.doc)).toBe('plain line');
    expect(Number((db.prepare('SELECT COUNT(*) AS n FROM "note_revision"').get() as { n: number }).n)).toBe(0);
  });

  it('keeps a titled note and its version and indexes the insert', () => {
    const db = oeffne();
    lege(db, '# Already titled', 3);
    migriere(db);
    const zeile = db.prepare('SELECT doc, version FROM "note"').get() as { doc: string; version: number };
    expect(zeile.version).toBe(3);
    expect(textAusSpalte(zeile.doc)).toBe('# Already titled');
    expect(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'note_fts_insert'`).get()).toEqual({
      name: 'note_fts_insert',
    });
    expect(db.prepare('SELECT rowid FROM note_fts WHERE note_fts MATCH ?').all('"titled"')).toHaveLength(1);
  });
});
