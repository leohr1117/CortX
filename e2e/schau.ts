import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { spalteAusText, textAusSpalte } from '../server/features/notes/lesen.ts';
import { registriereSuchtext } from '../server/kern/db.ts';
import { FESTE_UHR, festesDatum } from './ruhe.ts';

interface Lauf {
  datenbank: string;
}

interface ThemaZeile {
  id: number;
  name: string;
  name_key: string;
  created: string;
  account_id: string | null;
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
  account_id: string | null;
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
  source?: 'tag' | 'ai' | 'manual';
  pinned?: 0 | 1;
}

export interface SaatThema {
  name: string;
  notizen: SaatNotiz[];
}

export interface NotizZeit {
  id: number;
  created: string;
}

export interface FremdBesitz {
  konto: string;
  notizId: number;
  themaId: number;
  themaAngelegt: boolean;
}

const FREMDES_KONTO = 'other-account';

export function versionsNotizZeit(): string {
  return festesDatum(11, 5, 10, 0);
}

function kontoId(db: DatabaseSync): string {
  const zeile = db.prepare('SELECT account_id FROM "session" ORDER BY created DESC LIMIT 1').get() as
    | { account_id: string }
    | undefined;
  if (!zeile) throw new Error('No signed-in account.');
  return zeile.account_id;
}

