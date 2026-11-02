import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { ersteZeile } from '../../shared/features/seiten/text.ts';

export interface WandelZahlen {
  anzahl: number;
  titel: number;
  summe: string;
}

interface NotizRoh {
  id: number;
  text: string;
  account_id: string | null;
}

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

function hatSpalte(db: DatabaseSync, tabelle: string, name: string): boolean {
  const spalten = db.prepare(`PRAGMA table_info("${tabelle}")`).all() as Array<{ name: string }>;
  return spalten.some((spalte) => spalte.name === name);
}

function hatTabelle(db: DatabaseSync, name: string): boolean {
  return Boolean(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));
}

function vergleichText(vorher: string, nachher: string): string {
  if (!ersteZeile(vorher).startsWith('# ') && nachher === `# ${vorher}`) return vorher;
  return nachher;
}

export function wandleSeiten(db: DatabaseSync, nacharbeit?: (db: DatabaseSync) => void): WandelZahlen {
  if (!hatSpalte(db, 'note', 'version')) {
    db.exec('ALTER TABLE "note" ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
  }
  if (!hatTabelle(db, 'note_revision')) {
    db.exec(`
      CREATE TABLE "note_revision" (
        id INTEGER PRIMARY KEY,
        note_id INTEGER NOT NULL REFERENCES "note"(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        version INTEGER NOT NULL,
        created TEXT NOT NULL,
        account_id TEXT
      );
      CREATE INDEX note_revision_note ON "note_revision"(note_id);
    `);
  }
  const vorher = db.prepare('SELECT id, text, account_id FROM "note" ORDER BY id').all() as unknown as NotizRoh[];
  const summe = textSumme(vorher.map((zeile) => zeile.text));
  let titel = 0;
  const jetzt = new Date().toISOString();
  const schreiben = db.prepare('UPDATE "note" SET text = ?, version = version + 1 WHERE id = ?');
  const revision = db.prepare(
    `INSERT INTO "note_revision" (note_id, text, version, created, account_id) VALUES (?, ?, ?, ?, ?)`,
  );
  for (const zeile of vorher) {
    if (ersteZeile(zeile.text).startsWith('# ')) continue;
    schreiben.run(`# ${zeile.text}`, zeile.id);
    revision.run(zeile.id, zeile.text, 1, jetzt, zeile.account_id);
    titel += 1;
  }
  nacharbeit?.(db);
  const nachher = db.prepare('SELECT id, text FROM "note" ORDER BY id').all() as unknown as Array<{
    id: number;
    text: string;
  }>;
  if (nachher.length !== vorher.length) throw new Error('Note count changed.');
  for (let index = 0; index < vorher.length; index += 1) {
    if (nachher[index]?.id !== vorher[index]?.id) throw new Error('Note count changed.');
  }
  const vergleich = nachher.map((zeile, index) => vergleichText(vorher[index]?.text ?? '', zeile.text));
  if (textSumme(vergleich) !== summe) throw new Error('Note checksum changed.');
  return { anzahl: nachher.length, titel, summe };
}
