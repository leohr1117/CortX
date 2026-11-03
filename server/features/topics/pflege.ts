import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { INBOX_NAME, TOPIC_NAME_MAX } from '../../../shared/kern/grenzen.ts';
import { TEXTE } from '../../../shared/kern/texte.ts';
import {
  pflegeMeldung,
  planeLoeschen,
  planeUmbenennen,
  planeZusammenfuehren,
  type PflegeGrund,
} from '../../../shared/features/topics/index.ts';
import { transaktion } from '../../kern/db.ts';
import { AppFehler } from '../../kern/fehler.ts';

const NICHTS = TEXTE.nichtsRueck;
const SCHON_DA = TEXTE.schonWieder;
const GEHT_NICHT = TEXTE.nichtRueck;

const korrekturSchema = z
  .object({
    id: z.number().int().positive(),
    noteId: z.number().int().positive(),
    fromTopicId: z.number().int().positive(),
    toTopicId: z.number().int().positive(),
    created: z.string().min(1),
  })
  .strict();

const bildSchema = z
  .object({
    topic: z
      .object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(TOPIC_NAME_MAX),
        nameKey: z.string().min(1).max(TOPIC_NAME_MAX),
        created: z.string().min(1),
      })
      .strict(),
    noteIds: z.array(z.number().int().positive()),
    corrections: z.array(korrekturSchema),
  })
  .strict();

type UndoBild = z.infer<typeof bildSchema>;

interface ThemaZeile {
  id: number;
  name: string;
  nameKey: string;
  created: string;
}

function wirf(grund: PflegeGrund): never {
  const status = grund === 'missing' || grund === 'unknown' ? 404 : grund === 'duplicate' ? 409 : 400;
  throw new AppFehler(status, pflegeMeldung(grund));
}

function alleNamen(db: DatabaseSync, kontoId: string): string[] {
  const roh = db.prepare('SELECT name FROM "topic" WHERE account_id = ?').all(kontoId) as Array<{ name: string }>;
  return roh.map((zeile) => zeile.name);
}

function liesThema(db: DatabaseSync, name: string, kontoId: string): ThemaZeile | null {
  const roh = db
    .prepare('SELECT id, name, name_key, created FROM "topic" WHERE name_key = ? AND account_id = ?')
    .get(name.toLocaleLowerCase(), kontoId) as
    | { id: number; name: string; name_key: string; created: string }
    | undefined;
  if (!roh) return null;
  return { id: Number(roh.id), name: roh.name, nameKey: roh.name_key, created: roh.created };
}

function liesBild(payload: string): UndoBild | null {
  try {
    const geparst = bildSchema.safeParse(JSON.parse(payload));
    if (!geparst.success) return null;
    const bild = geparst.data;
    if (bild.topic.nameKey !== bild.topic.name.toLocaleLowerCase()) return null;
    if (new Set(bild.noteIds).size !== bild.noteIds.length) return null;
    if (new Set(bild.corrections.map((zeile) => zeile.id)).size !== bild.corrections.length) return null;
    const zeigtAufThema = bild.corrections.every(
      (zeile) => zeile.fromTopicId === bild.topic.id || zeile.toTopicId === bild.topic.id,
    );
    return zeigtAufThema ? bild : null;
  } catch {
    return null;
  }
}

function schnapp(db: DatabaseSync, quelle: ThemaZeile): UndoBild {
  const notizen = db.prepare('SELECT id FROM "note" WHERE topic_id = ? ORDER BY id').all(quelle.id) as Array<{
    id: number;
  }>;
  const korrekturen = db
    .prepare(
      `SELECT id, note_id, from_topic_id, to_topic_id, created
       FROM "correction" WHERE from_topic_id = ? OR to_topic_id = ? ORDER BY id`,
    )
    .all(quelle.id, quelle.id) as Array<{
    id: number;
    note_id: number;
    from_topic_id: number;
    to_topic_id: number;
    created: string;
  }>;
  return {
    topic: quelle,
    noteIds: notizen.map((zeile) => Number(zeile.id)),
    corrections: korrekturen.map((zeile) => ({
      id: Number(zeile.id),
      noteId: Number(zeile.note_id),
      fromTopicId: Number(zeile.from_topic_id),
      toTopicId: Number(zeile.to_topic_id),
      created: zeile.created,
    })),
  };
}

function wendeVerschiebung(
  db: DatabaseSync,
  quelle: ThemaZeile,
  zielId: number,
  kontoId: string,
): { token: string; count: number } {
  const bild = schnapp(db, quelle);
  const loeschKorrektur = db.prepare('DELETE FROM "correction" WHERE id = ?');
  for (const korrektur of bild.corrections) loeschKorrektur.run(korrektur.id);
  db.prepare('UPDATE "note" SET topic_id = ? WHERE topic_id = ?').run(zielId, quelle.id);
  const weg = db.prepare('DELETE FROM "topic" WHERE id = ?').run(quelle.id);
  if (Number(weg.changes) !== 1) throw new AppFehler(500, TEXTE.aktualisierenThema);
  const token = randomUUID();
  db.prepare('DELETE FROM "topic_undo" WHERE account_id = ?').run(kontoId);
  db.prepare('INSERT INTO "topic_undo" (token, payload, created, account_id) VALUES (?, ?, ?, ?)').run(
    token,
    JSON.stringify(bild),
    new Date().toISOString(),
    kontoId,
  );
  return { token, count: bild.noteIds.length };
}

