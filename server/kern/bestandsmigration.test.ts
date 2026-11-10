import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { SPEICHER } from '../../shared/kern/grenzen.ts';
import { stelleNotizHer } from '../features/notes/aendern.ts';
import { spalteAusText, textAusSpalte } from '../features/notes/lesen.ts';
import { erkenneAltstand, NACH_NOTE, schemaArt, textSumme, wandleAltstand } from './bestandsmigration.ts';
import { ALTES_SCHEMA, checkpointBeimOeffnen, oeffneDatenbank } from './db.ts';
import { MIGRATIONEN } from './migrationen.ts';

// DDL transcribed from 129d0b2: migrationen.ts steps 1-7, then the version and note_revision DDL of wandleSeiten.
const DDL = [
  `CREATE TABLE "topic" (id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, created TEXT NOT NULL)`,
  `CREATE TABLE "note" (id INTEGER PRIMARY KEY, text TEXT NOT NULL, created TEXT NOT NULL, topic_id INTEGER NOT NULL REFERENCES "topic"(id), source TEXT NOT NULL CHECK (source IN ('tag', 'ai', 'manual')), ai_confidence REAL CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)))`,
  `CREATE INDEX note_topic ON "note"(topic_id)`,
  `INSERT INTO "topic" (name, name_key, created) VALUES ('Inbox', 'inbox', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
  `ALTER TABLE "note" ADD COLUMN client_id TEXT`,
  `ALTER TABLE "note" ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1))`,
  `CREATE UNIQUE INDEX note_client_id ON "note"(client_id) WHERE client_id IS NOT NULL`,
  `CREATE TABLE "correction" (id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL REFERENCES "note"(id), from_topic_id INTEGER NOT NULL REFERENCES "topic"(id), to_topic_id INTEGER NOT NULL REFERENCES "topic"(id), created TEXT NOT NULL)`,
  `CREATE INDEX correction_note ON "correction"(note_id)`,
  `CREATE TABLE "topic_undo" (token TEXT PRIMARY KEY, payload TEXT NOT NULL, created TEXT NOT NULL)`,
  `CREATE TABLE "note_undo" (token TEXT PRIMARY KEY, payload TEXT NOT NULL, created TEXT NOT NULL)`,
  `CREATE TABLE "topic_neu" (id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL, created TEXT NOT NULL, account_id TEXT)`,
  `INSERT INTO "topic_neu" (id, name, name_key, created, account_id) SELECT id, name, name_key, created, NULL FROM "topic"`,
  `DROP TABLE "topic"`,
  `ALTER TABLE "topic_neu" RENAME TO "topic"`,
  `CREATE UNIQUE INDEX topic_konto_key ON "topic"(account_id, name_key)`,
  `CREATE INDEX topic_konto ON "topic"(account_id)`,
  `ALTER TABLE "note" ADD COLUMN account_id TEXT`,
  `CREATE INDEX note_konto ON "note"(account_id)`,
  `ALTER TABLE "topic_undo" ADD COLUMN account_id TEXT`,
  `ALTER TABLE "note_undo" ADD COLUMN account_id TEXT`,
  `CREATE TABLE "session" (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, created TEXT NOT NULL, expires TEXT NOT NULL, stride_checked TEXT NOT NULL, stride_material TEXT)`,
  `CREATE TABLE "signin_failure" (id INTEGER PRIMARY KEY, ip TEXT NOT NULL, at TEXT NOT NULL)`,
  `CREATE INDEX signin_failure_at ON "signin_failure"(at)`,
  `CREATE TABLE "account_claim" (id INTEGER PRIMARY KEY CHECK (id = 1), account_id TEXT NOT NULL, claimed TEXT NOT NULL)`,
  `CREATE VIRTUAL TABLE note_fts USING fts5(text, content='note', content_rowid='id', tokenize='unicode61 remove_diacritics 1')`,
  `CREATE TRIGGER note_fts_insert AFTER INSERT ON "note" BEGIN INSERT INTO note_fts(rowid, text) VALUES (new.id, new.text); END`,
  `CREATE TRIGGER note_fts_delete AFTER DELETE ON "note" BEGIN INSERT INTO note_fts(note_fts, rowid, text) VALUES ('delete', old.id, old.text); END`,
  `CREATE TRIGGER note_fts_update AFTER UPDATE ON "note" BEGIN INSERT INTO note_fts(note_fts, rowid, text) VALUES ('delete', old.id, old.text); INSERT INTO note_fts(rowid, text) VALUES (new.id, new.text); END`,
  `INSERT INTO note_fts(note_fts) VALUES ('rebuild')`,
  `CREATE TABLE "version_hint" (account_id TEXT PRIMARY KEY, notified TEXT, seen TEXT)`,
  `INSERT INTO "version_hint" (account_id, notified, seen) SELECT account_id, NULL, NULL FROM "note" WHERE account_id IS NOT NULL UNION SELECT account_id, NULL, NULL FROM "topic" WHERE account_id IS NOT NULL UNION SELECT account_id, NULL, NULL FROM "session" WHERE account_id IS NOT NULL UNION SELECT account_id, NULL, NULL FROM "topic_undo" WHERE account_id IS NOT NULL UNION SELECT account_id, NULL, NULL FROM "note_undo" WHERE account_id IS NOT NULL`,
  `ALTER TABLE "note" ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
  `CREATE TABLE "note_revision" (id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL REFERENCES "note"(id) ON DELETE CASCADE, text TEXT NOT NULL, version INTEGER NOT NULL, created TEXT NOT NULL, account_id TEXT)`,
  `CREATE INDEX note_revision_note ON "note_revision"(note_id)`,
  `PRAGMA user_version = 8`,
].join(';\n');

