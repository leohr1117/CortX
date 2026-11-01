import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { NOTE_TEXT_MAX, TOPIC_NAME_MAX } from '../../../shared/kern/grenzen.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { legeAb } from './ablage.ts';
import { verschiebe } from './verschieben.ts';

const UNGUELTIG = 'The note text is missing or invalid.';
const THEMA_UNGUELTIG = 'The topic name is missing or invalid.';

const eingang = z
  .object({
    text: z.string().max(NOTE_TEXT_MAX),
    clientId: z.uuid().optional(),
  })
  .strict();

const ziel = z
  .object({
    topic: z.string().max(TOPIC_NAME_MAX),
  })
  .strict();

const idForm = z.object({ id: z.string().regex(/^[1-9]\d*$/) });

export function notizRouten(api: FastifyInstance, db: DatabaseSync): void {
  api.post('/notes', async (anfrage, antwort) => {
    const body = eingang.safeParse(anfrage.body);
    if (!body.success) throw new AppFehler(400, UNGUELTIG);
    const ergebnis = legeAb(db, body.data.text, body.data.clientId ?? null);
    return antwort.status(ergebnis.neu ? 201 : 200).send(ergebnis.notiz);
  });

  api.post('/notes/:id/move', async (anfrage, antwort) => {
    const parameter = idForm.safeParse(anfrage.params);
    if (!parameter.success) throw new AppFehler(404, 'Note not found.');
    const body = ziel.safeParse(anfrage.body);
    if (!body.success) throw new AppFehler(400, THEMA_UNGUELTIG);
    return antwort.status(200).send(verschiebe(db, Number(parameter.data.id), body.data.topic));
  });
}
