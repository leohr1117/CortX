import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Node } from 'prosemirror-model';
import { z } from 'zod';
import { planeNotizText, textMeldung } from '../../../shared/features/edit/index.ts';
import { pruefeDokument } from '../../../shared/features/format/dokument.ts';
import { exportiere } from '../../../shared/features/format/md.ts';
import { istLeer } from '../../../shared/features/seiten/index.ts';
import { mitHakenKurz } from '../../../shared/features/seiten/knoten.ts';
import { NOTE_TEXT_MAX } from '../../../shared/kern/grenzen.ts';
import { TEXTE } from '../../../shared/kern/texte.ts';
import type { Notiz } from '../../../shared/kern/modell.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { transaktion } from '../../kern/db.ts';
import { jsonVon } from './ablage.ts';
import { alsNotiz, liesNotizNachId, spalteAusText, textAusDokument, type NotizZeile } from './lesen.ts';

const NICHTS = TEXTE.nichtsRueck;
const GEHT_NICHT = TEXTE.nichtRueck;
const SPEICHERN = TEXTE.speichernNotiz;
const LOESCHEN = TEXTE.loeschenNotiz;
const KONFLIKT = TEXTE.seiteKonflikt;

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
        doc: z.string().min(2),
        created: z.string().min(1),
        topicId: z.number().int().positive(),
        source: z.enum(['tag', 'ai', 'manual']),
        aiConfidence: z.number().min(0).max(1).nullable(),
        clientId: z.string().min(1).nullable(),
        pinned: z.union([z.literal(0), z.literal(1)]),
        version: z.number().int().positive().optional(),
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
    if (!gueltigesDoc(bild.note.doc)) return null;
    return bild;
  } catch {
    return null;
  }
}

