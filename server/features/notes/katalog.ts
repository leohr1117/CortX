import type { DatabaseSync } from 'node:sqlite';
import { abschnittNamen, seitentitel, type SeiteKurz } from '../../../shared/features/seiten/index.ts';
import { textAusSpalte } from './lesen.ts';

export function listeSeiten(db: DatabaseSync, kontoId: string): SeiteKurz[] {
  const roh = db
    .prepare(
      `SELECT "note".id AS id, "note".doc AS doc, "topic".name AS topic
       FROM "note"
       JOIN "topic" ON "topic".id = "note".topic_id
       WHERE "note".account_id = ?
       ORDER BY "note".id`,
    )
    .all(kontoId) as Array<{ id: number; doc: string; topic: string }>;
  return roh.map((zeile) => {
    const text = textAusSpalte(zeile.doc);
    return {
      id: Number(zeile.id),
      topic: zeile.topic,
      titel: seitentitel(text),
      abschnitte: abschnittNamen(text),
    };
  });
}
