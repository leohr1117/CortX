import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { istVersionsnummer } from '../../../shared/features/version/index.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { verlangeKonto } from '../zugang/index.ts';
import { liesStand, merkeStand } from './stand.ts';

const UNGUELTIG = 'The version is missing or invalid.';

const nummer = z.string().refine(istVersionsnummer);
const koerper = z
  .object({
    notified: nummer.optional(),
    seen: nummer.optional(),
  })
  .strict()
  .refine((wert) => wert.notified !== undefined || wert.seen !== undefined);

export function versionsRouten(api: FastifyInstance, db: DatabaseSync): void {
  api.get('/version', async (anfrage, antwort) => {
    antwort.header('Cache-Control', 'no-store');
    return liesStand(db, verlangeKonto(anfrage));
  });

  api.patch('/version', async (anfrage, antwort) => {
    const body = koerper.safeParse(anfrage.body);
    if (!body.success) throw new AppFehler(400, UNGUELTIG);
    antwort.header('Cache-Control', 'no-store');
    return merkeStand(db, verlangeKonto(anfrage), body.data);
  });
}