function gueltigesDoc(doc: string): boolean {
  try {
    return textAusDokument(JSON.parse(doc)) !== null;
  } catch {
    return false;
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
      doc: notiz.docJson,
      created: notiz.created,
      topicId: notiz.topicId,
      source: notiz.source,
      aiConfidence: notiz.aiConfidence,
      clientId: notiz.clientId,
      pinned: notiz.pinned === 1 ? 1 : 0,
      version: notiz.version,
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

interface SeitenUndo {
  art: 'anhaengen' | 'anlegen';
  id: number;
  doc: string;
  version: number;
}

function seitenBild(payload: string): SeitenUndo | null {
  try {
    const roh = JSON.parse(payload) as { art?: unknown; id?: unknown; doc?: unknown; version?: unknown };
    if (roh.art !== 'anhaengen' && roh.art !== 'anlegen') return null;
    if (typeof roh.id !== 'number' || typeof roh.doc !== 'string' || typeof roh.version !== 'number') return null;
    if (!gueltigesDoc(roh.doc)) return null;
    return { art: roh.art, id: roh.id, doc: roh.doc, version: roh.version };
  } catch {
    return null;
  }
}

function seitenZurueck(db: DatabaseSync, bild: SeitenUndo, kontoId: string): Notiz {
  const notiz = liesNotizNachId(db, bild.id, kontoId);
  if (!notiz) throw new AppFehler(409, GEHT_NICHT);
  if (bild.art === 'anhaengen') {
    if (notiz.version !== bild.version + 1) throw new AppFehler(409, GEHT_NICHT);
    const geschrieben = db
      .prepare('UPDATE "note" SET doc = ?, version = version + 1 WHERE id = ? AND account_id = ? AND version = ?')
      .run(bild.doc, bild.id, kontoId, bild.version + 1);
    if (Number(geschrieben.changes) !== 1) throw new AppFehler(409, GEHT_NICHT);
  } else {
    if (notiz.docJson !== bild.doc || notiz.version !== bild.version) throw new AppFehler(409, GEHT_NICHT);
    db.prepare('DELETE FROM "note_revision" WHERE note_id = ?').run(bild.id);
    db.prepare('DELETE FROM "correction" WHERE note_id = ?').run(bild.id);
    const weg = db.prepare('DELETE FROM "note" WHERE id = ? AND account_id = ?').run(bild.id, kontoId);
    if (Number(weg.changes) !== 1) throw new AppFehler(409, GEHT_NICHT);
    db.prepare('DELETE FROM "note_undo" WHERE account_id = ?').run(kontoId);
    return alsNotiz(notiz);
  }
  db.prepare('DELETE FROM "note_undo" WHERE account_id = ?').run(kontoId);
  const neu = liesNotizNachId(db, bild.id, kontoId);
  if (!neu) throw new AppFehler(500, GEHT_NICHT);
  return alsNotiz(neu);
}

export function speichereText(db: DatabaseSync, id: number, roh: string, version: number, kontoId: string): Notiz {
  return transaktion(db, () => {
    const plan = planeNotizText(roh);
    if (!plan.ok) throw new AppFehler(400, textMeldung(plan.grund));
    const notiz = liesNotizNachId(db, id, kontoId);
    if (!notiz) throw new AppFehler(404, TEXTE.notizFehlt);
    if (notiz.text !== plan.text) {
      const geschrieben = db
        .prepare('UPDATE "note" SET doc = ?, version = version + 1 WHERE id = ? AND account_id = ? AND version = ?')
        .run(spalteAusText(plan.text), id, kontoId, version);
      if (Number(geschrieben.changes) !== 1) {
        if (!liesNotizNachId(db, id, kontoId)) throw new AppFehler(404, TEXTE.notizFehlt);
        throw new AppFehler(409, KONFLIKT);
      }
    }
    const neu = liesNotizNachId(db, id, kontoId);
    if (!neu) throw new AppFehler(500, SPEICHERN);
    return alsNotiz(neu);
  });
}

export function speichereDokument(db: DatabaseSync, id: number, doc: Node, version: number, kontoId: string): Notiz {
  return transaktion(db, () => {
    const klar = mitHakenKurz(doc);
    if (istLeer(klar)) throw new AppFehler(400, TEXTE.leerSpeichern);
    if (exportiere(klar).length > NOTE_TEXT_MAX) throw new AppFehler(400, TEXTE.notizLang);
    const notiz = liesNotizNachId(db, id, kontoId);
    if (!notiz) throw new AppFehler(404, TEXTE.notizFehlt);
    const gespeichert = pruefeDokument(notiz.doc);
    if (!gespeichert || !gespeichert.eq(klar)) {
      const geschrieben = db
        .prepare('UPDATE "note" SET doc = ?, version = version + 1 WHERE id = ? AND account_id = ? AND version = ?')
        .run(jsonVon(klar), id, kontoId, version);
      if (Number(geschrieben.changes) !== 1) {
        if (!liesNotizNachId(db, id, kontoId)) throw new AppFehler(404, TEXTE.notizFehlt);
        throw new AppFehler(409, KONFLIKT);
      }
    }
    const neu = liesNotizNachId(db, id, kontoId);
    if (!neu) throw new AppFehler(500, SPEICHERN);
    return alsNotiz(neu);
  });
}

export function loescheNotiz(db: DatabaseSync, id: number, kontoId: string): { token: string } {
  return transaktion(db, () => {
    const notiz = liesNotizNachId(db, id, kontoId);
    if (!notiz) throw new AppFehler(404, TEXTE.notizFehlt);
    const bild = schnapp(db, notiz);
    db.prepare('DELETE FROM "note_revision" WHERE note_id = ?').run(id);
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

interface SammelSchritt {
  art: 'anhaengen' | 'anlegen';
  id: number;
  doc: string;
  version: number;
  nachher: number | null;
}

interface SammelBild {
  schritte: SammelSchritt[];
  erfasst: string | null;
}

function sammelBild(payload: string): SammelBild | null {
  try {
    const roh = JSON.parse(payload) as { art?: unknown; schritte?: unknown; erfasst?: unknown };
    if (roh.art !== 'sammel' || !Array.isArray(roh.schritte) || roh.schritte.length === 0) return null;
    if (roh.erfasst !== undefined && (typeof roh.erfasst !== 'string' || roh.erfasst.length > NOTE_TEXT_MAX)) return null;
    const schritte: SammelSchritt[] = [];
    for (const schritt of roh.schritte) {
      if (!schritt || typeof schritt !== 'object') return null;
      const eintrag = schritt as { art?: unknown; id?: unknown; doc?: unknown; version?: unknown; nachher?: unknown };
      if ((eintrag.art !== 'anhaengen' && eintrag.art !== 'anlegen') || typeof eintrag.id !== 'number') return null;
      if (typeof eintrag.doc !== 'string' || typeof eintrag.version !== 'number' || !gueltigesDoc(eintrag.doc)) return null;
      if (eintrag.art === 'anhaengen') {
        if (typeof eintrag.nachher !== 'number') return null;
        schritte.push({ art: 'anhaengen', id: eintrag.id, doc: eintrag.doc, version: eintrag.version, nachher: eintrag.nachher });
        continue;
      }
      schritte.push({ art: 'anlegen', id: eintrag.id, doc: eintrag.doc, version: eintrag.version, nachher: null });
    }
    return { schritte, erfasst: typeof roh.erfasst === 'string' ? roh.erfasst : null };
  } catch {
    return null;
  }
}

function schrittZurueck(db: DatabaseSync, schritt: SammelSchritt, kontoId: string): Notiz {
  const notiz = liesNotizNachId(db, schritt.id, kontoId);
  if (!notiz) throw new AppFehler(409, GEHT_NICHT);
  if (schritt.art === 'anhaengen') {
    if (notiz.version !== schritt.nachher) throw new AppFehler(409, GEHT_NICHT);
    const geschrieben = db
      .prepare('UPDATE "note" SET doc = ?, version = version + 1 WHERE id = ? AND account_id = ? AND version = ?')
      .run(schritt.doc, schritt.id, kontoId, schritt.nachher);
    if (Number(geschrieben.changes) !== 1) throw new AppFehler(409, GEHT_NICHT);
    const neu = liesNotizNachId(db, schritt.id, kontoId);
    if (!neu) throw new AppFehler(500, GEHT_NICHT);
    return alsNotiz(neu);
  }
  if (notiz.docJson !== schritt.doc || notiz.version !== schritt.version) throw new AppFehler(409, GEHT_NICHT);
  db.prepare('DELETE FROM "note_revision" WHERE note_id = ?').run(schritt.id);
  db.prepare('DELETE FROM "correction" WHERE note_id = ?').run(schritt.id);
  const weg = db.prepare('DELETE FROM "note" WHERE id = ? AND account_id = ?').run(schritt.id, kontoId);
  if (Number(weg.changes) !== 1) throw new AppFehler(409, GEHT_NICHT);
  return alsNotiz(notiz);
}

function mitErfasst(notiz: Notiz, erfasst: string | null): Notiz & { erfasst?: string } {
  if (erfasst === null) return notiz;
  return { ...notiz, erfasst };
}

function sammelZurueck(
  db: DatabaseSync,
  schritte: readonly SammelSchritt[],
  erfasst: string | null,
  kontoId: string,
): Notiz & { erfasst?: string } {
  let letzte: Notiz | null = null;
  for (const schritt of schritte) letzte = schrittZurueck(db, schritt, kontoId);
  if (!letzte) throw new AppFehler(500, GEHT_NICHT);
  db.prepare('DELETE FROM "note_undo" WHERE account_id = ?').run(kontoId);
  return mitErfasst(letzte, erfasst);
}

export function stelleNotizHer(db: DatabaseSync, token: string, kontoId: string): Notiz & { erfasst?: string } {
  return transaktion(db, () => {
    const zeile = db.prepare('SELECT payload FROM "note_undo" WHERE token = ? AND account_id = ?').get(token, kontoId) as
      | { payload: string }
      | undefined;
    if (!zeile) throw new AppFehler(404, NICHTS);
    const sammel = sammelBild(zeile.payload);
    if (sammel) return sammelZurueck(db, sammel.schritte, sammel.erfasst, kontoId);
    const seitenUndo = seitenBild(zeile.payload);
    if (seitenUndo) return seitenZurueck(db, seitenUndo, kontoId);
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
        `INSERT INTO "note" (id, doc, created, topic_id, source, ai_confidence, client_id, pinned, account_id, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        bild.note.id,
        bild.note.doc,
        bild.note.created,
        bild.note.topicId,
        bild.note.source,
        bild.note.aiConfidence,
        bild.note.clientId,
        bild.note.pinned,
        kontoId,
        bild.note.version ?? 1,
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
