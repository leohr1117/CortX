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
];
