import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Dry-run only. The source file is byte-copied and byte-hashed, never opened with sqlite.
process.env.CORTX_TEST = '1';

const wurzel = path.resolve(import.meta.dirname, '..');
const tmp = path.join(wurzel, 'tmp-test');
const daten = path.join(wurzel, 'data');

interface Zeile {
  id: number;
  laenge: number;
  hash: string;
}

interface AltZeile {
  id: number;
  text: string;
}

function melde(fehler: unknown): string {
  const text = fehler instanceof Error ? fehler.message : '';
  if (text.startsWith('Bestand ') && text.length < 500 && !text.includes('\n') && !text.includes('\r')) return text;
  return 'migration failed';
}

function ende(code: number): never {
  process.exit(code);
}

function sha(puffer: Buffer): string {
  return createHash('sha256').update(puffer).digest('hex');
}

function dateiHash(pfad: string): string | null {
  if (!fs.existsSync(pfad)) return null;
  return sha(fs.readFileSync(pfad));
}

function textHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function aufgeloest(pfad: string): string {
  try {
    return fs.realpathSync(pfad);
  } catch {
    return path.resolve(pfad);
  }
}

function darin(datei: string, basis: string): boolean {
  const links = datei.toLowerCase();
  const rechts = basis.toLowerCase();
  return links === rechts || links.startsWith(`${rechts}${path.sep}`);
}

function envDatei(name: string): string | null {
  const wert = process.env[name];
  if (wert === undefined || wert === '') return null;
  return aufgeloest(path.resolve(wurzel, wert));
}

function quelleHash(pfad: string): { db: string; wal: string | null; shm: string | null } {
  return { db: dateiHash(pfad) ?? '', wal: dateiHash(`${pfad}-wal`), shm: dateiHash(`${pfad}-shm`) };
}

function abweichung(id: number, vorher: string, nachher: string): string {
  if (vorher.length !== nachher.length) return `note ${id}: length`;
  let stelle = 0;
  while (stelle < vorher.length && vorher[stelle] === nachher[stelle]) stelle += 1;
  return `note ${id}: differs at ${stelle}`;
}

