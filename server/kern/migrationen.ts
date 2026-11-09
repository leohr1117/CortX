import type { DatabaseSync } from 'node:sqlite';

export type MigrationsSchritt = string | ((db: DatabaseSync) => void);

export function migrationsSql(index: number): string {
  const schritt = MIGRATIONEN[index];
  if (typeof schritt !== 'string') throw new Error('That migration step is not SQL.');
  return schritt;
}

export const MIGRATIONEN: readonly MigrationsSchritt[] = [
  `
  CREATE TABLE "topic" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    created TEXT NOT NULL,
    account_id TEXT
  );

  CREATE UNIQUE INDEX topic_konto_key ON "topic"(account_id, name_key);
  CREATE INDEX topic_konto ON "topic"(account_id);

  INSERT INTO "topic" (name, name_key, created)
  VALUES ('Inbox', 'inbox', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  CREATE TABLE "note" (
    id INTEGER PRIMARY KEY,
    doc TEXT NOT NULL,
    created TEXT NOT NULL,
    topic_id INTEGER NOT NULL REFERENCES "topic"(id),
    source TEXT NOT NULL CHECK (source IN ('tag', 'ai', 'manual')),
    ai_confidence REAL CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
    client_id TEXT,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    account_id TEXT,
    version INTEGER NOT NULL DEFAULT 1
  );

  CREATE INDEX note_topic ON "note"(topic_id);
  CREATE UNIQUE INDEX note_client_id ON "note"(client_id) WHERE client_id IS NOT NULL;
  CREATE INDEX note_konto ON "note"(account_id);

  CREATE TABLE "correction" (
    id INTEGER PRIMARY KEY,
    note_id INTEGER NOT NULL REFERENCES "note"(id),
    from_topic_id INTEGER NOT NULL REFERENCES "topic"(id),
    to_topic_id INTEGER NOT NULL REFERENCES "topic"(id),
    created TEXT NOT NULL
  );
  CREATE INDEX correction_note ON "correction"(note_id);

  CREATE TABLE "topic_undo" (
    token TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created TEXT NOT NULL,
    account_id TEXT
  );

  CREATE TABLE "note_undo" (
    token TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created TEXT NOT NULL,
    account_id TEXT
  );

  CREATE TABLE "session" (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    created TEXT NOT NULL,
    expires TEXT NOT NULL,
    stride_checked TEXT NOT NULL,
    stride_material TEXT
  );

  CREATE TABLE "signin_failure" (
    id INTEGER PRIMARY KEY,
    ip TEXT NOT NULL,
    at TEXT NOT NULL
  );
  CREATE INDEX signin_failure_at ON "signin_failure"(at);

  CREATE TABLE "account_claim" (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    account_id TEXT NOT NULL,
    claimed TEXT NOT NULL
  );

  CREATE TABLE "version_hint" (
    account_id TEXT PRIMARY KEY,
    notified TEXT,
    seen TEXT
  );

  CREATE TABLE "note_revision" (
    id INTEGER PRIMARY KEY,
    note_id INTEGER NOT NULL REFERENCES "note"(id) ON DELETE CASCADE,
    doc TEXT NOT NULL,
    version INTEGER NOT NULL,
    created TEXT NOT NULL,
    account_id TEXT
  );
  CREATE INDEX note_revision_note ON "note_revision"(note_id);

  CREATE VIRTUAL TABLE note_fts USING fts5(
    text,
    tokenize='unicode61 remove_diacritics 1'
  );

  CREATE TRIGGER note_fts_insert AFTER INSERT ON "note" BEGIN
    INSERT INTO note_fts(rowid, text) VALUES (new.id, cortx_suchtext(new.doc));
  END;

  CREATE TRIGGER note_fts_delete AFTER DELETE ON "note" BEGIN
    DELETE FROM note_fts WHERE rowid = old.id;
  END;

  CREATE TRIGGER note_fts_update AFTER UPDATE ON "note" BEGIN
    DELETE FROM note_fts WHERE rowid = old.id;
    INSERT INTO note_fts(rowid, text) VALUES (new.id, cortx_suchtext(new.doc));
  END;
  `,
];
