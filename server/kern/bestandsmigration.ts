import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spalteAusText, textAusSpalte } from '../features/notes/lesen.ts';
import { MIGRATIONEN } from './migrationen.ts';

export type SchemaArt = 'alt1143' | 'unbekannt' | 'keins';

export interface WandelBericht {
  notizen: number;
  revisionen: number;
  undo: number;
  summe: string;
}

export interface WandelHaken {
  nachSchritt?: (schritt: number) => void;
  spalteAusText?: (text: string) => string;
}

/** Plan step 5: the note table is rebuilt and the transaction is still open. */
export const NACH_NOTE = 5;

const ALT_NOTE = ['id', 'text', 'created', 'topic_id', 'source', 'ai_confidence', 'client_id', 'pinned', 'account_id', 'version'];
const TABELLEN = [
  'account_claim', 'correction', 'note', 'note_fts', 'note_revision', 'note_undo',
  'session', 'signin_failure', 'topic', 'topic_undo', 'version_hint',
];
const SPALTEN: Record<string, readonly string[]> = {
  account_claim: ['id', 'account_id', 'claimed'],
  correction: ['id', 'note_id', 'from_topic_id', 'to_topic_id', 'created'],
  note: ['id', 'doc', 'created', 'topic_id', 'source', 'ai_confidence', 'client_id', 'pinned', 'account_id', 'version'],
  note_fts: ['text'],
  note_revision: ['id', 'note_id', 'doc', 'version', 'created', 'account_id'],
  note_undo: ['token', 'payload', 'created', 'account_id'],
  session: ['token_hash', 'account_id', 'created', 'expires', 'stride_checked', 'stride_material'],
  signin_failure: ['id', 'ip', 'at'],
  topic: ['id', 'name', 'name_key', 'created', 'account_id'],
  topic_undo: ['token', 'payload', 'created', 'account_id'],
  version_hint: ['account_id', 'notified', 'seen'],
};
const INDIZES = [
  'correction_note', 'note_client_id', 'note_konto', 'note_revision_note', 'note_topic',
  'signin_failure_at', 'topic_konto', 'topic_konto_key',
];
const TRIGGER = ['note_fts_delete', 'note_fts_insert', 'note_fts_update'];
// text stays nullable: 1.14.3 original, not written since 1.14.4
const NOTE_NEU = 'CREATE TABLE "note_neu" (id INTEGER PRIMARY KEY, doc TEXT NOT NULL, created TEXT NOT NULL, topic_id INTEGER NOT NULL REFERENCES "topic"(id), source TEXT NOT NULL CHECK (source IN (\'tag\', \'ai\', \'manual\')), ai_confidence REAL CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)), client_id TEXT, pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)), account_id TEXT, version INTEGER NOT NULL DEFAULT 1, text TEXT)';
const REV_NEU = 'CREATE TABLE "note_revision_neu" (id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL REFERENCES "note"(id) ON DELETE CASCADE, doc TEXT NOT NULL, version INTEGER NOT NULL, created TEXT NOT NULL, account_id TEXT, text TEXT)';

interface AltNotiz {
  id: number;
  text: string;
  created: string;
  topic_id: number;
  source: string;
  ai_confidence: number | null;
  client_id: string | null;
  pinned: number;
  account_id: string | null;
  version: number;
}

interface AltRevision {
  id: number;
  note_id: number;
  text: string;
  version: number;
  created: string;
  account_id: string | null;
}

interface AltUndo {
  token: string;
  payload: string;
  created: string;
  account_id: string | null;
}

type ZuDoc = (text: string) => string;

export function textSumme(texte: readonly string[]): string {
  const hash = createHash('sha256');
  for (const text of texte) {
    hash.update(String(text.length));
    hash.update('\n');
    hash.update(text);
    hash.update('\n');
  }
  return hash.digest('hex');
}

function spaltenNamen(db: DatabaseSync, tabelle: string): string[] {
  return (db.prepare(`PRAGMA table_info("${tabelle}")`).all() as Array<{ name: string }>).map((spalte) => spalte.name);
}

function hatSpalte(db: DatabaseSync, tabelle: string, name: string): boolean {
  return spaltenNamen(db, tabelle).includes(name);
}

function gleicheMenge(ist: readonly string[], soll: readonly string[]): boolean {
  return ist.length === soll.length && soll.every((name) => ist.includes(name));
}

function namen(db: DatabaseSync, sql: string): string[] {
  return (db.prepare(sql).all() as Array<{ name: string }>).map((zeile) => zeile.name);
}