const FORM = '**fett**\n\n## Dairy\n\n- [ ] Milch\n\n#school/Mathe\n\nÜber Größe 😀';
const LANG = `${'a'.repeat(79)}\n`.repeat(247);
const SAMMEL = '{"art":"sammel","erfasst":"hello","schritte":[{"art":"anlegen","id":1,"text":"x","version":1}]}';
const FREMD = '{"note":{"id":1}}';
const SEITE = '{"art":"anlegen","id":1,"text":"seite","version":1}';
const THEMA = '{"name":"Home"}';
const GEHEIM = 'GEHEIM-alpha-7913';
interface Plan { text: string; konto: string; thema: 'inbox' | 'home'; source: 'manual' | 'ai'; ai: number | null; pinned: number; client: string | null; version: number; alt: string | null }
interface RohNotiz { id: number; text: string; created: string; topic_id: number; source: string; ai_confidence: number | null; client_id: string | null; pinned: number; account_id: string | null; version: number }
function plan(text: string, extra: Partial<Plan> = {}): Plan {
  return { text, konto: 'ada', thema: 'inbox', source: 'manual', ai: null, pinned: 0, client: null, version: 1, alt: null, ...extra };
}
const NOTIZEN: Plan[] = [
  plan('# Milch\n\nFrische Milch'),
  plan(FORM),
  plan('```\nconst n = 1;\n```'),
  plan('- Milch\n- Brot'),
  plan('Oben\n\n\nUnten'),
  plan('!!!! Important line'),
  plan('# Already titled', { konto: 'bea', thema: 'home' }),
  plan('keep me', { pinned: 1, client: 'cid-keep', version: 2, alt: 'alte fassung' }),
  plan(LANG),
  plan('plain line', { source: 'ai', ai: 0.4 }),
];

