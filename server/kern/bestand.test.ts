import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { ersteZeile, zaehleAbschnitte } from '../../shared/features/seiten/text.ts';
import { SPEICHER } from '../../shared/kern/grenzen.ts';
import { migriere } from './db.ts';
import { MIGRATIONEN, migrationsSql } from './migrationen.ts';
import { textSumme, wandleSeiten } from './seitenmigration.ts';

function schemaSieben(): DatabaseSync {
  const db = new DatabaseSync(SPEICHER);
  db.exec('PRAGMA foreign_keys = OFF');
  for (let index = 0; index < 7; index += 1) db.exec(migrationsSql(index));
  db.exec('PRAGMA user_version = 7');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function lege(db: DatabaseSync, text: string): void {
  const inbox = db.prepare(`SELECT id FROM "topic" WHERE name_key = 'inbox'`).get() as { id: number };
  db.prepare('UPDATE "topic" SET account_id = ? WHERE id = ?').run('ada', inbox.id);
  db.prepare(
    `INSERT INTO "note" (text, created, topic_id, source, ai_confidence, pinned, account_id)
     VALUES (?, ?, ?, 'manual', NULL, 0, ?)`,
  ).run(text, '2026-10-01T00:00:00.000Z', inbox.id, 'ada');
}

describe('page migration', () => {
  const offen: DatabaseSync[] = [];

  afterEach(() => {
    for (const db of offen) db.close();
    offen.length = 0;
  });

  it('adds a title once, keeps the original as a revision, and rolls back a bad checksum', () => {
    const db = schemaSieben();
    offen.push(db);
    lege(db, 'plain line');
    lege(db, '# Already titled');
    lege(db, 'Body\n\n## Analysis\n\ntext');
    migriere(db);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONEN.length);
    expect(db.prepare('SELECT text FROM "note" ORDER BY id').all()).toEqual([
      { text: '# plain line' },
      { text: '# Already titled' },
      { text: '# Body\n\n## Analysis\n\ntext' },
    ]);
    expect(db.prepare('SELECT text FROM "note_revision" ORDER BY id').all()).toEqual([
      { text: 'plain line' },
      { text: 'Body\n\n## Analysis\n\ntext' },
    ]);
    expect(zaehleAbschnitte('# Body\n\n## Analysis\n\ntext')).toBe(1);
    const vorher = Number((db.prepare('SELECT COUNT(*) AS n FROM "note_revision"').get() as { n: number }).n);
    const nochmal = wandleSeiten(db);
    expect(nochmal.titel).toBe(0);
    expect(Number((db.prepare('SELECT COUNT(*) AS n FROM "note_revision"').get() as { n: number }).n)).toBe(vorher);

    const probe = schemaSieben();
    offen.push(probe);
    lege(probe, 'plain');
    probe.exec('BEGIN');
    expect(() =>
      wandleSeiten(probe, (datenbank) => {
        datenbank.prepare('UPDATE "note" SET text = ?').run('tampered');
      }),
    ).toThrow(/checksum/);
    probe.exec('ROLLBACK');
    expect(probe.prepare('SELECT text FROM "note"').get()).toEqual({ text: 'plain' });
    expect(probe.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'note_revision'`).get()).toBeUndefined();
  });

  const quelle = path.resolve('tmp-test/bestand/kopie.db');

  it.skipIf(!fs.existsSync(quelle))('migrates a copy of the stored notes twice without changing the source file', () => {
    const ziel = path.resolve('tmp-test/bestand/probe.db');
    expect(fs.existsSync(quelle), 'stored copy').toBe(true);
    const vorStat = fs.statSync(quelle);
    for (const extra of ['-wal', '-shm']) {
      const neben = `${ziel}${extra}`;
      if (fs.existsSync(neben)) fs.rmSync(neben);
    }
    fs.copyFileSync(quelle, ziel);
    const db = new DatabaseSync(ziel);
    offen.push(db);
    const roh = db.prepare('SELECT text FROM "note" ORDER BY id').all() as Array<{ text: string }>;
    const vorher = roh.length;
    const summe = textSumme(roh.map((zeile) => zeile.text));
    migriere(db);
    migriere(db);
    const nach = db.prepare('SELECT text FROM "note" ORDER BY id').all() as Array<{ text: string }>;
    const vergleich = nach.map((zeile, index) => {
      const alt = roh[index]?.text ?? '';
      if (!ersteZeile(alt).startsWith('# ') && zeile.text === `# ${alt}`) return alt;
      return zeile.text;
    });
    const summeGleich = textSumme(vergleich) === summe && nach.length === vorher;
    const titel = Number((db.prepare('SELECT COUNT(*) AS n FROM "note_revision"').get() as { n: number }).n);
    let abschnitte = 0;
    for (const zeile of nach) abschnitte += zaehleAbschnitte(zeile.text);
    const texte = textSumme(nach.map((zeile) => zeile.text));
    wandleSeiten(db);
    const danach = db.prepare('SELECT text FROM "note" ORDER BY id').all() as Array<{ text: string }>;
    const idempotent =
      Number((db.prepare('SELECT COUNT(*) AS n FROM "note_revision"').get() as { n: number }).n) === titel &&
      textSumme(danach.map((zeile) => zeile.text)) === texte;
    const zahlen = { vorher, nachher: nach.length, summeGleich, titel, abschnitte, idempotent };
    fs.writeFileSync(path.resolve('tmp-test/bestand/probe-zahlen.json'), `${JSON.stringify(zahlen)}\n`);
    expect(summeGleich).toBe(true);
    expect(idempotent).toBe(true);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONEN.length);
    const nachStat = fs.statSync(quelle);
    expect(nachStat.size).toBe(vorStat.size);
    expect(nachStat.mtimeMs).toBe(vorStat.mtimeMs);
  });
});
