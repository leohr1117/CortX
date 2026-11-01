import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { NOTE_TEXT_MAX } from '../../../shared/kern/grenzen.ts';
import { legeAb } from './ablage.ts';

const eingang = z
  .object({
    text: z.string().max(NOTE_TEXT_MAX),
  })
  .strict();

export function notizRouten(api: FastifyInstance, db: DatabaseSync): void {
  api.post('/notes', async (anfrage, antwort) => {
    const body = eingang.parse(anfrage.body);
    return antwort.status(201).send(legeAb(db, body.text));
  });
}