export function benenneUm(db: DatabaseSync, aktuell: string, roh: string, kontoId: string): { topic: string } {
  return transaktion(db, () => {
    const plan = planeUmbenennen(aktuell, roh, alleNamen(db, kontoId));
    if (!plan.ok) wirf(plan.grund);
    if (!plan.geaendert) return { topic: plan.aktuell };
    const quelle = liesThema(db, plan.aktuell, kontoId);
    if (!quelle) wirf('missing');
    try {
      db.prepare('UPDATE "topic" SET name = ?, name_key = ? WHERE id = ?').run(
        plan.name,
        plan.name.toLocaleLowerCase(),
        quelle.id,
      );
    } catch (fehler) {
      if (fehler instanceof Error && fehler.message.includes('UNIQUE')) wirf('duplicate');
      throw fehler;
    }
    return { topic: plan.name };
  });
}

export function fuehreZusammen(
  db: DatabaseSync,
  aktuell: string,
  roh: string,
  kontoId: string,
): { token: string; from: string; into: string; count: number } {
  return transaktion(db, () => {
    const plan = planeZusammenfuehren(aktuell, roh, alleNamen(db, kontoId));
    if (!plan.ok) wirf(plan.grund);
    const quelle = liesThema(db, plan.quelle, kontoId);
    const ziel = liesThema(db, plan.ziel, kontoId);
    if (!quelle || !ziel) wirf('missing');
    const ergebnis = wendeVerschiebung(db, quelle, ziel.id, kontoId);
    return { token: ergebnis.token, from: quelle.name, into: ziel.name, count: ergebnis.count };
  });
}

export function loescheThema(
  db: DatabaseSync,
  aktuell: string,
  kontoId: string,
): { token: string; topic: string; count: number } {
  return transaktion(db, () => {
    const plan = planeLoeschen(aktuell, alleNamen(db, kontoId));
    if (!plan.ok) wirf(plan.grund);
    const quelle = liesThema(db, plan.name, kontoId);
    const inbox = liesThema(db, INBOX_NAME, kontoId);
    if (!quelle) wirf('missing');
    if (!inbox) throw new AppFehler(500, TEXTE.loeschenThema);
    const ergebnis = wendeVerschiebung(db, quelle, inbox.id, kontoId);
    return { token: ergebnis.token, topic: quelle.name, count: ergebnis.count };
  });
}

export function macheRueckgaengig(db: DatabaseSync, token: string, kontoId: string): { topic: string } {
  return transaktion(db, () => {
    const zeile = db
      .prepare('SELECT payload FROM "topic_undo" WHERE token = ? AND account_id = ?')
      .get(token, kontoId) as { payload: string } | undefined;
    if (!zeile) throw new AppFehler(404, NICHTS);
    const bild = liesBild(zeile.payload);
    if (!bild) throw new AppFehler(500, GEHT_NICHT);
    const belegt = db
      .prepare('SELECT id FROM "topic" WHERE id = ? OR (account_id = ? AND name_key = ?)')
      .get(bild.topic.id, kontoId, bild.topic.nameKey);
    if (belegt) throw new AppFehler(409, SCHON_DA);
    const notizDa = db.prepare('SELECT id FROM "note" WHERE id = ? AND account_id = ?');
    for (const id of bild.noteIds) {
      if (!notizDa.get(id, kontoId)) throw new AppFehler(409, GEHT_NICHT);
    }
    const korrekturDa = db.prepare('SELECT id FROM "correction" WHERE id = ?');
    for (const korrektur of bild.corrections) {
      if (korrekturDa.get(korrektur.id)) throw new AppFehler(409, GEHT_NICHT);
    }
    db.prepare('INSERT INTO "topic" (id, name, name_key, created, account_id) VALUES (?, ?, ?, ?, ?)').run(
      bild.topic.id,
      bild.topic.name,
      bild.topic.nameKey,
      bild.topic.created,
      kontoId,
    );
    const themaDa = db.prepare('SELECT id FROM "topic" WHERE id = ? AND account_id = ?');
    for (const korrektur of bild.corrections) {
      if (!themaDa.get(korrektur.fromTopicId, kontoId) || !themaDa.get(korrektur.toTopicId, kontoId)) {
        throw new AppFehler(409, GEHT_NICHT);
      }
    }
    const setze = db.prepare('UPDATE "note" SET topic_id = ? WHERE id = ? AND account_id = ?');
    for (const id of bild.noteIds) setze.run(bild.topic.id, id, kontoId);
    const einfuegen = db.prepare(
      'INSERT INTO "correction" (id, note_id, from_topic_id, to_topic_id, created) VALUES (?, ?, ?, ?, ?)',
    );
    for (const korrektur of bild.corrections) {
      einfuegen.run(korrektur.id, korrektur.noteId, korrektur.fromTopicId, korrektur.toTopicId, korrektur.created);
    }
    db.prepare('DELETE FROM "topic_undo" WHERE token = ? AND account_id = ?').run(token, kontoId);
    return { topic: bild.topic.name };
  });
}
