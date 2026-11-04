import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { SPEICHER } from '../../shared/kern/grenzen.ts';
import { erstelleApp } from './app.ts';
import { oeffneDatenbank } from './db.ts';

const HTML = '<!doctype html><html><head><title>CortX</title></head><body><div id="root"></div></body></html>';
const ORDNER = path.resolve('tmp-test', 'html-marke');

describe('test mark in html', () => {
  const dbs: DatabaseSync[] = [];
  const apps: FastifyInstance[] = [];
  const alt = process.env.CORTX_TEST;

  afterEach(async () => {
    if (alt === undefined) delete process.env.CORTX_TEST;
    else process.env.CORTX_TEST = alt;
    for (const app of apps) await app.close();
    for (const db of dbs) db.close();
    apps.length = 0;
    dbs.length = 0;
  });

  async function app(): Promise<FastifyInstance> {
    fs.mkdirSync(ORDNER, { recursive: true });
    fs.writeFileSync(path.join(ORDNER, 'index.html'), HTML);
    const daten = oeffneDatenbank(SPEICHER);
    dbs.push(daten);
    const server = await erstelleApp(daten, ORDNER, false);
    apps.push(server);
    return server;
  }

  it('injects the flag only when the test env is set', async () => {
    process.env.CORTX_TEST = '1';
    const server = await app();
    const start = await server.inject({ method: 'GET', url: '/' });
    const route = await server.inject({ method: 'GET', url: '/library' });
    expect(start.statusCode).toBe(200);
    expect(start.body).toContain('<head><script>globalThis.__CORTX_TEST="1"</script><title>CortX</title>');
    expect(route.body).toContain('globalThis.__CORTX_TEST="1"');
    expect(start.headers['content-type']).toContain('text/html');
    const json = await server.inject({ method: 'GET', url: '/api/library' });
    expect(json.headers['content-type']).not.toContain('text/html');
    expect(json.body).not.toContain('__CORTX_TEST');

    delete process.env.CORTX_TEST;
    const ohne = await server.inject({ method: 'GET', url: '/' });
    expect(ohne.body).toBe(HTML);
    expect(ohne.body).not.toContain('__CORTX_TEST');
  });
});
