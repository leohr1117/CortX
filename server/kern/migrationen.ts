export const MIGRATIONEN: readonly string[] = [
  `
  CREATE TABLE "topic" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    created TEXT NOT NULL
  );

  CREATE TABLE "note" (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    created TEXT NOT NULL,
    topic_id INTEGER NOT NULL REFERENCES "topic"(id),
    source TEXT NOT NULL CHECK (source IN ('tag', 'ai', 'manual')),
    ai_confidence REAL CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1))
  );

  CREATE INDEX note_topic ON "note"(topic_id);

  INSERT INTO "topic" (name, name_key, created)
  VALUES ('Inbox', 'inbox', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  `,
  `
  ALTER TABLE "note" ADD COLUMN client_id TEXT;
  ALTER TABLE "note" ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1));
  CREATE UNIQUE INDEX note_client_id ON "note"(client_id) WHERE client_id IS NOT NULL;
  CREATE TABLE "correction" (
    id INTEGER PRIMARY KEY,
    note_id INTEGER NOT NULL REFERENCES "note"(id),
    from_topic_id INTEGER NOT NULL REFERENCES "topic"(id),
    to_topic_id INTEGER NOT NULL REFERENCES "topic"(id),
    created TEXT NOT NULL
  );
  CREATE INDEX correction_note ON "correction"(note_id);
  `,
  `
  CREATE TABLE "topic_undo" (
    token TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE "note_undo" (
    token TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE "topic_neu" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    created TEXT NOT NULL,
    account_id TEXT
  );

  INSERT INTO "topic_neu" (id, name, name_key, created, account_id)
  SELECT id, name, name_key, created, NULL FROM "topic";

  DROP TABLE "topic";
  ALTER TABLE "topic_neu" RENAME TO "topic";

  CREATE UNIQUE INDEX topic_konto_key ON "topic"(account_id, name_key);
  CREATE INDEX topic_konto ON "topic"(account_id);

  ALTER TABLE "note" ADD COLUMN account_id TEXT;
  CREATE INDEX note_konto ON "note"(account_id);

  ALTER TABLE "topic_undo" ADD COLUMN account_id TEXT;
  ALTER TABLE "note_undo" ADD COLUMN account_id TEXT;

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
  `,
];

