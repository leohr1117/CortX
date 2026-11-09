import type { DatabaseSync } from 'node:sqlite';
import { DOKUMENT_SCHEMA_VERSION, pruefeDokument } from '../../../shared/features/format/dokument.ts';
import { exportiere, importiere } from '../../../shared/features/format/md.ts';
import type { NoteSource, Notiz } from '../../../shared/kern/modell.ts';

export interface NotizZeile {
  id: number;
  text: string;
  doc: unknown;
  docJson: string;
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
    "note".doc AS docJson,
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

export function dokumentAusText(text: string): Record<string, unknown> {
  const json = importiere(text).toJSON() as Record<string, unknown>;
  const doc = { ...json, schema_version: DOKUMENT_SCHEMA_VERSION };
  if (!pruefeDokument(doc)) throw new Error('Imported note is not a document.');
  return doc;
}

export function spalteAusText(text: string): string {
  return JSON.stringify(dokumentAusText(text));
}

export function textAusDokument(doc: unknown): string | null {
  const knoten = pruefeDokument(doc);
  if (!knoten) return null;
  return exportiere(knoten);
}

export function textAusSpalte(spalte: string): string {
  let wert: unknown;
  try {
    wert = JSON.parse(spalte);
  } catch {
    throw new Error('Stored note document is invalid.');
  }
  const text = textAusDokument(wert);
  if (text === null) throw new Error('Stored note document is invalid.');
  return text;
}

function zeile(roh: unknown): NotizZeile | null {
  if (!roh || typeof roh !== 'object') return null;
  const wert = roh as NotizZeile & { docJson?: unknown };
  const docJson = typeof wert.docJson === 'string' ? wert.docJson : '';
  let doc: unknown;
  try {
    doc = JSON.parse(docJson);
  } catch {
    return null;
  }
  const text = textAusDokument(doc);
  if (text === null) return null;
  return {
    id: Number(wert.id),
    text,
    doc,
    docJson,
    created: wert.created,
    topicId: Number(wert.topicId),
    topic: wert.topic,
    source: wert.source,
    aiConfidence: wert.aiConfidence === null || wert.aiConfidence === undefined ? null : Number(wert.aiConfidence),
    pinned: Number(wert.pinned),
    clientId: wert.clientId ?? null,
    version: Number(wert.version ?? 1),
  };
}

export function alsNotiz(wert: NotizZeile): Notiz {
  return {
    id: wert.id,
    text: wert.text,
    doc: wert.doc,
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
