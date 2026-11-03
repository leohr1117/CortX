import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { themaName } from '../../../shared/features/topics/index.ts';
import { TOPIC_NAME_MAX } from '../../../shared/kern/grenzen.ts';
import { TEXTE } from '../../../shared/kern/texte.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { verlangeKonto } from '../zugang/index.ts';
import { liesBibliothek, liesThemaAnsicht } from './lesen.ts';

const THEMA_UNGUELTIG = TEXTE.themaUngueltig;
const NICHT_GEFUNDEN = TEXTE.themaFehlt;

const themaQuery = z
  .object({
    topic: z.string().max(TOPIC_NAME_MAX),
  })
  .strict();

export function bibliothekRouten(api: FastifyInstance, db: DatabaseSync): void {
  api.get('/library', async (anfrage, antwort) => {
    antwort.header('Cache-Control', 'no-store');
    return liesBibliothek(db, verlangeKonto(anfrage));
  });

  api.get('/library/notes', async (anfrage, antwort) => {
    const konto = verlangeKonto(anfrage);
    const query = themaQuery.safeParse(anfrage.query);
    if (!query.success) throw new AppFehler(400, THEMA_UNGUELTIG);
    const name = themaName(query.data.topic);
    if (!name) throw new AppFehler(400, THEMA_UNGUELTIG);
    const ansicht = liesThemaAnsicht(db, name, konto);
    if (!ansicht) throw new AppFehler(404, NICHT_GEFUNDEN);
    antwort.header('Cache-Control', 'no-store');
    return ansicht;
  });
}
