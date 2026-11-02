import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { haengeBlock, mitH1, neueSeite, planeAblage, schluessel, seitentitel } from '../../../shared/features/seiten/index.ts';
import { NOTE_TEXT_MAX } from '../../../shared/kern/grenzen.ts';
import type { Notiz } from '../../../shared/kern/modell.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { transaktion } from '../../kern/db.ts';
import { legeThemaAn, listeThemen, themaId } from '../topics/index.ts';
import { listeSeiten } from './katalog.ts';
import { alsNotiz, liesNotizNachClient, liesNotizNachId, liesNotizenFuerThema, type NotizZeile } from './lesen.ts';

const UNGUELTIG = 'The note text is missing or invalid.';
const KONFLIKT = 'This page changed. Reload it and try again.';
const LEER = 'Write something to add.';

export interface AblageErgebnis {
  notiz: Notiz;
  neu: boolean;
  ziel: string;
  undo: string;
}

function merkeUndo(db: DatabaseSync, kontoId: string, payload: unknown): string {
  const token = randomUUID();
  db.prepare('DELETE FROM "note_undo" WHERE account_id = ?').run(kontoId);
  db.prepare('INSERT INTO "note_undo" (token, payload, created, account_id) VALUES (?, ?, ?, ?)').run(
    token,
    JSON.stringify(payload),
    new Date().toISOString(),
    kontoId,
  );
  return token;
}

function findeSeite(db: DatabaseSync, topicId: number, titel: string, kontoId: string): NotizZeile | null {
  const treffer = liesNotizenFuerThema(db, topicId, kontoId).filter(
    (zeile) => schluessel(seitentitel(zeile.text)) === schluessel(titel),
  );
  treffer.sort((a, b) => b.id - a.id);
  return treffer[0] ?? null;
}

function pruefeLaenge(text: string): void {
  if (text.length > NOTE_TEXT_MAX) throw new AppFehler(400, UNGUELTIG);
}

function zielText(topic: string, titel: string, abschnitt: string | null, angehaengt: boolean): string {
  if (angehaengt && abschnitt) return `${titel} > ${abschnitt}`;
  if (angehaengt) return titel;
  return `${topic} > ${titel}`;
}

function haengeAn(db: DatabaseSync, seite: NotizZeile, block: string, abschnitt: string | null, kontoId: string): AblageErgebnis {
  if (block.trim().length === 0) throw new AppFehler(400, LEER);
  const text = haengeBlock(seite.text, block, abschnitt);
  pruefeLaenge(text);
  db.prepare(
    `INSERT INTO "note_revision" (note_id, text, version, created, account_id) VALUES (?, ?, ?, ?, ?)`,
  ).run(seite.id, seite.text, seite.version, new Date().toISOString(), kontoId);
  const geschrieben = db
    .prepare('UPDATE "note" SET text = ?, version = version + 1 WHERE id = ? AND account_id = ? AND version = ?')
    .run(text, seite.id, kontoId, seite.version);
  if (Number(geschrieben.changes) !== 1) throw new AppFehler(409, KONFLIKT);
  const undo = merkeUndo(db, kontoId, { art: 'anhaengen', id: seite.id, text: seite.text, version: seite.version });
  const neu = liesNotizNachId(db, seite.id, kontoId);
  if (!neu) throw new AppFehler(500, 'Could not file the note.');
  const titel = seitentitel(neu.text);
  return {
    notiz: alsNotiz(neu),
    neu: false,
    ziel: zielText(neu.topic, titel, abschnitt, true),
    undo,
  };
}

export function legeAb(db: DatabaseSync, roh: string, clientId: string | null, kontoId: string): AblageErgebnis {
  return transaktion(db, () => {
    if (clientId) {
      const vorhanden = liesNotizNachClient(db, clientId, kontoId);
      if (vorhanden) {
        return {
          notiz: alsNotiz(vorhanden),
          neu: false,
          ziel: `${vorhanden.topic} > ${seitentitel(vorhanden.text)}`,
          undo: '',
        };
      }
    }
    const plan = planeAblage(roh, listeThemen(db, kontoId), listeSeiten(db, kontoId));
    if (!plan) throw new AppFehler(400, 'Write something to file.');
    if (plan.ungueltig) throw new AppFehler(400, plan.hinweis ?? UNGUELTIG);
    const topicId = plan.neu ? legeThemaAn(db, plan.topicName, kontoId) : themaId(db, plan.topicName, kontoId);
    if (topicId === null) throw new AppFehler(500, 'Could not file the note.');
    if (plan.seite && !plan.neuSeite) {
      const seite = findeSeite(db, topicId, plan.seite, kontoId);
      if (seite) return haengeAn(db, seite, plan.text, plan.abschnitt, kontoId);
    }
    const text = plan.seite ? neueSeite(plan.seite, plan.abschnitt, plan.text) : mitH1(plan.text, plan.topicName);
    pruefeLaenge(text);
    const created = new Date().toISOString();
    try {
      const info = db
        .prepare(
          `INSERT INTO "note" (text, created, topic_id, source, ai_confidence, client_id, pinned, account_id)
           VALUES (?, ?, ?, ?, NULL, ?, 0, ?)`,
        )
        .run(text, created, topicId, plan.source, clientId, kontoId);
      const id = Number(info.lastInsertRowid);
      const zeile = liesNotizNachId(db, id, kontoId);
      if (!zeile) throw new AppFehler(500, 'Could not file the note.');
      const undo = merkeUndo(db, kontoId, { art: 'anlegen', id, text: zeile.text, version: zeile.version });
      const titel = seitentitel(zeile.text);
      return { notiz: alsNotiz(zeile), neu: true, ziel: zielText(zeile.topic, titel, null, false), undo };
    } catch (fehler) {
      if (clientId && fehler instanceof Error && fehler.message.includes('UNIQUE')) {
        const vorhanden = liesNotizNachClient(db, clientId, kontoId);
        if (vorhanden) {
          return {
            notiz: alsNotiz(vorhanden),
            neu: false,
            ziel: `${vorhanden.topic} > ${seitentitel(vorhanden.text)}`,
            undo: '',
          };
        }
      }
      throw fehler;
    }
  });
}