function istAltstand(db: DatabaseSync): boolean {
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version !== 8 || !gleicheMenge(spaltenNamen(db, 'note'), ALT_NOTE)) return false;
  if (!hatSpalte(db, 'note_revision', 'text') || hatSpalte(db, 'note_revision', 'doc')) return false;
  return Boolean(db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'note_fts'`).get());
}

export function schemaArt(pfad: string): SchemaArt {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(pfad, { readOnly: true });
  } catch {
    return 'keins';
  }
  try {
    const note = db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'note'`).get();
    if (!note) return 'keins';
    if (hatSpalte(db, 'note', 'doc')) return 'keins';
    return istAltstand(db) ? 'alt1143' : 'unbekannt';
  } finally {
    db.close();
  }
}

export function erkenneAltstand(pfad: string): boolean {
  return schemaArt(pfad) === 'alt1143';
}

function abweichung(art: string, id: number | string, vorher: string, nachher: string): string {
  if (vorher.length !== nachher.length) return `${art} ${id}: length`;
  let stelle = 0;
  while (stelle < vorher.length && vorher[stelle] === nachher[stelle]) stelle += 1;
  return `${art} ${id}: differs at ${stelle}`;
}

function baueDoc(art: string, id: number | string, text: string, zuDoc: ZuDoc, fehler: string[]): string | null {
  try {
    const doc = zuDoc(text);
    const zurueck = textAusSpalte(doc);
    if (zurueck === text) return doc;
    fehler.push(abweichung(art, id, text, zurueck));
  } catch {
    fehler.push(`${art} ${id}: round-trip failed`);
  }
  return null;
}

function wandlePayload(zeile: AltUndo, zuDoc: ZuDoc, fehler: string[]): { neu: string; geaendert: boolean } {
  let wert: unknown;
  try {
    wert = JSON.parse(zeile.payload);
  } catch {
    return { neu: zeile.payload, geaendert: false };
  }
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return { neu: zeile.payload, geaendert: false };
  const bild = wert as { art?: unknown; erfasst?: unknown; note?: unknown };
  if (bild.art === 'sammel' || typeof bild.erfasst === 'string') return { neu: zeile.payload, geaendert: false };
  const note = bild.note;
  if (!note || typeof note !== 'object' || Array.isArray(note)) return { neu: zeile.payload, geaendert: false };
  const felder = note as Record<string, unknown>;
  if (typeof felder.text !== 'string') return { neu: zeile.payload, geaendert: false };
  const doc = baueDoc('undo', zeile.token, felder.text, zuDoc, fehler);
  if (doc === null) return { neu: zeile.payload, geaendert: false };
  const neuNote: Record<string, unknown> = {};
  for (const [schluessel, inhalt] of Object.entries(felder)) {
    if (schluessel === 'text') neuNote.doc = doc;
    else neuNote[schluessel] = inhalt;
  }
  return { neu: JSON.stringify({ ...bild, note: neuNote }), geaendert: true };
}

function liesNotizen(db: DatabaseSync): AltNotiz[] {
  return db.prepare(
    `SELECT id, text, created, topic_id, source, ai_confidence, client_id, pinned, account_id, version
     FROM "note" ORDER BY id`,
  ).all() as unknown as AltNotiz[];
}

function liesRevisionen(db: DatabaseSync): AltRevision[] {
  return db.prepare(
    'SELECT id, note_id, text, version, created, account_id FROM "note_revision" ORDER BY id',
  ).all() as unknown as AltRevision[];
}

function liesUndos(db: DatabaseSync): AltUndo[] {
  return db.prepare('SELECT token, payload, created, account_id FROM "note_undo" ORDER BY token').all() as unknown as AltUndo[];
}

