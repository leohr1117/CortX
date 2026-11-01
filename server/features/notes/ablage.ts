import type { DatabaseSync } from 'node:sqlite';
import { planeAblage } from '../../../shared/features/tags/index.ts';
import type { Notiz } from '../../../shared/kern/modell.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { transaktion } from '../../kern/db.ts';
import { legeThemaAn, listeThemen, themaId } from '../topics/index.ts';

export function legeAb(db: DatabaseSync, roh: string): Notiz {
  return transaktion(db, () => {
    const plan = planeAblage(roh, listeThemen(db));
    if (!plan) throw new AppFehler(400, 'Write something to file.');
    const topicId = plan.neu ? legeThemaAn(db, plan.topicName) : themaId(db, plan.topicName);
    if (topicId === null) throw new AppFehler(500, 'Could not file the note.');
    const created = new Date().toISOString();
    const info = db
      .prepare(
        'INSERT INTO "note" (text, created, topic_id, source, ai_confidence) VALUES (?, ?, ?, ?, NULL)',
      )
      .run(plan.text, created, topicId, plan.source);
    const name = db.prepare('SELECT name FROM "topic" WHERE id = ?').get(topicId) as { name: string };
    return {
      id: Number(info.lastInsertRowid),
      text: plan.text,
      created,
      topic: name.name,
      source: plan.source,
      aiConfidence: null,
    };
  });
}
