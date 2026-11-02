import type { DatabaseSync } from 'node:sqlite';
import { istVersionsnummer, type VersionsAntwort } from '../../../shared/features/version/index.ts';

interface Zeile {
  notified: string | null;
  seen: string | null;
}

function gueltig(wert: string | null): string | null {
  return wert !== null && istVersionsnummer(wert) ? wert : null;
}

export function liesStand(db: DatabaseSync, accountId: string): VersionsAntwort {
  const zeile = db
    .prepare('SELECT notified, seen FROM "version_hint" WHERE account_id = ?')
    .get(accountId) as Zeile | undefined;
  if (!zeile) return { notified: null, seen: null, fresh: true };
  return { notified: gueltig(zeile.notified), seen: gueltig(zeile.seen), fresh: false };
}

export function merkeStand(
  db: DatabaseSync,
  accountId: string,
  teil: { notified?: string; seen?: string },
): VersionsAntwort {
  db.prepare(
    `INSERT INTO "version_hint" (account_id, notified, seen) VALUES (?, ?, ?)
     ON CONFLICT (account_id) DO UPDATE SET
       notified = COALESCE(excluded.notified, version_hint.notified),
       seen = COALESCE(excluded.seen, version_hint.seen)`,
  ).run(accountId, teil.notified ?? null, teil.seen ?? null);
  return liesStand(db, accountId);
}
