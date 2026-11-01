import type { DatabaseSync } from 'node:sqlite';
import { planeAblage } from '../../../shared/features/tags/index.ts';
import type { Notiz } from '../../../shared/kern/modell.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { transaktion } from '../../kern/db.ts';
import { legeThemaAn, listeThemen, themaId } from '../topics/index.ts';
import { alsNotiz, liesNotizNachClient, liesNotizNachId } from './lesen.ts';

export function legeAb(
  db: DatabaseSync,
  roh: string,
  clientId: string | null,
  kontoId: string,
): { notiz: Notiz; neu: boolean } {
  return transaktion(db, () => {
    if (clientId) {
      const vorhanden = liesNotizNachClient(db, clientId, kontoId);
      if (vorhanden) return { notiz: alsNotiz(vorhanden), neu: false };
    }
    const plan = planeAblage(roh, listeThemen(db, kontoId));
    if (!plan) throw new AppFehler(400, 'Write something to file.');
    const topicId = plan.neu ? legeThemaAn(db, plan.topicName, kontoId) : themaId(db, plan.topicName, kontoId);
    if (topicId === null) throw new AppFehler(500, 'Could not file the note.');
    const created = new Date().toISOString();
    try {
      const info = db
        .prepare(
          `INSERT INTO "note" (text, created, topic_id, source, ai_confidence, client_id, pinned, account_id)
           VALUES (?, ?, ?, ?, NULL, ?, 0, ?)`,
        )
        .run(plan.text, created, topicId, plan.source, clientId, kontoId);
      const zeile = liesNotizNachId(db, Number(info.lastInsertRowid), kontoId);
      if (!zeile) throw new AppFehler(500, 'Could not file the note.');
      return { notiz: alsNotiz(zeile), neu: true };
    } catch (fehler) {
      if (clientId && fehler instanceof Error && fehler.message.includes('UNIQUE')) {
        const vorhanden = liesNotizNachClient(db, clientId, kontoId);
        if (vorhanden) return { notiz: alsNotiz(vorhanden), neu: false };
      }
      throw fehler;
    }
  });
}
