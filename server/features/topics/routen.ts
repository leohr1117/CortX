import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { pflegeMeldung } from '../../../shared/features/topics/index.ts';
import { TOPIC_NAME_MAX } from '../../../shared/kern/grenzen.ts';
import { TEXTE } from '../../../shared/kern/texte.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { verlangeKonto } from '../zugang/index.ts';
import { benenneUm, fuehreZusammen, loescheThema, macheRueckgaengig } from './pflege.ts';
import { listeThemen } from './themen.ts';

const UNGUELTIG = pflegeMeldung('invalid');
const NICHTS = TEXTE.nichtsRueck;
const nameFeld = z.string().max(TOPIC_NAME_MAX);
const umbenennenBody = z.object({ name: nameFeld, next: nameFeld }).strict();
const zusammenBody = z.object({ name: nameFeld, into: nameFeld }).strict();
const loeschBody = z.object({ name: nameFeld }).strict();
const undoBody = z.object({ token: z.uuid() }).strict();

export function themenRouten(api: FastifyInstance, db: DatabaseSync): void {
  api.get('/topics', async (anfrage) => ({ topics: listeThemen(db, verlangeKonto(anfrage)) }));

  api.post('/topics/rename', async (anfrage) => {
    const body = umbenennenBody.safeParse(anfrage.body);
    if (!body.success) throw new AppFehler(400, UNGUELTIG);
    return benenneUm(db, body.data.name, body.data.next, verlangeKonto(anfrage));
  });

  api.post('/topics/merge', async (anfrage) => {
    const body = zusammenBody.safeParse(anfrage.body);
    if (!body.success) throw new AppFehler(400, UNGUELTIG);
    return fuehreZusammen(db, body.data.name, body.data.into, verlangeKonto(anfrage));
  });

  api.post('/topics/delete', async (anfrage) => {
    const body = loeschBody.safeParse(anfrage.body);
    if (!body.success) throw new AppFehler(400, UNGUELTIG);
    return loescheThema(db, body.data.name, verlangeKonto(anfrage));
  });

  api.post('/topics/undo', async (anfrage) => {
    const body = undoBody.safeParse(anfrage.body);
    if (!body.success) throw new AppFehler(400, NICHTS);
    return macheRueckgaengig(db, body.data.token, verlangeKonto(anfrage));
  });
}
