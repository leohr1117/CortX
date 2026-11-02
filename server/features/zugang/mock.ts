import http from 'node:http';
import { STRIDE_COOKIE } from '../../../shared/features/zugang/grenzen.ts';
import { STRIDE_PORT } from '../../../shared/kern/grenzen.ts';

export const MOCK_NAME = 'note@example.com';
export const MOCK_PASSWORT = 'test-password';
export const MOCK_PORT = 3111;

const MOCK_SITZUNG = 'mock-session';
const BENUTZER_MAX = 40;
const PASSWORT_MIN = 10;
const PASSWORT_MAX = 200;
const SITZUNG_SEKUNDEN = 30 * 24 * 60 * 60;

export interface MockRuf {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export interface StrideMock {
  url: string;
  rufe: MockRuf[];
  close: () => Promise<void>;
}

function objekt(wert: unknown): Record<string, unknown> | null {
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return null;
  return wert as Record<string, unknown>;
}

function liesAnmeldung(body: string): { benutzername: string; passwort: string } | null {
  let roh: unknown;
  try {
    roh = JSON.parse(body) as unknown;
  } catch {
    return null;
  }
  const daten = objekt(roh);
  if (!daten || typeof daten.passwort !== 'string') return null;
  if (daten.passwort.length < PASSWORT_MIN || daten.passwort.length > PASSWORT_MAX) return null;
  if (typeof daten.benutzername !== 'string') return null;
  const benutzername = daten.benutzername.trim();
  if (benutzername.length < 1 || benutzername.length > BENUTZER_MAX) return null;
  return { benutzername, passwort: daten.passwort };
}

function sitzungCookie(): string {
  return `${STRIDE_COOKIE}=${MOCK_SITZUNG}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SITZUNG_SEKUNDEN}`;
}

function bereit(benutzername: string): string {
  return JSON.stringify({ modus: 'bereit', benutzername, rolle: 'inhaber', admin: false });
}

function hatSitzung(cookie: string | undefined): boolean {
  if (!cookie) return false;
  return cookie.split(';').some((teil) => teil.trim() === `${STRIDE_COOKIE}=${MOCK_SITZUNG}`);
}

function json(res: http.ServerResponse, status: number, body: string, extra?: http.OutgoingHttpHeaders): void {
  res.writeHead(status, { 'content-type': 'application/json', ...extra });
  res.end(body);
}

export function starteStrideMock(port = 0): Promise<StrideMock> {
  if (port === STRIDE_PORT) throw new Error('Tests must not call Stride.');
  const rufe: MockRuf[] = [];
  const server = http.createServer((req, res) => {
    const stuecke: Buffer[] = [];
    req.on('data', (stueck: Buffer) => {
      stuecke.push(stueck);
    });
    req.on('end', () => {
      const body = Buffer.concat(stuecke).toString('utf8');
      rufe.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      if (req.url !== '/api/zugang') {
        res.writeHead(404);
        res.end();
        return;
      }
      if (req.method === 'GET') {
        const cookie = typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined;
        if (hatSitzung(cookie)) {
          json(res, 200, bereit(MOCK_NAME));
          return;
        }
        json(res, 200, JSON.stringify({ modus: 'anmelden', benutzername: null, rolle: null, admin: false }));
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end();
        return;
      }
      const anmeldung = liesAnmeldung(body);
      if (!anmeldung) {
        json(res, 400, JSON.stringify({ fehler: 'Ungültige Eingabe.' }));
        return;
      }
      if (anmeldung.benutzername === MOCK_NAME && anmeldung.passwort === MOCK_PASSWORT) {
        json(res, 200, bereit(anmeldung.benutzername), { 'set-cookie': sitzungCookie() });
        return;
      }
      json(res, 401, JSON.stringify({ fehler: 'Anmeldung fehlgeschlagen.' }));
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const adresse = server.address();
      const echt = typeof adresse === 'object' && adresse ? adresse.port : port;
      resolve({
        url: `http://127.0.0.1:${echt}/api/zugang`,
        rufe,
        close: () =>
          new Promise((fertig, scheitere) => {
            server.close((fehler) => (fehler ? scheitere(fehler) : fertig()));
          }),
      });
    });
  });
}
