import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { planeNotizText, textMeldung } from '../../../shared/features/edit/index.ts';
import { NOTE_TEXT_MAX } from '../../../shared/kern/grenzen.ts';
import type { Notiz } from '../../../shared/kern/modell.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { transaktion } from '../../kern/db.ts';
import { alsNotiz, liesNotizNachId, type NotizZeile } from './lesen.ts';

const NICHTS = 'Nothing to undo.';
const GEHT_NICHT = 'Could not undo.';
const SPEICHERN = 'Could not save the note.';
const LOESCHEN = 'Could not delete the note.';

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
    note: z
      .object({
        id: z.number().int().positive(),
        text: z.string().min(1).max(NOTE_TEXT_MAX),
        created: z.string().min(1),
        topicId: z.number().int().positive(),
        source: z.enum(['tag', 'ai', 'manual']),
        aiConfidence: z.number().min(0).max(1).nullable(),
        clientId: z.string().min(1).nullable(),
        pinned: z.union([z.literal(0), z.literal(1)]),
      })
      .strict(),
    corrections: z.array(korrekturSchema),
  })
  .strict();

type UndoBild = z.infer<typeof bildSchema>;

interface KorrekturZeile {
  id: number;
  note_id: number;
  from_topic_id: number;
  to_topic_id: number;
  created: string;
}

function liesBild(payload: string): UndoBild | null {
  try {
    const geparst = bildSchema.safeParse(JSON.parse(payload));
    if (!geparst.success) return null;
    const bild = geparst.data;
    if (new Set(bild.corrections.map((zeile) => zeile.id)).size !== bild.corrections.length) return null;
    if (bild.corrections.some((zeile) => zeile.noteId !== bild.note.id)) return null;
    return bild;
  } catch {
    return null;
  }
}

function schnapp(db: DatabaseSync, notiz: NotizZeile): UndoBild {
  const korrekturen = db
    .prepare(
      `SELECT id, note_id, from_topic_id, to_topic_id, created
       FROM "correction" WHERE note_id = ? ORDER BY id`,
    )
    .all(notiz.id) as unknown as KorrekturZeile[];
  return {
    note: {
      id: notiz.id,
      text: notiz.text,
      created: notiz.created,
      topicId: notiz.topicId,
      source: notiz.source,
      aiConfidence: notiz.aiConfidence,
      clientId: notiz.clientId,
      pinned: notiz.pinned === 1 ? 1 : 0,
    },
    corrections: korrekturen.map((zeile) => ({
      id: Number(zeile.id),
      noteId: Number(zeile.note_id),
      fromTopicId: Number(zeile.from_topic_id),
      toTopicId: Number(zeile.to_topic_id),
      created: zeile.created,
    })),
  };
}

function themaDa(db: DatabaseSync, id: number, kontoId: string): boolean {
  return Boolean(db.prepare('SELECT id FROM "topic" WHERE id = ? AND account_id = ?').get(id, kontoId));
}

export function speichereText(db: DatabaseSync, id: number, roh: string, kontoId: string): Notiz {
  return transaktion(db, () => {
    const plan = planeNotizText(roh);
    if (!plan.ok) throw new AppFehler(400, textMeldung(plan.grund));
    const notiz = liesNotizNachId(db, id, kontoId);
    if (!notiz) throw new AppFehler(404, 'Note not found.');
    if (notiz.text !== plan.text) {
      const geschrieben = db.prepare('UPDATE "note" SET text = ? WHERE id = ? AND account_id = ?').run(plan.text, id, kontoId);
      if (Number(geschrieben.changes) !== 1) throw new AppFehler(500, SPEICHERN);
    }
    const neu = liesNotizNachId(db, id, kontoId);
    if (!neu) throw new AppFehler(500, SPEICHERN);
    return alsNotiz(neu);
  });
}

export function loescheNotiz(db: DatabaseSync, id: number, kontoId: string): { token: string } {
  return transaktion(db, () => {
    const notiz = liesNotizNachId(db, id, kontoId);
    if (!notiz) throw new AppFehler(404, 'Note not found.');
    const bild = schnapp(db, notiz);
    db.prepare('DELETE FROM "correction" WHERE note_id = ?').run(id);
    const weg = db.prepare('DELETE FROM "note" WHERE id = ? AND account_id = ?').run(id, kontoId);
    if (Number(weg.changes) !== 1) throw new AppFehler(500, LOESCHEN);
    const token = randomUUID();
    db.prepare('DELETE FROM "note_undo" WHERE account_id = ?').run(kontoId);
    db.prepare('INSERT INTO "note_undo" (token, payload, created, account_id) VALUES (?, ?, ?, ?)').run(
      token,
      JSON.stringify(bild),
      new Date().toISOString(),
      kontoId,
    );
    return { token };
  });
}

export function stelleNotizHer(db: DatabaseSync, token: string, kontoId: string): Notiz {
  return transaktion(db, () => {
    const zeile = db.prepare('SELECT payload FROM "note_undo" WHERE token = ? AND account_id = ?').get(token, kontoId) as
      | { payload: string }
      | undefined;
    if (!zeile) throw new AppFehler(404, NICHTS);
    const bild = liesBild(zeile.payload);
    if (!bild) throw new AppFehler(500, GEHT_NICHT);
    if (!themaDa(db, bild.note.topicId, kontoId)) throw new AppFehler(409, GEHT_NICHT);
    if (db.prepare('SELECT id FROM "note" WHERE id = ?').get(bild.note.id)) throw new AppFehler(409, GEHT_NICHT);
    for (const korrektur of bild.corrections) {
      if (!themaDa(db, korrektur.fromTopicId, kontoId) || !themaDa(db, korrektur.toTopicId, kontoId)) {
        throw new AppFehler(409, GEHT_NICHT);
      }
      if (db.prepare('SELECT id FROM "correction" WHERE id = ?').get(korrektur.id)) throw new AppFehler(409, GEHT_NICHT);
    }
    try {
      db.prepare(
        `INSERT INTO "note" (id, text, created, topic_id, source, ai_confidence, client_id, pinned, account_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        bild.note.id,
        bild.note.text,
        bild.note.created,
        bild.note.topicId,
        bild.note.source,
        bild.note.aiConfidence,
        bild.note.clientId,
        bild.note.pinned,
        kontoId,
      );
    } catch (fehler) {
      if (fehler instanceof Error && fehler.message.includes('UNIQUE')) throw new AppFehler(409, GEHT_NICHT);
      throw fehler;
    }
    const einfuegen = db.prepare(
      'INSERT INTO "correction" (id, note_id, from_topic_id, to_topic_id, created) VALUES (?, ?, ?, ?, ?)',
    );
    for (const korrektur of bild.corrections) {
      einfuegen.run(korrektur.id, korrektur.noteId, korrektur.fromTopicId, korrektur.toTopicId, korrektur.created);
    }
    db.prepare('DELETE FROM "note_undo" WHERE token = ? AND account_id = ?').run(token, kontoId);
    const neu = liesNotizNachId(db, bild.note.id, kontoId);
    if (!neu) throw new AppFehler(500, GEHT_NICHT);
    return alsNotiz(neu);
  });
}
