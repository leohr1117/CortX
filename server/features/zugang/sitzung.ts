import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  FEHLER_FENSTER_MS,
  FEHLER_GLOBAL,
  FEHLER_JE_IP,
  SITZUNG_MS,
  STRIDE_PRUEF_MS,
  deuteAnmeldung,
  deuteNachpruefung,
  limitGrund,
} from '../../../shared/features/zugang/index.ts';
import { transaktion } from '../../kern/db.ts';
import type { StridePruefer, StrideRoh } from './stride.ts';

export type ZugangErgebnis =
  | { art: 'ok'; token: string }
  | { art: 'eingabe' }
  | { art: 'abgelehnt' }
  | { art: 'limit' }
  | { art: 'nicht_erreichbar' }
  | { art: 'unbekannt' };

interface SitzungZeile {
  account_id: string;
  expires: string;
  stride_checked: string;
  stride_material: string | null;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function neuesToken(): string {
  return randomBytes(32).toString('base64url');
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function raeume(db: DatabaseSync, jetzt: number): void {
  db.prepare('DELETE FROM "signin_failure" WHERE at <= ?').run(iso(jetzt - FEHLER_FENSTER_MS));
  db.prepare('DELETE FROM "session" WHERE expires <= ?').run(iso(jetzt));
}

function versuche(db: DatabaseSync): { ip: string; at: number }[] {
  const roh = db.prepare('SELECT ip, at FROM "signin_failure"').all() as Array<{ ip: string; at: string }>;
  return roh
    .map((zeile) => ({ ip: zeile.ip, at: Date.parse(zeile.at) }))
    .filter((zeile) => Number.isFinite(zeile.at));
}

function begrenzt(db: DatabaseSync, ip: string, jetzt: number): boolean {
  return limitGrund(versuche(db), ip, jetzt, FEHLER_FENSTER_MS, FEHLER_JE_IP, FEHLER_GLOBAL) !== null;
}

export function ordneKontoZu(db: DatabaseSync, kontoId: string, jetztIso: string): void {
  const claim = db.prepare('SELECT account_id FROM "account_claim" WHERE id = 1').get() as
    | { account_id: string }
    | undefined;
  if (!claim) {
    db.prepare('UPDATE "topic" SET account_id = ? WHERE account_id IS NULL').run(kontoId);
    db.prepare('UPDATE "note" SET account_id = ? WHERE account_id IS NULL').run(kontoId);
    db.prepare('UPDATE "topic_undo" SET account_id = ? WHERE account_id IS NULL').run(kontoId);
    db.prepare('UPDATE "note_undo" SET account_id = ? WHERE account_id IS NULL').run(kontoId);
    db.prepare('INSERT INTO "account_claim" (id, account_id, claimed) VALUES (1, ?, ?)').run(kontoId, jetztIso);
  }
  const inbox = db.prepare(`SELECT id FROM "topic" WHERE account_id = ? AND name_key = 'inbox'`).get(kontoId) as
    | { id: number }
    | undefined;
  if (!inbox) {
    db.prepare('INSERT INTO "topic" (name, name_key, created, account_id) VALUES (?, ?, ?, ?)').run(
      'Inbox',
      'inbox',
      jetztIso,
      kontoId,
    );
  }
}

function merkeFehler(db: DatabaseSync, ip: string, jetzt: number): void {
  db.prepare('INSERT INTO "signin_failure" (ip, at) VALUES (?, ?)').run(ip, iso(jetzt));
}

export async function meldeAn(
  db: DatabaseSync,
  name: string,
  passwort: string,
  clientIp: string,
  stride: StridePruefer,
  jetzt: number,
): Promise<ZugangErgebnis> {
  const blockiert = transaktion(db, () => {
    raeume(db, jetzt);
    return begrenzt(db, clientIp, jetzt);
  });
  if (blockiert) return { art: 'limit' };
  let roh: StrideRoh;
  try {
    roh = await stride({ art: 'anmelden', name, passwort, material: null, clientIp });
  } catch {
    return { art: 'nicht_erreichbar' };
  }
  const deutung = deuteAnmeldung(roh.status, roh.body, roh.setCookie);
  return transaktion(db, () => {
    raeume(db, jetzt);
    if (deutung.art !== 'ok') {
      if (deutung.art === 'eingabe' || deutung.art === 'limit' || deutung.art === 'nicht_erreichbar') {
        return { art: deutung.art };
      }
      if (begrenzt(db, clientIp, jetzt)) return { art: 'limit' as const };
      merkeFehler(db, clientIp, jetzt);
      return { art: deutung.art };
    }
    if (begrenzt(db, clientIp, jetzt)) return { art: 'limit' as const };
    db.prepare('DELETE FROM "signin_failure" WHERE ip = ?').run(clientIp);
    const stempel = iso(jetzt);
    ordneKontoZu(db, deutung.kontoId, stempel);
    const token = neuesToken();
    db.prepare(
      `INSERT INTO "session" (token_hash, account_id, created, expires, stride_checked, stride_material)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(tokenHash(token), deutung.kontoId, stempel, iso(jetzt + SITZUNG_MS), stempel, deutung.material);
    return { art: 'ok' as const, token };
  });
}

export async function liesGueltigeSitzung(
  db: DatabaseSync,
  token: string,
  clientIp: string,
  stride: StridePruefer,
  jetzt: number,
): Promise<{ accountId: string } | null> {
  const hash = tokenHash(token);
  const zeile = db
    .prepare(
      `SELECT account_id, expires, stride_checked, stride_material
       FROM "session" WHERE token_hash = ?`,
    )
    .get(hash) as SitzungZeile | undefined;
  if (!zeile) return null;
  if (Date.parse(zeile.expires) <= jetzt) {
    db.prepare('DELETE FROM "session" WHERE token_hash = ?').run(hash);
    return null;
  }
  const faellig = jetzt - Date.parse(zeile.stride_checked) >= STRIDE_PRUEF_MS;
  if (!faellig) return { accountId: zeile.account_id };
  let behalten = true;
  if (zeile.stride_material) {
    try {
      const roh = await stride({
        art: 'nachpruefen',
        name: '',
        passwort: '',
        material: zeile.stride_material,
        clientIp,
      });
      const deutung = deuteNachpruefung(roh.status, roh.body);
      if (deutung.art === 'abgelehnt') behalten = false;
      if (deutung.art === 'ok' && deutung.kontoId && deutung.kontoId !== zeile.account_id) behalten = false;
    } catch {
      behalten = true;
    }
  }
  if (!behalten) {
    db.prepare('DELETE FROM "session" WHERE token_hash = ?').run(hash);
    return null;
  }
  db.prepare('UPDATE "session" SET stride_checked = ? WHERE token_hash = ?').run(iso(jetzt), hash);
  return { accountId: zeile.account_id };
}

export function loescheSitzung(db: DatabaseSync, token: string): void {
  db.prepare('DELETE FROM "session" WHERE token_hash = ?').run(tokenHash(token));
}
