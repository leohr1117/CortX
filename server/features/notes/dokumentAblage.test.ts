import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import type { Node } from 'prosemirror-model';
import { packeDokument, pruefeDokument } from '../../../shared/features/format/dokument.ts';
import { exportiere, importiere } from '../../../shared/features/format/md.ts';
import { modell } from '../../../shared/features/format/modell.ts';
import { NOTE_TEXT_MAX, SPEICHER } from '../../../shared/kern/grenzen.ts';
import { oeffneDatenbank } from '../../kern/db.ts';
import { oeffneAngemeldet } from '../zugang/attrappe.ts';

function ohneVersion(wert: unknown): unknown {
  if (wert === null || typeof wert !== 'object' || Array.isArray(wert)) return wert;
  const kopie = { ...(wert as Record<string, unknown>) };
  delete kopie.schema_version;
  return kopie;
}

function absatz(text: string, quelle = ''): Node {
  if (text.length === 0) return modell.nodes.absatz!.createChecked({ quelle });
  return modell.nodes.absatz!.createChecked({ quelle }, modell.text(text));
}

function erwartetGleich(gespeichert: unknown, knoten: Node): void {
  const gelesen = pruefeDokument(gespeichert);
  expect(gelesen).not.toBeNull();
  expect(gelesen!.eq(knoten)).toBe(true);
  expect(ohneVersion(gespeichert)).toEqual(ohneVersion(packeDokument(knoten)));
}

function enthaelt(doc: Node, knoten: Node): boolean {
  for (let index = 0; index < doc.childCount; index += 1) {
    if (doc.child(index).eq(knoten)) return true;
  }
  return false;
}

