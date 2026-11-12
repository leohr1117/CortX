import type { DatabaseSync } from 'node:sqlite';
import type { Node } from 'prosemirror-model';
import { exportiere } from '../../../shared/features/format/md.ts';
import { istLeer } from '../../../shared/features/seiten/index.ts';
import { mitHakenKurz } from '../../../shared/features/seiten/knoten.ts';
import { NOTE_TEXT_MAX } from '../../../shared/kern/grenzen.ts';
import type { Notiz } from '../../../shared/kern/modell.ts';
import { TEXTE } from '../../../shared/kern/texte.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { transaktion } from '../../kern/db.ts';
import { jsonVon } from './ablage.ts';
import { alsNotiz, liesNotizNachClient, liesNotizNachId } from './lesen.ts';

export interface KopieErgebnis {
  notiz: Notiz;
  neu: boolean;
}

// A conflict copy lands in the topic of its original, exactly as sent: no target-line parsing, so no part of
// the typed text can be filed somewhere else. The client id makes a repeated request return the same copy.
export function legeKopieAn(db: DatabaseSync, id: number, doc: Node, clientId: string, kontoId: string): KopieErgebnis {
  return transaktion(db, () => {
    const vorhanden = liesNotizNachClient(db, clientId, kontoId);
    if (vorhanden) return { notiz: alsNotiz(vorhanden), neu: false };
    const original = liesNotizNachId(db, id, kontoId);
    if (!original) throw new AppFehler(404, TEXTE.notizFehlt);
    const klar = mitHakenKurz(doc);
    if (istLeer(klar)) throw new AppFehler(400, TEXTE.leerSpeichern);
    if (exportiere(klar).length > NOTE_TEXT_MAX) throw new AppFehler(400, TEXTE.notizLang);
    const info = db
      .prepare(
        `INSERT INTO "note" (doc, created, topic_id, source, ai_confidence, client_id, pinned, account_id)
         VALUES (?, ?, ?, 'manual', NULL, ?, 0, ?)`,
      )
      .run(jsonVon(klar), new Date().toISOString(), original.topicId, clientId, kontoId);
    const neu = liesNotizNachId(db, Number(info.lastInsertRowid), kontoId);
    if (!neu) throw new AppFehler(500, TEXTE.speichernNotiz);
    return { notiz: alsNotiz(neu), neu: true };
  });
}
