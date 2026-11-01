import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SPEICHER } from '../../shared/kern/grenzen.ts';
import { MIGRATIONEN } from './migrationen.ts';
import { istTestlauf, verweigereEchteDatenbank } from './testpfad.ts';

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
      const sql = MIGRATIONEN[index];
      if (sql === undefined) continue;
      db.exec('BEGIN');
      try {
        db.exec(sql);
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

export function oeffneDatenbank(pfad: string): DatabaseSync {
  const ziel = istTestlauf() ? verweigereEchteDatenbank(pfad) : pfad === SPEICHER ? pfad : path.resolve(pfad);
  if (ziel !== SPEICHER) {
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
  }
  const db = new DatabaseSync(ziel);
  db.exec('PRAGMA foreign_keys = ON');
  if (ziel !== SPEICHER) {
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
