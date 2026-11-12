import type { DatabaseSync } from 'node:sqlite';

export const SUCHINDEX_MARKE = 1148;

export function suchindexMarke(db: DatabaseSync): number {
  const zeile = db.prepare('PRAGMA application_id').get() as { application_id: number };
  return Number(zeile.application_id);
}

export function migriereSuchindex(db: DatabaseSync): { rebuilt: boolean } {
  if (suchindexMarke(db) === SUCHINDEX_MARKE) return { rebuilt: false };
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM note_fts');
    db.exec('INSERT INTO note_fts(rowid, text) SELECT id, cortx_suchtext(doc) FROM "note"');
    db.exec(`PRAGMA application_id = ${SUCHINDEX_MARKE}`);
    db.exec('COMMIT');
  } catch (fehler) {
    db.exec('ROLLBACK');
    throw fehler;
  }
  return { rebuilt: true };
}
