import http from 'node:http';
import { STRIDE_PORT } from '../../../shared/kern/grenzen.ts';

export const MOCK_NAME = 'note@example.com';
export const MOCK_PASSWORT = 'test-password';
export const MOCK_KONTO = 'stride-konto';
export const MOCK_PORT = 3111;

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
        const cookie = req.headers.cookie ?? '';
        if (cookie.includes('stride=mock-session')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ konto: { id: MOCK_KONTO } }));
          return;
        }
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, fehler: 'session expired' }));
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end();
        return;
      }
      let daten: { name?: unknown; passwort?: unknown } = {};
      try {
        daten = JSON.parse(body) as { name?: unknown; passwort?: unknown };
      } catch {
        daten = {};
      }
      if (daten.name === MOCK_NAME && daten.passwort === MOCK_PASSWORT) {
        res.writeHead(200, {
          'content-type': 'application/json',
          'set-cookie': 'stride=mock-session; HttpOnly; Path=/',
        });
        res.end(JSON.stringify({ konto: { id: MOCK_KONTO, name: daten.name } }));
        return;
      }
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
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
