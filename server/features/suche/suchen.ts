import type { DatabaseSync } from 'node:sqlite';
import { formeTreffer, planeSuche, SUCH_LIMIT, suchMeldung, type SuchRoh, type SuchTreffer } from '../../../shared/features/suche/index.ts';
import { AppFehler } from '../../kern/fehler.ts';

const TREFFER = `
  SELECT "note".id AS id,
         "note".text AS text,
         "note".created AS created,
         "topic".name AS topic
  FROM note_fts
  JOIN "note" ON "note".id = note_fts.rowid
  JOIN "topic" ON "topic".id = "note".topic_id
  WHERE note_fts MATCH ?
    AND "note".account_id = ?
    AND "topic".account_id = ?
  ORDER BY "note".created DESC, "note".id DESC
  LIMIT ?
`;

function alsRoh(wert: unknown): SuchRoh {
  const zeile = wert as { id: number; text: string; topic: string; created: string };
  return {
    id: Number(zeile.id),
    text: String(zeile.text),
    topic: String(zeile.topic),
    created: String(zeile.created),
  };
}

export function sucheNotizen(db: DatabaseSync, roh: string, kontoId: string): SuchTreffer[] {
  const plan = planeSuche(roh);
  if (!plan.ok) throw new AppFehler(400, suchMeldung(plan.grund));
  try {
    const zeilen = db.prepare(TREFFER).all(plan.ausdruck, kontoId, kontoId, SUCH_LIMIT) as unknown[];
    return formeTreffer(zeilen.map(alsRoh), SUCH_LIMIT);
  } catch (fehler) {
    if (fehler instanceof Error && fehler.message.includes('fts5')) return [];
    throw fehler;
  }
}
