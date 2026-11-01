import type { DatabaseSync } from 'node:sqlite';
import { sortiereThemen } from '../../../shared/features/tags/index.ts';
import type { Thema } from '../../../shared/kern/modell.ts';

export function listeThemen(db: DatabaseSync): Thema[] {
  const roh = db
    .prepare(
      `
      SELECT "topic".name AS name, COUNT("note".id) AS count
      FROM "topic"
      LEFT JOIN "note" ON "note".topic_id = "topic".id
      GROUP BY "topic".id
      `,
    )
    .all() as Array<{ name: string; count: number }>;
  return sortiereThemen(roh.map((zeile) => ({ name: zeile.name, count: Number(zeile.count) })));
}

export function themaId(db: DatabaseSync, name: string): number | null {
  const zeile = db.prepare('SELECT id FROM "topic" WHERE name_key = ?').get(name.toLocaleLowerCase()) as
    | { id: number }
    | undefined;
  return zeile?.id ?? null;
}

export function legeThemaAn(db: DatabaseSync, name: string): number {
  const vorhanden = themaId(db, name);
  if (vorhanden !== null) return vorhanden;
  const schluessel = name.toLocaleLowerCase();
  try {
    const info = db
      .prepare('INSERT INTO "topic" (name, name_key, created) VALUES (?, ?, ?)')
      .run(name, schluessel, new Date().toISOString());
    return Number(info.lastInsertRowid);
  } catch (fehler) {
    const nochmal = themaId(db, name);
    if (nochmal !== null && fehler instanceof Error && fehler.message.includes('UNIQUE')) return nochmal;
    throw fehler;
  }
}
