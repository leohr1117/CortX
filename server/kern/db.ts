import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pruefeDokument } from '../../shared/features/format/dokument.ts';
import { klartext } from '../../shared/features/format/klartext.ts';
import { SPEICHER } from '../../shared/kern/grenzen.ts';
import { schemaArt, wandleAltstand } from './bestandsmigration.ts';
import { MIGRATIONEN } from './migrationen.ts';
import { istTestlauf, verweigereEchteDatenbank } from './testpfad.ts';

export const ALTES_SCHEMA =
  'This database uses an unknown old note schema. CortX does not migrate existing notes, and the file was not modified.';

function schemaVersion(db: DatabaseSync): number {
  const zeile = db.prepare('PRAGMA user_version').get() as { user_version: number };
  return zeile.user_version;
}

export function migriere(db: DatabaseSync): void {
  const start = schemaVersion(db);
  if (start >= MIGRATIONEN.length) return;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (let index = start; index < MIGRATIONEN.length; index += 1) {
      const version = index + 1;
      const schritt = MIGRATIONEN[index];
      if (schritt === undefined) continue;
      db.exec('BEGIN');
      try {
        if (typeof schritt === 'string') db.exec(schritt);
        else schritt(db);
        db.exec(`PRAGMA user_version = ${version}`);
        db.exec('COMMIT');
      } catch (fehler) {
        db.exec('ROLLBACK');
        const grund = fehler instanceof Error ? fehler.message : 'unknown';
        throw new Error(`Migration ${version} failed: ${grund}`, { cause: fehler });
      }
    }
    const verstoesse = db.prepare('PRAGMA foreign_key_check').all();
    if (verstoesse.length > 0) throw new Error('Foreign key check failed after migration.');
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

export function registriereSuchtext(db: DatabaseSync): void {
  db.function('cortx_suchtext', { deterministic: true, directOnly: false }, (doc) => {
    if (typeof doc !== 'string') throw new Error('Note doc must be text.');
    let wert: unknown;
    try {
      wert = JSON.parse(doc);
    } catch (fehler) {
      throw new Error('Note doc is not JSON.', { cause: fehler });
    }
    const knoten = pruefeDokument(wert);
    if (!knoten) throw new Error('Note doc is not a document.');
    return klartext(knoten);
  });
}

function istGesperrt(fehler: unknown): boolean {
  const text = fehler instanceof Error ? fehler.message : '';
  if (text === 'database is locked' || text === 'database table is locked') return true;
  if (typeof fehler === 'object' && fehler !== null && 'errcode' in fehler) {
    const code = (fehler as { errcode: unknown }).errcode;
    if (typeof code === 'number') return (code & 0xff) === 5 || (code & 0xff) === 6;
  }
  return false;
}

// TRUNCATE fails with SQLITE_LOCKED while this connection still has a statement. Startup continues.
export function checkpointBeimOeffnen(db: DatabaseSync): void {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    return;
  } catch (fehler) {
    if (!istGesperrt(fehler)) throw fehler;
  }
  try {
    db.exec('PRAGMA wal_checkpoint(PASSIVE)');
  } catch (fehler) {
    if (!istGesperrt(fehler)) throw fehler;
    console.log('wal checkpoint skipped: locked');
  }
}

export function oeffneDatenbank(pfad: string): DatabaseSync {
  const ziel = istTestlauf() ? verweigereEchteDatenbank(pfad) : pfad === SPEICHER ? pfad : path.resolve(pfad);
  // Read the file before mkdir, WAL, or migriere. A rejected database must stay byte-identical.
  const art = ziel !== SPEICHER && fs.existsSync(ziel) ? schemaArt(ziel) : 'keins';
  if (art === 'unbekannt') throw new Error(ALTES_SCHEMA);
  if (ziel !== SPEICHER) fs.mkdirSync(path.dirname(ziel), { recursive: true });
  const db = new DatabaseSync(ziel);
  registriereSuchtext(db);
  db.exec('PRAGMA foreign_keys = ON');
  if (art === 'alt1143') {
    try {
      const bericht = wandleAltstand(db);
      const kurz = bericht.summe.slice(0, 12);
      console.log(
        `bestand 1.14.3 -> doc: ${bericht.notizen} notes, ${bericht.revisionen} revisions, ${bericht.undo} undo, checksum ${kurz} ok`,
      );
      // WAL only after COMMIT, so a rollback leaves the file byte-identical.
      if (ziel !== SPEICHER) {
        db.exec('PRAGMA journal_mode = WAL');
        checkpointBeimOeffnen(db);
      }
    } catch (fehler) {
      db.close();
      throw fehler;
    }
  } else if (ziel !== SPEICHER) {
    db.exec('PRAGMA journal_mode = WAL');
  }
  migriere(db);
  return db;
}

export function transaktion<T>(db: DatabaseSync, arbeit: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const wert = arbeit();
    db.exec('COMMIT');
    return wert;
  } catch (fehler) {
    db.exec('ROLLBACK');
    throw fehler;
  }
}