function baueNotizen(db: DatabaseSync, plan: ReadonlyArray<{ zeile: AltNotiz; doc: string }>): void {
  db.exec(NOTE_NEU);
  const einfuegen = db.prepare(
    `INSERT INTO "note_neu" (id, doc, created, topic_id, source, ai_confidence, client_id, pinned, account_id, version, text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const { zeile, doc } of plan) {
    einfuegen.run(
      zeile.id, doc, zeile.created, zeile.topic_id, zeile.source, zeile.ai_confidence,
      zeile.client_id, zeile.pinned, zeile.account_id, zeile.version, zeile.text,
    );
  }
  db.exec(`
    DROP TRIGGER IF EXISTS note_fts_insert;
    DROP TRIGGER IF EXISTS note_fts_delete;
    DROP TRIGGER IF EXISTS note_fts_update;
    DROP TABLE IF EXISTS note_fts;
    DROP TABLE "note";
    ALTER TABLE "note_neu" RENAME TO "note";
    CREATE INDEX note_topic ON "note"(topic_id);
    CREATE UNIQUE INDEX note_client_id ON "note"(client_id) WHERE client_id IS NOT NULL;
    CREATE INDEX note_konto ON "note"(account_id);
  `);
}

function baueRevisionen(db: DatabaseSync, plan: ReadonlyArray<{ zeile: AltRevision; doc: string }>): void {
  db.exec(REV_NEU);
  const einfuegen = db.prepare(
    `INSERT INTO "note_revision_neu" (id, note_id, doc, version, created, account_id, text) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const { zeile, doc } of plan) {
    einfuegen.run(zeile.id, zeile.note_id, doc, zeile.version, zeile.created, zeile.account_id, zeile.text);
  }
  db.exec(`
    DROP TABLE "note_revision";
    ALTER TABLE "note_revision_neu" RENAME TO "note_revision";
    CREATE INDEX note_revision_note ON "note_revision"(note_id);
  `);
}

function baueSuche(db: DatabaseSync): void {
  db.exec(`
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
    INSERT INTO note_fts(rowid, text) SELECT id, cortx_suchtext(doc) FROM "note";
  `);
}

function gleicheZahlen(links: readonly number[], rechts: readonly number[]): boolean {
  return links.length === rechts.length && links.every((wert, index) => wert === rechts[index]);
}

