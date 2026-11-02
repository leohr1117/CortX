import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { ZodError } from 'zod';
import { bibliothekRouten } from '../features/library/index.ts';
import { notizRouten } from '../features/notes/index.ts';
import { sucheRouten } from '../features/suche/index.ts';
import { themenRouten } from '../features/topics/index.ts';
import { versionsRouten } from '../features/version/index.ts';
import { zugangRouten, type Dienste } from '../features/zugang/index.ts';
import { strideHttp } from '../features/zugang/stride.ts';
import { stridePasswortZiel } from '../../shared/features/zugang/index.ts';
import { stridePublicUrl, strideUrl } from './config.ts';
import { AppFehler } from './fehler.ts';

const UNGUELTIG = 'The note text is missing or invalid.';
const INTERN = 'Could not file the note.';
const STUFEN = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

function protokoll(stufe: string | false): FastifyServerOptions['logger'] {
  if (stufe === false || stufe === 'silent') return false;
  if (STUFEN.has(stufe)) return { level: stufe as 'warn' };
  return { level: 'warn' };
}

export async function erstelleApp(
  db: DatabaseSync,
  clientPfad: string | null = null,
  stufe: string | false = false,
  dienste: Partial<Dienste> = {},
): Promise<FastifyInstance> {
  const lauf: Dienste = {
    stride: dienste.stride ?? strideHttp(strideUrl()),
    jetzt: dienste.jetzt ?? (() => Date.now()),
  };
  const app = Fastify({ logger: protokoll(stufe) });
  app.decorateRequest('kontoId', null);
  const passwortZiel = stridePasswortZiel(stridePublicUrl());

  app.get('/.well-known/change-password', async (_anfrage, antwort) => {
    antwort.header('Cache-Control', 'no-store');
    return antwort.redirect(passwortZiel, 302);
  });

  app.setErrorHandler((fehler: FastifyError | Error, anfrage, antwort) => {
    if (fehler instanceof ZodError || fehler instanceof AppFehler) {
      const statusCode = fehler instanceof AppFehler ? fehler.statusCode : 400;
      const error = fehler instanceof AppFehler ? fehler.message : UNGUELTIG;
      return antwort.status(statusCode).send({ error });
    }
    const statusCode = 'statusCode' in fehler ? fehler.statusCode : undefined;
    if (statusCode !== undefined && statusCode < 500) {
      return antwort.status(statusCode).send({ error: UNGUELTIG });
    }
    anfrage.log.error({ err: fehler }, 'request failed');
    return antwort.status(500).send({ error: INTERN });
  });

  await app.register(
    async (api) => {
      zugangRouten(api, db, lauf);
      versionsRouten(api, db);
      themenRouten(api, db);
      notizRouten(api, db);
      bibliothekRouten(api, db);
      sucheRouten(api, db);
    },
    { prefix: '/api' },
  );

  const clientDa = clientPfad !== null && fs.existsSync(path.join(clientPfad, 'index.html'));
  if (clientDa && clientPfad) {
    await app.register(fastifyStatic, { root: clientPfad });
  }

  app.setNotFoundHandler((anfrage, antwort) => {
    if (anfrage.url.startsWith('/api/') || !clientDa) {
      return antwort.status(404).send({ error: 'Not found.' });
    }
    return antwort.sendFile('index.html');
  });

  await app.ready();
  return app;
}