describe('bestand 1.14.3', () => {
  const leser: Array<Iterator<unknown>> = [];
  const offen: DatabaseSync[] = [];
  const dateien: string[] = [];
  afterEach(() => {
    for (const lauf of leser) {
      let schritt = lauf.next();
      while (!schritt.done) schritt = lauf.next();
      lauf.return?.();
    }
    leser.length = 0;
    for (const db of offen) db.close();
    offen.length = 0;
    for (const ziel of dateien) {
      for (const extra of ['', '-wal', '-shm', '-journal']) {
        const datei = extra === '' ? ziel : `${ziel}${extra}`;
        if (fs.existsSync(datei)) fs.rmSync(datei);
      }
    }
    dateien.length = 0;
  });
  function merke(db: DatabaseSync): DatabaseSync {
    offen.push(db);
    return db;
  }
  function merkeLeser<T extends Iterator<unknown>>(lauf: T): T {
    leser.push(lauf);
    return lauf;
  }
  function zu(db: DatabaseSync): void {
    const index = offen.indexOf(db);
    if (index >= 0) offen.splice(index, 1);
    db.close();
  }
  function zielPfad(name: string): string {
    const ziel = path.resolve('tmp-test', 'bestandsmigration', `${name}.db`);
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    for (const extra of ['', '-wal', '-shm', '-journal']) {
      const datei = extra === '' ? ziel : `${ziel}${extra}`;
      if (fs.existsSync(datei)) fs.rmSync(datei);
    }
    dateien.push(ziel);
    return ziel;
  }
  function lege(name: string, extra?: (db: DatabaseSync, inbox: number) => void): string {
    const ziel = zielPfad(name);
    const db = new DatabaseSync(ziel);
    try {
      db.exec('PRAGMA foreign_keys = OFF');
      db.exec(DDL);
      db.prepare(`UPDATE "topic" SET account_id = 'ada' WHERE name_key = 'inbox'`).run();
      const inbox = Number((db.prepare(`SELECT id FROM "topic" WHERE name_key = 'inbox'`).get() as { id: number }).id);
      const home = Number(db.prepare(`INSERT INTO "topic" (name, name_key, created, account_id) VALUES ('Home', 'home', '2026-08-01T00:00:00.000Z', 'bea')`).run().lastInsertRowid);
      const einfuegen = db.prepare(`INSERT INTO "note" (text, created, topic_id, source, ai_confidence, client_id, pinned, account_id, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const revision = db.prepare(`INSERT INTO "note_revision" (note_id, text, version, created, account_id) VALUES (?, ?, 1, '2026-08-01T01:00:00.000Z', ?)`);
      let erste = 0;
      NOTIZEN.forEach((eintrag, index) => {
        const id = Number(einfuegen.run(eintrag.text, `2026-08-01T00:00:${String(index).padStart(2, '0')}.000Z`, eintrag.thema === 'home' ? home : inbox, eintrag.source, eintrag.ai, eintrag.client, eintrag.pinned, eintrag.konto, eintrag.version).lastInsertRowid);
        if (erste === 0) erste = id;
        if (eintrag.alt) revision.run(id, eintrag.alt, eintrag.konto);
      });
      db.prepare(`INSERT INTO "correction" (note_id, from_topic_id, to_topic_id, created) VALUES (?, ?, ?, '2026-08-02T00:00:00.000Z')`).run(erste, inbox, home);
      const wieder = JSON.stringify({ note: { id: 77, text: 'restore this note', created: '2026-08-03T00:00:00.000Z', topicId: inbox, source: 'manual', aiConfidence: null, clientId: null, pinned: 0, version: 1 }, corrections: [] });
      const undo = db.prepare(`INSERT INTO "note_undo" (token, payload, created, account_id) VALUES (?, ?, '2026-08-03T00:00:00.000Z', 'ada')`);
      undo.run('tok-wieder', wieder);
      undo.run('tok-sammel', SAMMEL);
      undo.run('tok-fremd', FREMD);
      undo.run('tok-seite', SEITE);
      db.prepare(`INSERT INTO "topic_undo" (token, payload, created, account_id) VALUES ('tok-thema', ?, '2026-08-03T00:00:00.000Z', 'bea')`).run(THEMA);
      extra?.(db, inbox);
    } finally {
      db.close();
    }
    return ziel;
  }
  function lies(pfad: string): RohNotiz[] {
    const db = new DatabaseSync(pfad, { readOnly: true });
    try {
      return db.prepare(`SELECT id, text, created, topic_id, source, ai_confidence, client_id, pinned, account_id, version FROM "note" ORDER BY id`).all() as unknown as RohNotiz[];
    } finally {
      db.close();
    }
  }
  function gewandelt(name: string): { db: DatabaseSync; vorher: RohNotiz[]; pfad: string } {
    const pfad = lege(name);
    return { pfad, vorher: lies(pfad), db: merke(oeffneDatenbank(pfad)) };
  }
  function spalten(db: DatabaseSync, tabelle: string): string[] {
    return (db.prepare(`PRAGMA table_info("${tabelle}")`).all() as Array<{ name: string }>).map((spalte) => spalte.name);
  }
  function namen(db: DatabaseSync, sql: string): string[] {
    return (db.prepare(sql).all() as Array<{ name: string }>).map((zeile) => zeile.name);
  }
  function zahl(db: DatabaseSync, sql: string): number {
    return Number((db.prepare(sql).get() as { n: number }).n);
  }
  function sha(datei: string): string {
    return crypto.createHash('sha256').update(fs.readFileSync(datei)).digest('hex');
  }
  function treffer(db: DatabaseSync, wort: string): number[] {
    return (db.prepare('SELECT rowid FROM note_fts WHERE note_fts MATCH ?').all(`"${wort}"`) as Array<{ rowid: number }>).map((zeile) => Number(zeile.rowid));
  }
  function bleibtAlt(ziel: string): void {
    const vorher = fs.readFileSync(ziel);
    let geoeffnet: DatabaseSync | null = null;
    expect(() => { geoeffnet = oeffneDatenbank(ziel); }).toThrow(ALTES_SCHEMA);
    if (geoeffnet) zu(merke(geoeffnet));
    expect(fs.readFileSync(ziel).equals(vorher)).toBe(true);
    for (const extra of ['-wal', '-shm', '-journal']) expect(fs.existsSync(`${ziel}${extra}`)).toBe(false);
  }

  it('recognizes only the 1.14.3 note schema', () => {
    const alt = lege('erkennen');
    expect(schemaArt(alt)).toBe('alt1143');
    expect(erkenneAltstand(alt)).toBe(true);
    const db = merke(new DatabaseSync(alt));
    db.exec('PRAGMA user_version = 7');
    zu(db);
    expect(schemaArt(alt)).toBe('unbekannt');
    expect(erkenneAltstand(alt)).toBe(false);
    const klein = zielPfad('ohne-spalte');
    const roh = new DatabaseSync(klein);
    roh.exec('CREATE TABLE "note" (id INTEGER PRIMARY KEY, text TEXT NOT NULL)');
    roh.exec('PRAGMA user_version = 8');
    roh.close();
    expect(schemaArt(klein)).toBe('unbekannt');
    const frisch = zielPfad('frisch');
    zu(merke(oeffneDatenbank(frisch)));
    expect(schemaArt(frisch)).toBe('keins');
    expect(erkenneAltstand(frisch)).toBe(false);
  });

  it('rebuilds notes and keeps every other column', () => {
    const { db, vorher } = gewandelt('umbau');
    const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    expect(version).toBe(1);
    expect(version).toBe(MIGRATIONEN.length);
    expect(vorher).toHaveLength(NOTIZEN.length);
    for (const vor of vorher) {
      const nach = db.prepare(`SELECT text, created, topic_id, source, ai_confidence, client_id, pinned, account_id, version FROM "note" WHERE id = ?`).get(vor.id) as Omit<RohNotiz, 'id'>;
      expect(nach).toEqual({
        text: vor.text, created: vor.created, topic_id: vor.topic_id, source: vor.source, ai_confidence: vor.ai_confidence,
        client_id: vor.client_id, pinned: vor.pinned, account_id: vor.account_id, version: vor.version,
      });
    }
    const gehalten = vorher.find((zeile) => zeile.version === 2);
    expect(db.prepare('SELECT note_id, text, version FROM "note_revision"').all()).toEqual([{ note_id: gehalten?.id, text: 'alte fassung', version: 1 }]);
    expect(zahl(db, 'SELECT COUNT(*) AS n FROM "note_revision"')).toBe(1);
    expect(zahl(db, 'SELECT COUNT(*) AS n FROM "correction"')).toBe(1);
    expect(zahl(db, 'SELECT COUNT(*) AS n FROM "version_hint"')).toBe(0);
  });

  it('round-trips note text and the checksum', () => {
    const { db, vorher } = gewandelt('rund');
    const zurueck: string[] = [];
    for (const vor of vorher) {
      const nach = db.prepare('SELECT text, doc FROM "note" WHERE id = ?').get(vor.id) as { text: string; doc: string };
      expect(nach.text).toBe(vor.text);
      expect(textAusSpalte(nach.doc)).toBe(vor.text);
      zurueck.push(textAusSpalte(nach.doc));
    }
    expect(textSumme(zurueck)).toBe(textSumme(vorher.map((zeile) => zeile.text)));
    const rev = db.prepare('SELECT text, doc FROM "note_revision"').get() as { text: string; doc: string };
    expect(rev.text).toBe('alte fassung');
    expect(textAusSpalte(rev.doc)).toBe('alte fassung');
  });

  it('keeps the old text column nullable', () => {
    const { db } = gewandelt('nullable');
    for (const tabelle of ['note', 'note_revision']) {
      const info = db.prepare(`PRAGMA table_info("${tabelle}")`).all() as Array<{ name: string; notnull: number }>;
      expect(info.find((spalte) => spalte.name === 'text')?.notnull).toBe(0);
      expect(info.find((spalte) => spalte.name === 'doc')?.notnull).toBe(1);
    }
    const thema = (db.prepare(`SELECT id FROM "topic" WHERE account_id = 'ada' LIMIT 1`).get() as { id: number }).id;
    const id = Number(db.prepare(`INSERT INTO "note" (doc, created, topic_id, source, account_id) VALUES (?, '2026-09-01T00:00:00.000Z', ?, 'manual', 'ada')`).run(spalteAusText('neu'), thema).lastInsertRowid);
    expect(db.prepare('SELECT text FROM "note" WHERE id = ?').get(id)).toEqual({ text: null });
    const rev = Number(db.prepare(`INSERT INTO "note_revision" (note_id, doc, version, created, account_id) VALUES (?, ?, 1, '2026-09-01T00:00:00.000Z', 'ada')`).run(id, spalteAusText('rev')).lastInsertRowid);
    expect(db.prepare('SELECT text FROM "note_revision" WHERE id = ?').get(rev)).toEqual({ text: null });
  });

  it('converts undo payloads and restores the note', () => {
    const { db } = gewandelt('undo');
    const roh = db.prepare(`SELECT payload FROM "note_undo" WHERE token = 'tok-wieder'`).get() as { payload: string };
    const bild = JSON.parse(roh.payload) as { note: Record<string, unknown>; corrections: unknown[] };
    expect(Object.keys(bild.note)).toEqual(['id', 'doc', 'created', 'topicId', 'source', 'aiConfidence', 'clientId', 'pinned', 'version']);
    expect(bild.note.text).toBeUndefined();
    expect(textAusSpalte(String(bild.note.doc))).toBe('restore this note');
    expect(bild.corrections).toEqual([]);
    expect(db.prepare(`SELECT payload FROM "note_undo" WHERE token = 'tok-sammel'`).get()).toEqual({ payload: SAMMEL });
    expect(db.prepare(`SELECT payload FROM "note_undo" WHERE token = 'tok-fremd'`).get()).toEqual({ payload: FREMD });
    expect(db.prepare(`SELECT payload FROM "note_undo" WHERE token = 'tok-seite'`).get()).toEqual({ payload: SEITE });
    expect(db.prepare(`SELECT payload FROM "topic_undo" WHERE token = 'tok-thema'`).get()).toEqual({ payload: THEMA });
    expect(stelleNotizHer(db, 'tok-wieder', 'ada')).toMatchObject({ id: 77, text: 'restore this note', topic: 'Inbox', source: 'manual', version: 1 });
    expect(db.prepare('SELECT text FROM "note" WHERE id = 77').get()).toEqual({ text: null });
    expect(db.prepare(`SELECT payload FROM "note_undo" WHERE token = 'tok-sammel'`).get()).toEqual({ payload: SAMMEL });
  });

  it('rebuilds the search index and keeps triggers', () => {
    const { db } = gewandelt('suche');
    expect(zahl(db, 'SELECT COUNT(*) AS n FROM note_fts')).toBe(zahl(db, 'SELECT COUNT(*) AS n FROM "note"'));
    const form = db.prepare(`SELECT id FROM "note" WHERE text LIKE '%**fett**%'`).get() as { id: number };
    const index = db.prepare('SELECT text FROM note_fts WHERE rowid = ?').get(form.id) as { text: string };
    expect(index.text).toContain('fett');
    expect(index.text).toContain('Dairy');
    expect(index.text.includes('**') || index.text.includes('##') || index.text.includes('- [ ]')).toBe(false);
    expect(treffer(db, 'Frische')).toHaveLength(1);
    const sql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'trigger'`).all() as Array<{ sql: string }>).map((zeile) => zeile.sql).join('\n');
    expect(sql).toContain('cortx_suchtext(new.doc)');
    expect(sql).toContain('DELETE FROM note_fts WHERE rowid = old.id');
    const thema = (db.prepare(`SELECT id FROM "topic" WHERE account_id = 'ada' LIMIT 1`).get() as { id: number }).id;
    const id = Number(db.prepare(`INSERT INTO "note" (doc, created, topic_id, source, account_id) VALUES (?, '2026-09-02T00:00:00.000Z', ?, 'manual', 'ada')`).run(spalteAusText('fresh alpha word'), thema).lastInsertRowid);
    expect(treffer(db, 'alpha')).toEqual([id]);
    db.prepare('UPDATE "note" SET doc = ? WHERE id = ?').run(spalteAusText('fresh beta word'), id);
    expect(treffer(db, 'alpha')).toEqual([]);
    expect(treffer(db, 'beta')).toEqual([id]);
    db.prepare('DELETE FROM "note" WHERE id = ?').run(id);
    expect(treffer(db, 'beta')).toEqual([]);
  });

  it('rolls back when a round-trip differs and names only the id', () => {
    const pfad = lege('rund-fehler', (db, inbox) => {
      db.prepare(`INSERT INTO "note" (text, created, topic_id, source, account_id) VALUES (?, '2026-08-09T00:00:00.000Z', ?, 'manual', 'ada')`).run(GEHEIM, inbox);
    });
    const vorher = fs.readFileSync(pfad);
    const db = merke(new DatabaseSync(pfad));
    let meldung = '';
    try {
      wandleAltstand(db, { spalteAusText: (text: string) => spalteAusText(text.length >= 0 ? 'anders' : text) });
    } catch (fehler) {
      meldung = fehler instanceof Error ? fehler.message : String(fehler);
    }
    zu(db);
    expect(meldung.startsWith('Bestand round-trip failed:')).toBe(true);
    expect(meldung).toMatch(/note \d+: (length|differs at \d+)/);
    expect(meldung.includes(GEHEIM) || meldung.includes('Frische Milch')).toBe(false);
    expect(fs.readFileSync(pfad).equals(vorher)).toBe(true);
    for (const extra of ['-wal', '-shm', '-journal']) expect(fs.existsSync(`${pfad}${extra}`)).toBe(false);
    const kontrolle = merke(new DatabaseSync(pfad, { readOnly: true }));
    expect((kontrolle.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(8);
    expect(spalten(kontrolle, 'note')).not.toContain('doc');
    expect(kontrolle.prepare('SELECT text FROM "note" WHERE text = ?').get(GEHEIM)).toEqual({ text: GEHEIM });
  });

  it('rolls back when the rebuild fails after the note table', () => {
    const pfad = lege('abbruch');
    const vorher = fs.readFileSync(pfad);
    const db = merke(new DatabaseSync(pfad));
    expect(() => wandleAltstand(db, { nachSchritt(schritt: number) { if (schritt === NACH_NOTE) throw new Error('halt-nach-5'); } })).toThrow(/halt-nach-5/);
    zu(db);
    expect(fs.readFileSync(pfad).equals(vorher)).toBe(true);
    for (const extra of ['-wal', '-shm', '-journal']) expect(fs.existsSync(`${pfad}${extra}`)).toBe(false);
    const kontrolle = merke(new DatabaseSync(pfad, { readOnly: true }));
    expect((kontrolle.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(8);
    expect(spalten(kontrolle, 'note')).toContain('text');
    expect(spalten(kontrolle, 'note')).not.toContain('doc');
    expect(kontrolle.prepare(`SELECT text FROM "note" WHERE text LIKE '# Milch%'`).get()).toEqual({ text: '# Milch\n\nFrische Milch' });
    expect((kontrolle.prepare(`SELECT sql FROM sqlite_master WHERE name = 'note_fts'`).get() as { sql: string }).sql).toContain("content='note'");
  });

  it('does nothing on a second open', () => {
    const pfad = lege('zweiter');
    const texte = lies(pfad).map((zeile) => zeile.text);
    const kurz = textSumme(texte).slice(0, 12);
    const fund: string[] = [];
    const original = console.log;
    console.log = ((...args: unknown[]) => {
      const text = args.map((teil) => String(teil)).join(' ');
      if (text.startsWith('bestand ')) fund.push(text);
      else original(...args);
    }) as typeof console.log;
    try {
      zu(merke(oeffneDatenbank(pfad)));
      const hash = sha(pfad);
      expect(fund).toEqual([`bestand 1.14.3 -> doc: ${texte.length} notes, 1 revisions, 1 undo, checksum ${kurz} ok`]);
      zu(merke(oeffneDatenbank(pfad)));
      expect(sha(pfad)).toBe(hash);
      expect(fund).toHaveLength(1);
      expect(erkenneAltstand(pfad)).toBe(false);
    } finally {
      console.log = original;
    }
  });

  it('matches a fresh database except the old text columns', () => {
    const { db } = gewandelt('signatur');
    const frisch = merke(oeffneDatenbank(SPEICHER));
    const tabellen = `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'note_fts_%' ORDER BY name`;
    expect(namen(db, tabellen)).toEqual(namen(frisch, tabellen));
    for (const name of namen(frisch, tabellen)) {
      const ist = spalten(db, name).filter((spalte) => spalte !== 'text' || (name !== 'note' && name !== 'note_revision'));
      expect(ist).toEqual(spalten(frisch, name));
    }
    expect(namen(db, `SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name`)).toEqual(namen(frisch, `SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name`));
    expect(namen(db, `SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`)).toEqual(namen(frisch, `SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`));
    expect((db.prepare(`SELECT sql FROM sqlite_master WHERE name = 'note_client_id'`).get() as { sql: string }).sql).toContain('WHERE client_id IS NOT NULL');
    for (const name of ['note', 'note_revision']) expect(spalten(frisch, name)).not.toContain('text');
  });

  it('opens the 1.14.3 file in wal mode while an iterator stays open', () => {
    const { db } = gewandelt('wal');
    expect((db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode).toBe('wal');
    const lauf = merkeLeser(db.prepare('SELECT id FROM "note"').iterate());
    expect(lauf.next().done).toBe(false);
    expect(() => checkpointBeimOeffnen(db)).not.toThrow();
    let rest = lauf.next();
    while (!rest.done) rest = lauf.next();
  });

  it('rejects an unknown old schema and leaves the file unchanged', () => {
    const alt = lege('uv7');
    const db = merke(new DatabaseSync(alt));
    db.exec('PRAGMA user_version = 7');
    zu(db);
    bleibtAlt(alt);
    const klein = zielPfad('uv8-klein');
    const roh = new DatabaseSync(klein);
    roh.exec('CREATE TABLE "note" (id INTEGER PRIMARY KEY, text TEXT NOT NULL)');
    roh.exec('PRAGMA user_version = 8');
    roh.close();
    bleibtAlt(klein);
  });
});