function liesAlt(pfad: string): AltZeile[] {
  const db = new DatabaseSync(pfad, { readOnly: true });
  try {
    return db.prepare('SELECT id, text FROM "note" ORDER BY id').all() as unknown as AltZeile[];
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg || process.argv.length !== 3) {
    console.error('usage: node scripts/migrationsprobe.ts <tmp-test-copy.db>');
    ende(1);
  }
  let echt: string;
  try {
    echt = fs.realpathSync(path.resolve(wurzel, arg));
  } catch {
    console.error('not a database');
    ende(1);
  }
  if (!fs.statSync(echt).isFile()) {
    console.error('not a database');
    ende(1);
  }
  if (darin(echt, aufgeloest(daten))) {
    console.error('refusing data/');
    ende(1);
  }
  if (envDatei('CORTX_DB')?.toLowerCase() === echt.toLowerCase()) {
    console.error('refusing CORTX_DB');
    ende(1);
  }
  if (envDatei('CORTEX_DB')?.toLowerCase() === echt.toLowerCase()) {
    console.error('refusing CORTEX_DB');
    ende(1);
  }
  if (!darin(echt, aufgeloest(tmp))) {
    console.error('refusing path outside tmp-test/');
    ende(1);
  }

  const vorherQuelle = quelleHash(echt);
  const stempel = new Date().toISOString().replace(/[:.]/g, '-');
  let ordner = path.join(tmp, `probe-${stempel}`);
  if (fs.existsSync(ordner)) ordner += '-2';
  fs.mkdirSync(ordner, { recursive: true });
  const kopie = path.join(ordner, path.basename(echt));
  fs.copyFileSync(echt, kopie);
  for (const extra of ['-wal', '-shm']) {
    if (fs.existsSync(`${echt}${extra}`)) fs.copyFileSync(`${echt}${extra}`, `${kopie}${extra}`);
  }

  const { schemaArt, textSumme } = await import('../server/kern/bestandsmigration.ts');
  const { oeffneDatenbank, ALTES_SCHEMA } = await import('../server/kern/db.ts');
  const { textAusSpalte } = await import('../server/features/notes/lesen.ts');
  const art = schemaArt(kopie);
  if (art === 'unbekannt') {
    console.error(ALTES_SCHEMA);
    ende(1);
  }
  if (art === 'keins') {
    let db: DatabaseSync;
    try {
      db = new DatabaseSync(kopie, { readOnly: true });
    } catch {
      console.error('not a database');
      ende(1);
    }
    db.close();
    const nachher = quelleHash(echt);
    if (nachher.db !== vorherQuelle.db || nachher.wal !== vorherQuelle.wal || nachher.shm !== vorherQuelle.shm) {
      console.error('migration failed');
      ende(1);
    }
    console.log('kein Altstand');
    ende(0);
  }

  const alt = liesAlt(kopie);
  const summeVorher = textSumme(alt.map((zeile) => zeile.text));
  let db: DatabaseSync;
  try {
    db = oeffneDatenbank(kopie);
  } catch (fehler) {
    const nachher = quelleHash(echt);
    const bericht = {
      notizen_vorher: alt.length,
      notizen_nachher: null,
      summe_vorher: summeVorher,
      summe_nachher: null,
      abweichungen: [melde(fehler)],
      fts: null,
      integrity: null,
      fk: null,
      user_version: null,
      quelle_vorher: vorherQuelle.db,
      quelle_nachher: nachher.db,
      quelle_wal_vorher: vorherQuelle.wal,
      quelle_wal_nachher: nachher.wal,
      quelle_shm_vorher: vorherQuelle.shm,
      quelle_shm_nachher: nachher.shm,
      zeilen: [],
    };
    fs.writeFileSync(path.join(ordner, 'bericht.json'), `${JSON.stringify(bericht, null, 2)}\n`);
    console.error(melde(fehler));
    ende(1);
  }

  const abweichungen: string[] = [];
  const zeilen: Zeile[] = [];
  const nachTexte: string[] = [];
  try {
    const nach = db.prepare('SELECT id, text, doc FROM "note" ORDER BY id').all() as unknown as Array<{
      id: number;
      text: string | null;
      doc: string;
    }>;
    if (nach.length !== alt.length) abweichungen.push('note count');
    for (let index = 0; index < nach.length; index += 1) {
      const zeile = nach[index]!;
      const vor = alt[index];
      let text = '';
      try {
        text = textAusSpalte(zeile.doc);
      } catch {
        abweichungen.push(`note ${zeile.id}: round-trip failed`);
        continue;
      }
      nachTexte.push(text);
      zeilen.push({ id: zeile.id, laenge: text.length, hash: textHash(text) });
      if (!vor || vor.id !== zeile.id) abweichungen.push(`note ${zeile.id}: id`);
      else if (text !== vor.text) abweichungen.push(abweichung(zeile.id, vor.text, text));
      if (vor && zeile.text !== vor.text) abweichungen.push(`note ${zeile.id}: text column`);
    }
    const summeNachher = textSumme(nachTexte);
    const fts = Number((db.prepare('SELECT COUNT(*) AS n FROM note_fts').get() as { n: number }).n);
    const fk = db.prepare('PRAGMA foreign_key_check').all();
    const integritaet = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
    const integrity = integritaet.length === 1 ? (integritaet[0]?.integrity_check ?? 'failed') : 'failed';
    const userVersion = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    if (summeNachher !== summeVorher) abweichungen.push('checksum');
    if (fts !== alt.length) abweichungen.push('fts');
    if (fk.length > 0) abweichungen.push('foreign_key_check');
    if (integrity !== 'ok') abweichungen.push('integrity_check');
    if (userVersion !== 1) abweichungen.push('user_version');
    const nachher = quelleHash(echt);
    if (nachher.db !== vorherQuelle.db || nachher.wal !== vorherQuelle.wal || nachher.shm !== vorherQuelle.shm) {
      abweichungen.push('source hash');
    }
    const bericht = {
      notizen_vorher: alt.length,
      notizen_nachher: nach.length,
      summe_vorher: summeVorher,
      summe_nachher: summeNachher,
      abweichungen,
      fts,
      integrity,
      fk,
      user_version: userVersion,
      quelle_vorher: vorherQuelle.db,
      quelle_nachher: nachher.db,
      quelle_wal_vorher: vorherQuelle.wal,
      quelle_wal_nachher: nachher.wal,
      quelle_shm_vorher: vorherQuelle.shm,
      quelle_shm_nachher: nachher.shm,
      zeilen,
    };
    fs.writeFileSync(path.join(ordner, 'bericht.json'), `${JSON.stringify(bericht, null, 2)}\n`);
    if (abweichungen.length > 0) ende(1);
  } finally {
    try {
      db.close();
    } catch {
      // Already closed when the report forced an exit.
    }
  }
}

main().catch((fehler: unknown) => {
  console.error(melde(fehler));
  ende(1);
});
