import type { DatabaseSync } from 'node:sqlite';
import type { Node } from 'prosemirror-model';
import { pruefeDokument } from '../../../shared/features/format/dokument.ts';
import { abschnitteAusKnoten, titelAusKnoten, type SeiteKurz } from '../../../shared/features/seiten/index.ts';

function knotenAusSpalte(spalte: string): Node {
  let wert: unknown;
  try {
    wert = JSON.parse(spalte);
  } catch (fehler) {
    throw new Error('Stored note document is invalid.', { cause: fehler });
  }
  const doc = pruefeDokument(wert);
  if (!doc) throw new Error('Stored note document is invalid.');
  return doc;
}

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
    const doc = knotenAusSpalte(zeile.doc);
    return {
      id: Number(zeile.id),
      topic: zeile.topic,
      titel: titelAusKnoten(doc),
      abschnitte: abschnitteAusKnoten(doc),
    };
  });
}
