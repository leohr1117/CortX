import type { DatabaseSync } from 'node:sqlite';
import type { NoteSource, Notiz } from '../../../shared/kern/modell.ts';

export interface NotizZeile {
  id: number;
  text: string;
  created: string;
  topicId: number;
  topic: string;
  source: NoteSource;
  aiConfidence: number | null;
  pinned: number;
  clientId: string | null;
  version: number;
}

const SELECT = `
  SELECT
    "note".id AS id,
    "note".text AS text,
    "note".created AS created,
    "note".topic_id AS topicId,
    "topic".name AS topic,
    "note".source AS source,
    "note".ai_confidence AS aiConfidence,
    "note".pinned AS pinned,
    "note".client_id AS clientId,
    "note".version AS version
  FROM "note"
  JOIN "topic" ON "topic".id = "note".topic_id
`;

function zeile(roh: unknown): NotizZeile | null {
  if (!roh || typeof roh !== 'object') return null;
  const wert = roh as NotizZeile;
  return {
    ...wert,
    id: Number(wert.id),
    topicId: Number(wert.topicId),
    pinned: Number(wert.pinned),
    aiConfidence: wert.aiConfidence === null || wert.aiConfidence === undefined ? null : Number(wert.aiConfidence),
    clientId: wert.clientId ?? null,
    version: Number(wert.version ?? 1),
  };
}

export function alsNotiz(wert: NotizZeile): Notiz {
  return {
    id: wert.id,
    text: wert.text,
    created: wert.created,
    topic: wert.topic,
    source: wert.source,
    aiConfidence: wert.aiConfidence,
    version: wert.version,
  };
}

export function liesNotizNachId(db: DatabaseSync, id: number, kontoId: string): NotizZeile | null {
  return zeile(db.prepare(`${SELECT} WHERE "note".id = ? AND "note".account_id = ?`).get(id, kontoId));
}

export function liesNotizNachClient(db: DatabaseSync, clientId: string, kontoId: string): NotizZeile | null {
  return zeile(db.prepare(`${SELECT} WHERE "note".client_id = ? AND "note".account_id = ?`).get(clientId, kontoId));
}

export function liesNotizenFuerThema(db: DatabaseSync, topicId: number, kontoId: string): NotizZeile[] {
  const roh = db
    .prepare(
      `${SELECT} WHERE "note".topic_id = ? AND "note".account_id = ? ORDER BY "note".created DESC, "note".id DESC`,
    )
    .all(topicId, kontoId);
  return roh.map((eintrag) => zeile(eintrag)).filter((eintrag): eintrag is NotizZeile => eintrag !== null);
}
