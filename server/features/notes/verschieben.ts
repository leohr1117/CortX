import type { DatabaseSync } from 'node:sqlite';
import { themaName } from '../../../shared/features/topics/index.ts';
import type { Notiz } from '../../../shared/kern/modell.ts';
import { transaktion } from '../../kern/db.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { legeThemaAn, themaId } from '../topics/index.ts';
import { alsNotiz, liesNotizNachId } from './lesen.ts';

export function verschiebe(db: DatabaseSync, id: number, roh: string, kontoId: string): Notiz {
  const name = themaName(roh);
  if (!name) throw new AppFehler(400, 'The topic name is missing or invalid.');
  return transaktion(db, () => {
    const notiz = liesNotizNachId(db, id, kontoId);
    if (!notiz) throw new AppFehler(404, 'Note not found.');
    const zielId = themaId(db, name, kontoId) ?? legeThemaAn(db, name, kontoId);
    if (zielId === notiz.topicId) return alsNotiz(notiz);
    const created = new Date().toISOString();
    db.prepare('UPDATE "note" SET topic_id = ?, pinned = 1 WHERE id = ? AND account_id = ?').run(zielId, id, kontoId);
    db.prepare(
      `INSERT INTO "correction" (note_id, from_topic_id, to_topic_id, created) VALUES (?, ?, ?, ?)`,
    ).run(id, notiz.topicId, zielId, created);
    const neu = liesNotizNachId(db, id, kontoId);
    if (!neu) throw new AppFehler(500, 'Could not move the note.');
    return alsNotiz(neu);
  });
}