function pruefeSignatur(db: DatabaseSync): void {
  const tabellen = namen(
    db,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'note_fts_%' ORDER BY name`,
  );
  if (tabellen.join() !== TABELLEN.join()) throw new Error('Bestand schema tables differ.');
  for (const tabelle of TABELLEN) {
    const ist = spaltenNamen(db, tabelle);
    const alt = tabelle === 'note' || tabelle === 'note_revision';
    const vergleich = alt ? ist.filter((name) => name !== 'text') : ist;
    if (vergleich.join() !== SPALTEN[tabelle]?.join()) throw new Error(`Bestand schema ${tabelle} columns differ.`);
    if (!alt) continue;
    const info = db.prepare(`PRAGMA table_info("${tabelle}")`).all() as Array<{ name: string; notnull: number }>;
    const text = info.find((spalte) => spalte.name === 'text');
    const doc = info.find((spalte) => spalte.name === 'doc');
    if (!text || text.notnull !== 0 || !doc || doc.notnull !== 1) throw new Error(`Bestand schema ${tabelle} columns differ.`);
  }
  const indizes = namen(db, `SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name`);
  if (indizes.join() !== INDIZES.join()) throw new Error('Bestand schema indexes differ.');
  const trigger = namen(db, `SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`);
  if (trigger.join() !== TRIGGER.join()) throw new Error('Bestand schema triggers differ.');
}

function pruefeInhalt(
  db: DatabaseSync,
  notizen: readonly AltNotiz[],
  revisionen: readonly AltRevision[],
  undos: readonly AltUndo[],
  undoNeu: ReadonlyMap<string, string>,
  summe: string,
): void {
  const nachNotizen = db.prepare(
    `SELECT id, text, doc, created, topic_id, source, ai_confidence, client_id, pinned, account_id, version
     FROM "note" ORDER BY id`,
  ).all() as unknown as Array<AltNotiz & { doc: string }>;
  if (!gleicheZahlen(nachNotizen.map((zeile) => zeile.id), notizen.map((zeile) => zeile.id))) {
    throw new Error('Bestand note count changed.');
  }
  const zurueck: string[] = [];
  for (let index = 0; index < notizen.length; index += 1) {
    const vor = notizen[index]!;
    const nach = nachNotizen[index]!;
    let text: string;
    try {
      text = textAusSpalte(nach.doc);
    } catch {
      throw new Error(`Bestand note ${vor.id}: round-trip failed`);
    }
    if (text !== vor.text) throw new Error(abweichung('note', vor.id, vor.text, text));
    if (
      nach.text !== vor.text || nach.created !== vor.created || nach.topic_id !== vor.topic_id ||
      nach.source !== vor.source || nach.ai_confidence !== vor.ai_confidence || nach.client_id !== vor.client_id ||
      nach.pinned !== vor.pinned || nach.account_id !== vor.account_id || nach.version !== vor.version
    ) throw new Error(`Bestand note ${vor.id}: column changed`);
    zurueck.push(text);
  }
  if (textSumme(zurueck) !== summe) throw new Error('Bestand checksum changed.');
  const nachRev = db.prepare(
    'SELECT id, note_id, text, doc, version, created, account_id FROM "note_revision" ORDER BY id',
  ).all() as unknown as Array<AltRevision & { doc: string }>;
  const revIds = (db.prepare('SELECT id FROM "note_revision" ORDER BY id').all() as Array<{ id: number }>).map((zeile) => zeile.id);
  if (!gleicheZahlen(revIds, revisionen.map((zeile) => zeile.id))) throw new Error('Bestand revision count changed.');
  for (let index = 0; index < revisionen.length; index += 1) {
    const vor = revisionen[index]!;
    const nach = nachRev[index]!;
    if (
      textAusSpalte(nach.doc) !== vor.text || nach.text !== vor.text || nach.note_id !== vor.note_id ||
      nach.version !== vor.version || nach.created !== vor.created || nach.account_id !== vor.account_id
    ) throw new Error(`Bestand revision ${vor.id}: column changed`);
  }
  const nachUndo = liesUndos(db);
  if (nachUndo.length !== undos.length) throw new Error('Bestand undo count changed.');
  for (const zeile of nachUndo) {
    if (zeile.payload !== undoNeu.get(zeile.token)) throw new Error(`Bestand undo ${zeile.token}: payload changed`);
  }
  const fts = db.prepare('SELECT COUNT(*) AS n FROM note_fts').get() as { n: number };
  if (Number(fts.n) !== notizen.length) throw new Error('Bestand search index count differs.');
  if (db.prepare('PRAGMA foreign_key_check').all().length > 0) throw new Error('Bestand foreign_key_check failed.');
  const integritaet = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
  if (integritaet.length !== 1 || integritaet[0]?.integrity_check !== 'ok') throw new Error('Bestand integrity_check failed.');
  pruefeSignatur(db);
}

function arbeite(db: DatabaseSync, haken?: WandelHaken): WandelBericht {
  const zuDoc = haken?.spalteAusText ?? spalteAusText;
  const notizen = liesNotizen(db);
  const revisionen = liesRevisionen(db);
  const undos = liesUndos(db);
  const fehler: string[] = [];
  const notePlan: Array<{ zeile: AltNotiz; doc: string }> = [];
  for (const zeile of notizen) {
    const doc = baueDoc('note', zeile.id, zeile.text, zuDoc, fehler);
    if (doc !== null) notePlan.push({ zeile, doc });
  }
  const revPlan: Array<{ zeile: AltRevision; doc: string }> = [];
  for (const zeile of revisionen) {
    const doc = baueDoc('revision', zeile.id, zeile.text, zuDoc, fehler);
    if (doc !== null) revPlan.push({ zeile, doc });
  }
  const undoPlan = undos.map((zeile) => ({ zeile, ...wandlePayload(zeile, zuDoc, fehler) }));
  if (fehler.length > 0) throw new Error(`Bestand round-trip failed: ${fehler.join('; ')}`);
  const summe = textSumme(notizen.map((zeile) => zeile.text));
  baueNotizen(db, notePlan);
  haken?.nachSchritt?.(NACH_NOTE);
  baueRevisionen(db, revPlan);
  const schreiben = db.prepare('UPDATE "note_undo" SET payload = ? WHERE token = ?');
  const undoNeu = new Map<string, string>();
  let undo = 0;
  for (const eintrag of undoPlan) {
    undoNeu.set(eintrag.zeile.token, eintrag.neu);
    if (!eintrag.geaendert) continue;
    schreiben.run(eintrag.neu, eintrag.zeile.token);
    undo += 1;
  }
  baueSuche(db);
  pruefeInhalt(db, notizen, revisionen, undos, undoNeu, summe);
  db.exec(`PRAGMA user_version = ${MIGRATIONEN.length}`);
  return { notizen: notizen.length, revisionen: revisionen.length, undo, summe };
}

export function wandleAltstand(db: DatabaseSync, haken?: WandelHaken): WandelBericht {
  // cortx_suchtext is registered by the caller before the search index is filled.
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    const bericht = arbeite(db, haken);
    db.exec('COMMIT');
    return bericht;
  } catch (fehler) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // The transaction is already closed.
    }
    throw fehler;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
