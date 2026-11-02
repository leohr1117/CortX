import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  COOKIE_NAME,
  NAME_MAX,
  PASSWORT_MAX,
  SITZUNG_SEKUNDEN,
  echteIp,
  istSicher,
  liesSitzung,
  loeschCookie,
  sitzungCookie,
} from '../../../shared/features/zugang/index.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { liesGueltigeSitzung, loescheSitzung, meldeAn } from './sitzung.ts';
import type { StridePruefer } from './stride.ts';

declare module 'fastify' {
  interface FastifyRequest {
    kontoId: string | null;
  }
}

const FEHLT = 'Enter your username and password.';
const FALSCH = 'The username or password is wrong.';
const WEG = 'Stride is not reachable. Try again later.';
const LIMIT = 'Too many sign-in attempts. Try again later.';
const KAPUTT = 'Could not sign in.';
const AN = 'Sign in.';

const koerper = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX),
    passwort: z.string().min(1).max(PASSWORT_MAX),
  })
  .strict();

export interface Dienste {
  stride: StridePruefer;
  jetzt: () => number;
}

function kopfWert(wert: string | string[] | undefined): string | null {
  if (Array.isArray(wert)) return wert[0] ?? null;
  return wert ?? null;
}

function cookieKopf(anfrage: FastifyRequest): string | undefined {
  return typeof anfrage.headers.cookie === 'string' ? anfrage.headers.cookie : undefined;
}

export function clientIp(anfrage: FastifyRequest): string {
  return echteIp(
    {
      cf: kopfWert(anfrage.headers['cf-connecting-ip']),
      forwarded: kopfWert(anfrage.headers['x-forwarded-for']),
    },
    anfrage.ip,
  );
}

function sicher(anfrage: FastifyRequest): boolean {
  return istSicher(kopfWert(anfrage.headers['x-forwarded-proto']) ?? undefined, anfrage.protocol);
}

function offen(methode: string, url: string): boolean {
  const pfad = (url.split('?')[0] ?? url).replace(/\/$/, '');
  return methode === 'POST' && (pfad.endsWith('/zugang') || pfad.endsWith('/abmelden'));
}

export function verlangeKonto(anfrage: FastifyRequest): string {
  if (!anfrage.kontoId) throw new AppFehler(401, AN);
  return anfrage.kontoId;
}

function antwortFuer(
  art: 'eingabe' | 'abgelehnt' | 'limit' | 'nicht_erreichbar' | 'unbekannt',
): { status: number; error: string } {
  if (art === 'eingabe') return { status: 400, error: FEHLT };
  if (art === 'abgelehnt') return { status: 401, error: FALSCH };
  if (art === 'limit') return { status: 429, error: LIMIT };
  if (art === 'nicht_erreichbar') return { status: 502, error: WEG };
  return { status: 502, error: KAPUTT };
}

export function zugangRouten(api: FastifyInstance, db: DatabaseSync, dienste: Dienste): void {
  api.addHook('preHandler', async (anfrage, antwort) => {
    if (offen(anfrage.method, anfrage.url)) return;
    const token = liesSitzung(cookieKopf(anfrage));
    const sitzung = token
      ? await liesGueltigeSitzung(db, token, clientIp(anfrage), dienste.stride, dienste.jetzt())
      : null;
    if (!sitzung) {
      antwort.header('Cache-Control', 'no-store');
      return antwort.status(401).send({ error: AN });
    }
    anfrage.kontoId = sitzung.accountId;
  });

  api.post('/zugang', async (anfrage, antwort) => {
    const body = koerper.safeParse(anfrage.body);
    if (!body.success) throw new AppFehler(400, FEHLT);
    const ergebnis = await meldeAn(
      db,
      body.data.name,
      body.data.passwort,
      clientIp(anfrage),
      dienste.stride,
      dienste.jetzt(),
    );
    antwort.header('Cache-Control', 'no-store');
    if (ergebnis.art !== 'ok') {
      const fehler = antwortFuer(ergebnis.art);
      return antwort.status(fehler.status).send({ error: fehler.error });
    }
    antwort.header('Set-Cookie', sitzungCookie(ergebnis.token, sicher(anfrage), SITZUNG_SEKUNDEN));
    return { signedIn: true };
  });

  api.get('/zugang', async (_anfrage, antwort) => {
    antwort.header('Cache-Control', 'no-store');
    return { signedIn: true };
  });

  api.post('/abmelden', async (anfrage, antwort) => {
    const token = liesSitzung(cookieKopf(anfrage));
    if (token) loescheSitzung(db, token);
    antwort.header('Set-Cookie', loeschCookie(COOKIE_NAME, sicher(anfrage)));
    antwort.header('Cache-Control', 'no-store');
    return { signedOut: true };
  });
}
