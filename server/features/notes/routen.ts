import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { NOTE_TEXT_MAX, TOPIC_NAME_MAX } from '../../../shared/kern/grenzen.ts';
import { TEXTE } from '../../../shared/kern/texte.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { verlangeKonto } from '../zugang/index.ts';
import { loescheNotiz, speichereText, stelleNotizHer } from './aendern.ts';
import { legeAb } from './ablage.ts';
import { listeSeiten } from './katalog.ts';
import { alsNotiz, liesNotizNachId, textAusDokument } from './lesen.ts';
import { verschiebe } from './verschieben.ts';

const UNGUELTIG = TEXTE.notizUngueltig;
const THEMA_UNGUELTIG = TEXTE.themaUngueltig;

const eingang = z
  .object({
    text: z.string().max(NOTE_TEXT_MAX).optional(),
    doc: z.unknown().optional(),
    clientId: z.uuid().optional(),
  })
  .strict();

const ziel = z
  .object({
    topic: z.string().max(TOPIC_NAME_MAX),
  })
  .strict();

const idForm = z.object({ id: z.string().regex(/^[1-9]\d*$/) });
const textBody = z
  .object({
    text: z.string().max(NOTE_TEXT_MAX).optional(),
    doc: z.unknown().optional(),
    version: z.number().int().positive(),
  })
  .strict();
const undoBody = z.object({ token: z.uuid() }).strict();

function rohtext(body: { text?: string; doc?: unknown }): string {
  if (body.doc !== undefined) {
    const text = textAusDokument(body.doc);
    if (text === null || text.length > NOTE_TEXT_MAX) throw new AppFehler(400, UNGUELTIG);
    return text;
  }
  if (body.text === undefined) throw new AppFehler(400, UNGUELTIG);
  return body.text;
}

function notizId(params: unknown): number {
  const parameter = idForm.safeParse(params);
  if (!parameter.success) throw new AppFehler(404, TEXTE.notizFehlt);
  return Number(parameter.data.id);
}

export function notizRouten(api: FastifyInstance, db: DatabaseSync): void {
  api.post('/notes', async (anfrage, antwort) => {
    const konto = verlangeKonto(anfrage);
    const body = eingang.safeParse(anfrage.body);
    if (!body.success) throw new AppFehler(400, UNGUELTIG);
    const ergebnis = legeAb(db, rohtext(body.data), body.data.clientId ?? null, konto);
    return antwort.status(ergebnis.neu ? 201 : 200).send({ ...ergebnis.notiz, ziel: ergebnis.ziel, undo: ergebnis.undo });
  });

  api.get('/seiten', async (anfrage) => {
    const konto = verlangeKonto(anfrage);
    return { seiten: listeSeiten(db, konto) };
  });

  api.post('/notes/undo', async (anfrage) => {
    const konto = verlangeKonto(anfrage);
    const body = undoBody.safeParse(anfrage.body);
    if (!body.success) throw new AppFehler(400, TEXTE.nichtsRueck);
    return stelleNotizHer(db, body.data.token, konto);
  });

  api.get('/notes/:id', async (anfrage) => {
    const notiz = liesNotizNachId(db, notizId(anfrage.params), verlangeKonto(anfrage));
    if (!notiz) throw new AppFehler(404, TEXTE.notizFehlt);
    return alsNotiz(notiz);
  });

  api.post('/notes/:id', async (anfrage) => {
    const konto = verlangeKonto(anfrage);
    const body = textBody.safeParse(anfrage.body);
    if (!body.success) throw new AppFehler(400, UNGUELTIG);
    return speichereText(db, notizId(anfrage.params), rohtext(body.data), body.data.version, konto);
  });

  api.post('/notes/:id/delete', async (anfrage) => loescheNotiz(db, notizId(anfrage.params), verlangeKonto(anfrage)));

  api.post('/notes/:id/move', async (anfrage, antwort) => {
    const konto = verlangeKonto(anfrage);
    const body = ziel.safeParse(anfrage.body);
    if (!body.success) throw new AppFehler(400, THEMA_UNGUELTIG);
    return antwort.status(200).send(verschiebe(db, notizId(anfrage.params), body.data.topic, konto));
  });
}
