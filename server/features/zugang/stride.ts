import { STRIDE_PORT } from '../../../shared/kern/grenzen.ts';
import { STRIDE_TIMEOUT_MS } from '../../../shared/features/zugang/index.ts';

export interface StrideRuf {
  art: 'anmelden' | 'nachpruefen';
  name: string;
  passwort: string;
  material: string | null;
  clientIp: string;
}

export interface StrideRoh {
  status: number;
  body: unknown;
  setCookie: string | null;
}

export type StridePruefer = (ruf: StrideRuf) => Promise<StrideRoh>;

function testlauf(): boolean {
  return process.env.CORTEX_TEST === '1' || process.env.VITEST === 'true';
}

export function strideHttp(url: string, hole: typeof fetch = globalThis.fetch): StridePruefer {
  const ziel = new URL(url);
  return async (ruf) => {
    if (testlauf() && ziel.port === String(STRIDE_PORT)) {
      throw new Error('Tests must not call Stride.');
    }
    const kopf: Record<string, string> = {
      'x-forwarded-for': ruf.clientIp,
      'cf-connecting-ip': ruf.clientIp,
    };
    if (ruf.art === 'nachpruefen' && ruf.material) {
      if (ruf.material.includes('=')) kopf.cookie = ruf.material;
      else kopf.authorization = `Bearer ${ruf.material}`;
    }
    const init: RequestInit = {
      method: ruf.art === 'anmelden' ? 'POST' : 'GET',
      headers: kopf,
      redirect: 'manual',
      signal: AbortSignal.timeout(STRIDE_TIMEOUT_MS),
    };
    if (ruf.art === 'anmelden') {
      kopf['content-type'] = 'application/json';
      init.headers = kopf;
      init.body = JSON.stringify({ name: ruf.name, passwort: ruf.passwort });
    }
    try {
      const antwort = await hole(ziel, init);
      const roh = await antwort.text();
      let body: unknown = null;
      if (roh) {
        try {
          body = JSON.parse(roh) as unknown;
        } catch {
          body = null;
        }
      }
      const cookies = typeof antwort.headers.getSetCookie === 'function' ? antwort.headers.getSetCookie() : [];
      const gesetzt = antwort.headers.get('set-cookie');
      return { status: antwort.status, body, setCookie: cookies.length > 0 ? cookies.join(', ') : gesetzt };
    } catch (fehler) {
      if (fehler instanceof Error && fehler.message === 'Tests must not call Stride.') throw fehler;
      return { status: 0, body: null, setCookie: null };
    }
  };
}