function oeffne(): DatabaseSync {
  const lauf = JSON.parse(fs.readFileSync('tmp-test/e2e-server.json', 'utf8')) as Lauf;
  const db = new DatabaseSync(lauf.datenbank);
  registriereSuchtext(db);
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function notizAusSpalte(zeile: NotizZeile & { doc: string }): NotizZeile {
  return {
    id: zeile.id,
    text: textAusSpalte(zeile.doc),
    created: zeile.created,
    topic_id: zeile.topic_id,
    source: zeile.source,
    ai_confidence: zeile.ai_confidence,
    client_id: zeile.client_id,
    pinned: zeile.pinned,
    account_id: zeile.account_id,
  };
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
      topics: db
        .prepare('SELECT id, name, name_key, created, account_id FROM "topic" ORDER BY id')
        .all() as unknown as ThemaZeile[],
      notes: (
        db
          .prepare(
            'SELECT id, doc, created, topic_id, source, ai_confidence, client_id, pinned, account_id FROM "note" ORDER BY id',
          )
          .all() as unknown as Array<NotizZeile & { doc: string }>
      ).map(notizAusSpalte),
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
    db.exec('DELETE FROM "topic_undo"');
    db.exec('DELETE FROM "note_undo"');
    db.exec('DELETE FROM "correction"');
    db.exec('DELETE FROM "note"');
    db.exec('DELETE FROM "topic"');
    const thema = db.prepare(
      'INSERT INTO "topic" (id, name, name_key, created, account_id) VALUES (?, ?, ?, ?, ?)',
    );
    for (const zeile of bestand.topics) {
      thema.run(zeile.id, zeile.name, zeile.name_key, zeile.created, zeile.account_id);
    }
    const notiz = db.prepare(
      `INSERT INTO "note" (id, doc, created, topic_id, source, ai_confidence, client_id, pinned, account_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const zeile of bestand.notes) {
      notiz.run(
        zeile.id,
        spalteAusText(zeile.text),
        zeile.created,
        zeile.topic_id,
        zeile.source,
        zeile.ai_confidence,
        zeile.client_id,
        zeile.pinned,
        zeile.account_id,
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
    const konto = kontoId(db);
    db.exec('DELETE FROM "topic_undo"');
    db.exec('DELETE FROM "note_undo"');
    db.exec('DELETE FROM "correction"');
    db.prepare('DELETE FROM "note" WHERE account_id = ?').run(konto);
    db.prepare(`DELETE FROM "topic" WHERE account_id = ? AND name_key != 'inbox'`).run(konto);
    const einfuegen = db.prepare('INSERT INTO "topic" (name, name_key, created, account_id) VALUES (?, ?, ?, ?)');
    const notiz = db.prepare(
      `INSERT INTO "note" (doc, created, topic_id, source, ai_confidence, client_id, pinned, account_id)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`,
    );
    const inbox = db.prepare(`SELECT id FROM "topic" WHERE name_key = 'inbox' AND account_id = ?`).get(konto) as
      | { id: number }
      | undefined;
    if (!inbox) throw new Error('Inbox is missing.');
    const jetzt = FESTE_UHR.toISOString();
    for (const eintrag of themen) {
      const schluessel = eintrag.name.toLocaleLowerCase();
      let id = inbox.id;
      if (schluessel !== 'inbox') {
        const info = einfuegen.run(eintrag.name, schluessel, jetzt, konto);
        id = Number(info.lastInsertRowid);
      }
      for (const stueck of eintrag.notizen) {
        notiz.run(spalteAusText(stueck.text), stueck.created, id, stueck.source ?? 'manual', stueck.pinned ?? 0, konto);
      }
    }
  });
}

export function setzeThema(name: string, notizen: readonly SaatNotiz[]): void {
  schreib((db) => {
    const konto = kontoId(db);
    const schluessel = name.toLocaleLowerCase();
    const vorhanden = db.prepare('SELECT id FROM "topic" WHERE name_key = ? AND account_id = ?').get(schluessel, konto) as
      | { id: number }
      | undefined;
    if (!vorhanden) throw new Error(`Topic ${name} is missing.`);
    db.exec('DELETE FROM "note_undo"');
    db.prepare(
      `DELETE FROM "correction" WHERE note_id IN (SELECT id FROM "note" WHERE topic_id = ?)
       OR from_topic_id = ? OR to_topic_id = ?`,
    ).run(vorhanden.id, vorhanden.id, vorhanden.id);
    db.prepare('DELETE FROM "note" WHERE topic_id = ? AND account_id = ?').run(vorhanden.id, konto);
    const notiz = db.prepare(
      `INSERT INTO "note" (doc, created, topic_id, source, ai_confidence, client_id, pinned, account_id)
       VALUES (?, ?, ?, 'manual', NULL, NULL, 0, ?)`,
    );
    for (const stueck of notizen) notiz.run(spalteAusText(stueck.text), stueck.created, vorhanden.id, konto);
  });
}

export function legeFremdeNotiz(text: string): FremdBesitz {
  const beleg: FremdBesitz = {
    konto: FREMDES_KONTO,
    notizId: 0,
    themaId: 0,
    themaAngelegt: false,
  };
  schreib((db) => {
    const jetzt = FESTE_UHR.toISOString();
    const vorhanden = db.prepare(`SELECT id FROM "topic" WHERE name_key = 'inbox' AND account_id = ?`).get(beleg.konto) as
      | { id: number }
      | undefined;
    if (vorhanden) {
      beleg.themaId = vorhanden.id;
    } else {
      const thema = db
        .prepare(`INSERT INTO "topic" (name, name_key, created, account_id) VALUES ('Inbox', 'inbox', ?, ?)`)
        .run(jetzt, beleg.konto);
      beleg.themaId = Number(thema.lastInsertRowid);
      beleg.themaAngelegt = true;
    }
    const notiz = db
      .prepare(
        `INSERT INTO "note" (doc, created, topic_id, source, ai_confidence, client_id, pinned, account_id)
         VALUES (?, ?, ?, 'manual', NULL, NULL, 0, ?)`,
      )
      .run(spalteAusText(text), jetzt, beleg.themaId, beleg.konto);
    beleg.notizId = Number(notiz.lastInsertRowid);
  });
  return beleg;
}

export function entferneVersionsstand(): void {
  schreib((db) => {
    db.prepare('DELETE FROM "version_hint" WHERE account_id = ?').run(kontoId(db));
  });
}

export function merkeNotizZeiten(): NotizZeit[] {
  const db = oeffne();
  try {
    return db
      .prepare('SELECT id, created FROM "note" WHERE account_id = ? ORDER BY id')
      .all(kontoId(db)) as unknown as NotizZeit[];
  } finally {
    db.close();
  }
}

export function setzeNotizZeiten(zeiten: readonly NotizZeit[]): void {
  schreib((db) => {
    const konto = kontoId(db);
    const setzen = db.prepare('UPDATE "note" SET created = ? WHERE id = ? AND account_id = ?');
    for (const zeile of zeiten) setzen.run(zeile.created, zeile.id, konto);
  });
}

export function setzeAlleNotizZeiten(created: string): NotizZeit[] {
  const vorher = merkeNotizZeiten();
  setzeNotizZeiten(vorher.map((zeile) => ({ id: zeile.id, created })));
  return vorher;
}

export function erstellteFremdeNotiz(text: string): string | null {
  const db = oeffne();
  try {
    const zeilen = db.prepare('SELECT doc, created FROM "note" WHERE account_id = ?').all(FREMDES_KONTO) as Array<{
      doc: string;
      created: string;
    }>;
    return zeilen.find((zeile) => textAusSpalte(zeile.doc) === text)?.created ?? null;
  } finally {
    db.close();
  }
}

export function entferneFremdeNotiz(beleg: FremdBesitz): void {
  schreib((db) => {
    const eigene = db.prepare('SELECT id FROM "note" WHERE id = ? AND account_id = ?').get(beleg.notizId, beleg.konto) as
      | { id: number }
      | undefined;
    if (!eigene) return;
    db.prepare('DELETE FROM "correction" WHERE note_id = ?').run(beleg.notizId);
    db.prepare('DELETE FROM "note" WHERE id = ? AND account_id = ?').run(beleg.notizId, beleg.konto);
    if (!beleg.themaAngelegt) return;
    const notizen = db.prepare('SELECT count(*) AS n FROM "note" WHERE topic_id = ?').get(beleg.themaId) as {
      n: number;
    };
    if (notizen.n !== 0) return;
    const korrekturen = db
      .prepare('SELECT count(*) AS n FROM "correction" WHERE from_topic_id = ? OR to_topic_id = ?')
      .get(beleg.themaId, beleg.themaId) as { n: number };
    if (korrekturen.n !== 0) return;
    db.prepare('DELETE FROM "topic" WHERE id = ? AND account_id = ?').run(beleg.themaId, beleg.konto);
  });
}

export function loescheNotizen(nurInbox: boolean): void {
  schreib((db) => {
    const konto = kontoId(db);
    db.exec('DELETE FROM "note_undo"');
    if (nurInbox) {
      db.prepare(
        `DELETE FROM "correction" WHERE note_id IN (
           SELECT "note".id FROM "note"
           JOIN "topic" ON "topic".id = "note".topic_id
           WHERE "topic".name_key = 'inbox' AND "topic".account_id = ?
         )`,
      ).run(konto);
      db.prepare(
        `DELETE FROM "note" WHERE account_id = ? AND topic_id = (
           SELECT id FROM "topic" WHERE name_key = 'inbox' AND account_id = ?
         )`,
      ).run(konto, konto);
      return;
    }
    db.exec('DELETE FROM "correction"');
    db.prepare('DELETE FROM "note" WHERE account_id = ?').run(konto);
  });
}
