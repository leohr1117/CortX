import type { FastifyInstance, InjectOptions } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { STRIDE_COOKIE } from '../../../shared/features/zugang/grenzen.ts';
import { erstelleApp } from '../../kern/app.ts';
import type { StridePruefer, StrideRoh } from './stride.ts';

export const PROBE_NAME = 'ada@example.com';
export const PROBE_PASSWORT = 'probe-passwort';
export const PROBE_KONTO = PROBE_NAME;

function bereit(benutzername: string, cookie: string | null): StrideRoh {
  return {
    status: 200,
    body: { modus: 'bereit', benutzername, rolle: 'inhaber', admin: false },
    setCookie: cookie,
  };
}

export function probeStride(): StridePruefer {
  return async (ruf) => {
    if (ruf.art === 'nachpruefen') return bereit(PROBE_NAME, null);
    if (ruf.name === PROBE_NAME && ruf.passwort === PROBE_PASSWORT) {
      return bereit(PROBE_NAME, `${STRIDE_COOKIE}=probe; HttpOnly; Path=/; SameSite=Lax`);
    }
    return { status: 401, body: { fehler: 'Anmeldung fehlgeschlagen.' }, setCookie: null };
  };
}

function mitCookie(server: FastifyInstance, cookie: string): void {
  const original = server.inject.bind(server);
  const gewickelt = (opts: InjectOptions | string) => {
    if (typeof opts === 'string') return original(opts);
    const vorhanden = opts.headers ?? {};
    if (vorhanden.cookie || vorhanden.Cookie) return original(opts);
    return original({ ...opts, headers: { ...vorhanden, cookie } });
  };
  server.inject = gewickelt as typeof server.inject;
}

export async function oeffneAngemeldet(db: DatabaseSync): Promise<FastifyInstance> {
  const server = await erstelleApp(db, null, false, { stride: probeStride() });
  const login = await server.inject({
    method: 'POST',
    url: '/api/zugang',
    payload: { name: PROBE_NAME, passwort: PROBE_PASSWORT },
  });
  if (login.statusCode !== 200) throw new Error(`Probe sign-in failed (${login.statusCode}).`);
  const roh = login.headers['set-cookie'];
  const zeile = Array.isArray(roh) ? roh[0] : roh;
  const cookie = zeile?.split(';')[0] ?? '';
  if (!cookie.startsWith('cortex_session=')) throw new Error('Probe sign-in set no session.');
  mitCookie(server, cookie);
  return server;
}
