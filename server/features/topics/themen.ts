import type { DatabaseSync } from 'node:sqlite';
import { sortiereThemen } from '../../../shared/features/tags/index.ts';
import type { Thema } from '../../../shared/kern/modell.ts';

export function listeThemen(db: DatabaseSync, kontoId: string): Thema[] {
  const roh = db
    .prepare(
      `
      SELECT "topic".name AS name, COUNT("note".id) AS count
      FROM "topic"
      LEFT JOIN "note" ON "note".topic_id = "topic".id AND "note".account_id = "topic".account_id
      WHERE "topic".account_id = ?
      GROUP BY "topic".id
      `,
    )
    .all(kontoId) as Array<{ name: string; count: number }>;
  return sortiereThemen(roh.map((zeile) => ({ name: zeile.name, count: Number(zeile.count) })));
}

export function themaId(db: DatabaseSync, name: string, kontoId: string): number | null {
  const zeile = db
    .prepare('SELECT id FROM "topic" WHERE name_key = ? AND account_id = ?')
    .get(name.toLocaleLowerCase(), kontoId) as { id: number } | undefined;
  return zeile?.id ?? null;
}

export function legeThemaAn(db: DatabaseSync, name: string, kontoId: string): number {
  const vorhanden = themaId(db, name, kontoId);
  if (vorhanden !== null) return vorhanden;
  const schluessel = name.toLocaleLowerCase();
  try {
    const info = db
      .prepare('INSERT INTO "topic" (name, name_key, created, account_id) VALUES (?, ?, ?, ?)')
      .run(name, schluessel, new Date().toISOString(), kontoId);
    return Number(info.lastInsertRowid);
  } catch (fehler) {
    const nochmal = themaId(db, name, kontoId);
    if (nochmal !== null && fehler instanceof Error && fehler.message.includes('UNIQUE')) return nochmal;
    throw fehler;
  }
}
