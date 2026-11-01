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
];