describe('document filing', () => {
  const dbs: DatabaseSync[] = [];
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    for (const app of apps) await app.close();
    for (const db of dbs) db.close();
    apps.length = 0;
    dbs.length = 0;
  });

  async function paar(): Promise<{ server: FastifyInstance; db: DatabaseSync }> {
    const db = oeffneDatenbank(SPEICHER);
    dbs.push(db);
    const server = await oeffneAngemeldet(db);
    apps.push(server);
    return { server, db };
  }

  function anzahl(db: DatabaseSync): number {
    return (db.prepare('SELECT COUNT(*) AS anzahl FROM note').get() as { anzahl: number }).anzahl;
  }

  function versionVon(db: DatabaseSync, id: number): number {
    return (db.prepare('SELECT version FROM note WHERE id = ?').get(id) as { version: number }).version;
  }

  async function lege(server: FastifyInstance, doc: unknown, extra?: Record<string, unknown>) {
    return server.inject({
      method: 'POST',
      url: '/api/notes',
      payload: extra ? { doc, ...extra } : { doc },
    });
  }

  async function liesDoc(server: FastifyInstance, id: number): Promise<unknown> {
    const antwort = await server.inject({ method: 'GET', url: `/api/notes/${id}` });
    expect(antwort.statusCode).toBe(200);
    return antwort.json().doc;
  }

  it('keeps quelle and the blank line of a filed document', async () => {
    const { server } = await paar();
    const knoten = importiere('Einkauf\n\n- Milch\n**wichtig**');
    const erstellt = await lege(server, packeDokument(knoten));
    expect(erstellt.statusCode).toBe(201);
    const id = erstellt.json().id as number;
    const doc = await liesDoc(server, id);
    erwartetGleich(doc, knoten);
    const gelesen = pruefeDokument(doc)!;
    expect(gelesen.child(1).type.name).toBe('leerzeile');
    expect(String(gelesen.child(0).attrs.quelle)).toBe(String(knoten.child(0).attrs.quelle));
    expect(String(gelesen.child(0).attrs.quelle).length).toBeGreaterThan(0);
    const zurueck = await server.inject({
      method: 'POST',
      url: '/api/notes/undo',
      payload: { token: erstellt.json().undo },
    });
    expect(zurueck.statusCode).toBe(200);
    expect(zurueck.json().erfasst).toBe(exportiere(knoten));
  });

  it('keeps an empty paragraph and an empty quelle', async () => {
    const { server } = await paar();
    const knoten = modell.node('doc', null, [absatz('Einkauf', ''), absatz('', ''), absatz('Milch', '')]);
    const erstellt = await lege(server, packeDokument(knoten));
    expect(erstellt.statusCode).toBe(201);
    const doc = await liesDoc(server, erstellt.json().id as number);
    erwartetGleich(doc, knoten);
    const gelesen = pruefeDokument(doc)!;
    expect(gelesen.child(1).type.name).toBe('absatz');
    expect(gelesen.child(1).textContent).toBe('');
    expect(String(gelesen.child(0).attrs.quelle)).toBe('');
  });

  it('saves a document unchanged, keeps the version, and rejects a stale version', async () => {
    const { server, db } = await paar();
    const kern = absatz('Kern', 'q-kern');
    const knoten = modell.node('doc', null, [kern]);
    const erstellt = await lege(server, packeDokument(knoten));
    expect(erstellt.statusCode).toBe(201);
    const id = erstellt.json().id as number;
    const gleich = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}`,
      payload: { doc: packeDokument(knoten), version: 1 },
    });
    expect(gleich.statusCode).toBe(200);
    expect(gleich.json().version).toBe(1);
    expect(versionVon(db, id)).toBe(1);
    erwartetGleich(await liesDoc(server, id), knoten);

    const rand = modell.nodes.leerzeile!.createChecked({ quelle: 'rand' });
    const mitRand = modell.node('doc', null, [rand, kern]);
    const gespeichert = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}`,
      payload: { doc: packeDokument(mitRand), version: 1 },
    });
    expect(gespeichert.statusCode).toBe(200);
    expect(gespeichert.json().version).toBe(2);
    erwartetGleich(await liesDoc(server, id), mitRand);

    const andere = modell.node('doc', null, [absatz('Anders', 'q-anders')]);
    const konflikt = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}`,
      payload: { doc: packeDokument(andere), version: 1 },
    });
    expect(konflikt.statusCode).toBe(409);
    expect(konflikt.json()).toEqual({ error: 'This page changed. Reload it and try again.' });
    expect(versionVon(db, id)).toBe(2);
    erwartetGleich(await liesDoc(server, id), mitRand);

    const leer = await server.inject({
      method: 'POST',
      url: `/api/notes/${id}`,
      payload: { doc: packeDokument(modell.node('doc', null, [])), version: 2 },
    });
    expect(leer.statusCode).toBe(400);
    expect(leer.json()).toEqual({ error: 'Write something to save.' });
    expect(versionVon(db, id)).toBe(2);
    erwartetGleich(await liesDoc(server, id), mitRand);
  });

  it('keeps quelle on a topic page and when appending', async () => {
    const { server, db } = await paar();
    const kind = absatz('Inhalt', 'quelle-kind');
    const ziel = absatz('#Garten/Beete', '#Garten/Beete');
    const erste = await lege(server, packeDokument(modell.node('doc', null, [ziel, kind])));
    expect(erste.statusCode).toBe(201);
    expect(erste.json()).toMatchObject({ topic: 'Garten' });
    const seite = pruefeDokument(await liesDoc(server, erste.json().id as number));
    expect(seite).not.toBeNull();
    expect(enthaelt(seite!, kind)).toBe(true);

    const anhang = absatz('Anhang', 'quelle-anhang');
    const zweite = await lege(server, packeDokument(modell.node('doc', null, [ziel, anhang])));
    expect(zweite.statusCode).toBe(200);
    expect(zweite.json().id).toBe(erste.json().id);
    expect(anzahl(db)).toBe(1);
    const danach = pruefeDokument(await liesDoc(server, erste.json().id as number));
    expect(danach).not.toBeNull();
    expect(enthaelt(danach!, kind)).toBe(true);
    expect(enthaelt(danach!, anhang)).toBe(true);
  });

  it('trims empty edge lines and keeps the inner blank line and spaces', async () => {
    const { server } = await paar();
    const innenA = absatz('  Milch  ', '  Milch  ');
    const mitte = modell.nodes.leerzeile!.createChecked({ quelle: 'mitte' });
    const innenB = absatz('Brot', 'q-brot');
    const rand = modell.nodes.leerzeile!.createChecked({ quelle: 'rand' });
    const leerAbsatz = absatz('', 'leer');
    const gesendet = modell.node('doc', null, [rand, leerAbsatz, innenA, mitte, innenB, leerAbsatz, rand]);
    const erwartet = modell.node('doc', null, [innenA, mitte, innenB]);
    const erstellt = await lege(server, packeDokument(gesendet));
    expect(erstellt.statusCode).toBe(201);
    const doc = await liesDoc(server, erstellt.json().id as number);
    erwartetGleich(doc, erwartet);
    const gelesen = pruefeDokument(doc)!;
    expect(gelesen.child(1).type.name).toBe('leerzeile');
    expect(gelesen.child(1).eq(mitte)).toBe(true);
    expect(gelesen.child(0).textContent).toBe('  Milch  ');
  });

  it('rejects an invalid document even when text is sent', async () => {
    const { server, db } = await paar();
    const faelle = [
      { type: 'doc', content: [] },
      { schema_version: 1, type: 'absatz', content: [{ type: 'text', text: 'a' }] },
      { schema_version: 1, type: 'doc', content: [{ type: 'fremd' }] },
      {
        schema_version: 1,
        type: 'doc',
        content: [{ type: 'absatz', content: [{ type: 'text', text: 'a', marks: [{ type: 'link' }] }] }],
      },
      null,
    ];
    for (const doc of faelle) {
      const antwort = await lege(server, doc, { text: 'Fallback' });
      expect(antwort.statusCode).toBe(400);
      expect(antwort.json()).toEqual({ error: 'The note text is missing or invalid.' });
    }
    const leer = await lege(server, packeDokument(modell.node('doc', null, [])), { text: 'Fallback' });
    expect(leer.statusCode).toBe(400);
    expect(leer.json()).toEqual({ error: 'Write something to file.' });
    const fehlt = await server.inject({ method: 'POST', url: '/api/notes', payload: {} });
    expect(fehlt.statusCode).toBe(400);
    expect(anzahl(db)).toBe(0);
  });

  it('uses text only when no document is sent', async () => {
    const { server, db } = await paar();
    const text = await server.inject({ method: 'POST', url: '/api/notes', payload: { text: '  Buy milk  ' } });
    expect(text.statusCode).toBe(201);
    expect(text.json()).toMatchObject({ text: 'Buy milk', topic: 'Inbox', source: 'manual' });
    const knoten = modell.node('doc', null, [absatz('Alpha', 'q-alpha')]);
    const beides = await lege(server, packeDokument(knoten), { text: 'Beta' });
    expect(beides.statusCode).toBe(201);
    expect(beides.json().text).not.toBe('Beta');
    erwartetGleich(await liesDoc(server, beides.json().id as number), knoten);
    expect(anzahl(db)).toBe(2);
  });

  it('rejects a document whose text is longer than the limit', async () => {
    const { server, db } = await paar();
    const lang = modell.node('doc', null, [absatz('a'.repeat(NOTE_TEXT_MAX + 1))]);
    expect(exportiere(lang).length).toBeGreaterThan(NOTE_TEXT_MAX);
    const antwort = await lege(server, packeDokument(lang));
    expect(antwort.statusCode).toBe(400);
    expect(antwort.json()).toEqual({ error: 'The note text is missing or invalid.' });
    expect(anzahl(db)).toBe(0);
  });

  it('returns the existing note when the same client id is sent with a document', async () => {
    const { server, db } = await paar();
    const clientId = randomUUID();
    const eins = modell.node('doc', null, [absatz('Eins', 'q-eins')]);
    const zwei = modell.node('doc', null, [absatz('Zwei', 'q-zwei')]);
    const erste = await lege(server, packeDokument(eins), { clientId });
    expect(erste.statusCode).toBe(201);
    const zweite = await lege(server, packeDokument(zwei), { clientId });
    expect(zweite.statusCode).toBe(200);
    expect(zweite.json().id).toBe(erste.json().id);
    expect(anzahl(db)).toBe(1);
    erwartetGleich(await liesDoc(server, erste.json().id as number), eins);
  });
});
