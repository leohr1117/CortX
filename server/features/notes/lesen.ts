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
    "note".client_id AS clientId
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
  };
}

export function liesNotizNachId(db: DatabaseSync, id: number): NotizZeile | null {
  return zeile(db.prepare(`${SELECT} WHERE "note".id = ?`).get(id));
}

export function liesNotizNachClient(db: DatabaseSync, clientId: string): NotizZeile | null {
  return zeile(db.prepare(`${SELECT} WHERE "note".client_id = ?`).get(clientId));
}
