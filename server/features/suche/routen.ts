import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { suchMeldung } from '../../../shared/features/suche/index.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { verlangeKonto } from '../zugang/index.ts';
import { sucheNotizen } from './suchen.ts';

const sucheQuery = z
  .object({
    q: z.string(),
  })
  .strict();

export function sucheRouten(api: FastifyInstance, db: DatabaseSync): void {
  api.get('/search', async (anfrage, antwort) => {
    const konto = verlangeKonto(anfrage);
    const query = sucheQuery.safeParse(anfrage.query);
    if (!query.success) throw new AppFehler(400, suchMeldung('leer'));
    antwort.header('Cache-Control', 'no-store');
    return { hits: sucheNotizen(db, query.data.q, konto) };
  });
}
