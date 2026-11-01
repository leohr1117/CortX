import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

interface Lauf {
  datenbank: string;
}

interface ThemaZeile {
  id: number;
  name: string;
  name_key: string;
  created: string;
}

interface NotizZeile {
  id: number;
  text: string;
  created: string;
  topic_id: number;
  source: string;
  ai_confidence: number | null;
  client_id: string | null;
  pinned: number;
}

interface KorrekturZeile {
  id: number;
  note_id: number;
  from_topic_id: number;
  to_topic_id: number;
  created: string;
}

export interface Bestand {
  topics: ThemaZeile[];
  notes: NotizZeile[];
  corrections: KorrekturZeile[];
}

export interface SaatNotiz {
  text: string;
  created: string;
}

export interface SaatThema {
  name: string;
  notizen: SaatNotiz[];
}

function oeffne(): DatabaseSync {
  const lauf = JSON.parse(fs.readFileSync('tmp-test/e2e-server.json', 'utf8')) as Lauf;
  const db = new DatabaseSync(lauf.datenbank);
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function schreib(arbeit: (db: DatabaseSync) => void): void {
  const db = oeffne();
  db.exec('BEGIN IMMEDIATE');
  try {
    arbeit(db);
    db.exec('COMMIT');
  } catch (fehler) {
    db.exec('ROLLBACK');
    throw fehler;
  } finally {
    db.close();
  }
}

export function sichereBestand(): Bestand {
  const db = oeffne();
  try {
    return {
      topics: db.prepare('SELECT id, name, name_key, created FROM "topic" ORDER BY id').all() as unknown as ThemaZeile[],
      notes: db
        .prepare(
          'SELECT id, text, created, topic_id, source, ai_confidence, client_id, pinned FROM "note" ORDER BY id',
        )
        .all() as unknown as NotizZeile[],
      corrections: db
        .prepare('SELECT id, note_id, from_topic_id, to_topic_id, created FROM "correction" ORDER BY id')
        .all() as unknown as KorrekturZeile[],
    };
  } finally {
    db.close();
  }
}

export function stelleBestand(bestand: Bestand): void {
  schreib((db) => {
    db.exec('DELETE FROM "correction"');
    db.exec('DELETE FROM "note"');
    db.exec('DELETE FROM "topic"');
    const thema = db.prepare('INSERT INTO "topic" (id, name, name_key, created) VALUES (?, ?, ?, ?)');
    for (const zeile of bestand.topics) thema.run(zeile.id, zeile.name, zeile.name_key, zeile.created);
    const notiz = db.prepare(
      `INSERT INTO "note" (id, text, created, topic_id, source, ai_confidence, client_id, pinned)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const zeile of bestand.notes) {
      notiz.run(
        zeile.id,
        zeile.text,
        zeile.created,
        zeile.topic_id,
        zeile.source,
        zeile.ai_confidence,
        zeile.client_id,
        zeile.pinned,
      );
    }
    const korrektur = db.prepare(
      `INSERT INTO "correction" (id, note_id, from_topic_id, to_topic_id, created) VALUES (?, ?, ?, ?, ?)`,
    );
    for (const zeile of bestand.corrections) {
      korrektur.run(zeile.id, zeile.note_id, zeile.from_topic_id, zeile.to_topic_id, zeile.created);
    }
  });
}

export function setzeSchauspiel(themen: readonly SaatThema[]): void {
  schreib((db) => {
    db.exec('DELETE FROM "correction"');
    db.exec('DELETE FROM "note"');
    db.exec(`DELETE FROM "topic" WHERE name_key != 'inbox'`);
    const einfuegen = db.prepare('INSERT INTO "topic" (name, name_key, created) VALUES (?, ?, ?)');
    const notiz = db.prepare(
      `INSERT INTO "note" (text, created, topic_id, source, ai_confidence, client_id, pinned)
       VALUES (?, ?, ?, 'manual', NULL, NULL, 0)`,
    );
    const inbox = db.prepare(`SELECT id FROM "topic" WHERE name_key = 'inbox'`).get() as { id: number } | undefined;
    if (!inbox) throw new Error('Inbox is missing.');
    const jetzt = new Date().toISOString();
    for (const eintrag of themen) {
      const schluessel = eintrag.name.toLocaleLowerCase();
      let id = inbox.id;
      if (schluessel !== 'inbox') {
        const info = einfuegen.run(eintrag.name, schluessel, jetzt);
        id = Number(info.lastInsertRowid);
      }
      for (const stueck of eintrag.notizen) notiz.run(stueck.text, stueck.created, id);
    }
  });
}

export function setzeThema(name: string, notizen: readonly SaatNotiz[]): void {
  schreib((db) => {
    const schluessel = name.toLocaleLowerCase();
    const vorhanden = db.prepare('SELECT id FROM "topic" WHERE name_key = ?').get(schluessel) as
      | { id: number }
      | undefined;
    if (!vorhanden) throw new Error(`Topic ${name} is missing.`);
    db.prepare(
      `DELETE FROM "correction" WHERE note_id IN (SELECT id FROM "note" WHERE topic_id = ?)
       OR from_topic_id = ? OR to_topic_id = ?`,
    ).run(vorhanden.id, vorhanden.id, vorhanden.id);
    db.prepare('DELETE FROM "note" WHERE topic_id = ?').run(vorhanden.id);
    const notiz = db.prepare(
      `INSERT INTO "note" (text, created, topic_id, source, ai_confidence, client_id, pinned)
       VALUES (?, ?, ?, 'manual', NULL, NULL, 0)`,
    );
    for (const stueck of notizen) notiz.run(stueck.text, stueck.created, vorhanden.id);
  });
}

export function loescheNotizen(nurInbox: boolean): void {
  schreib((db) => {
    if (nurInbox) {
      db.exec(
        `DELETE FROM "correction" WHERE note_id IN (
           SELECT "note".id FROM "note"
           JOIN "topic" ON "topic".id = "note".topic_id
           WHERE "topic".name_key = 'inbox'
         )`,
      );
      db.exec(`DELETE FROM "note" WHERE topic_id = (SELECT id FROM "topic" WHERE name_key = 'inbox')`);
      return;
    }
    db.exec('DELETE FROM "correction"');
    db.exec('DELETE FROM "note"');
  });
}
