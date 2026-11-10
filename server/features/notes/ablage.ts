import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Node } from 'prosemirror-model';
import { DOKUMENT_SCHEMA_VERSION, pruefeDokument } from '../../../shared/features/format/dokument.ts';
import { exportiere, importiere } from '../../../shared/features/format/md.ts';
import {
  haengeKnoten,
  istLeer,
  neueSeiteKnoten,
  pfadText,
  planeAblage,
  schluessel,
  teileDokument,
  titelAusKnoten,
  type SeiteKurz,
  type ZielTeil,
} from '../../../shared/features/seiten/index.ts';
import { mitHakenKurz, ohneRandzeilen } from '../../../shared/features/seiten/knoten.ts';
import { INBOX_NAME, NOTE_TEXT_MAX } from '../../../shared/kern/grenzen.ts';
import { TEXTE } from '../../../shared/kern/texte.ts';
import type { Notiz, Thema } from '../../../shared/kern/modell.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { transaktion } from '../../kern/db.ts';
import { legeThemaAn, listeThemen, themaId } from '../topics/index.ts';
import { listeSeiten } from './katalog.ts';
import { alsNotiz, liesNotizNachClient, liesNotizNachId, liesNotizenFuerThema, type NotizZeile } from './lesen.ts';

const UNGUELTIG = TEXTE.notizUngueltig;
const KONFLIKT = TEXTE.seiteKonflikt;
const LEER = TEXTE.leerAblegen;

export interface AblageErgebnis {
  notiz: Notiz;
  neu: boolean;
  ziel: string;
  undo: string;
}

interface ZielLosung {
  topicName: string;
  source: 'tag' | 'manual';
  neu: boolean;
  seite: string | null;
  abschnitt: string | null;
}

interface AltBild {
  doc: string;
  version: number;
}

function merkeUndo(db: DatabaseSync, kontoId: string, payload: unknown): string {
  const token = randomUUID();
  db.prepare('DELETE FROM "note_undo" WHERE account_id = ?').run(kontoId);
  db.prepare('INSERT INTO "note_undo" (token, payload, created, account_id) VALUES (?, ?, ?, ?)').run(
    token,
    JSON.stringify(payload),
    new Date().toISOString(),
    kontoId,
  );
  return token;
}

export function jsonVon(doc: Node): string {
  const wert = { ...(doc.toJSON() as Record<string, unknown>), schema_version: DOKUMENT_SCHEMA_VERSION };
  if (!pruefeDokument(wert)) throw new AppFehler(500, TEXTE.nichtAblegen);
  return JSON.stringify(wert);
}

function docVon(zeile: NotizZeile): Node {
  const doc = pruefeDokument(zeile.doc);
  if (!doc) throw new AppFehler(500, TEXTE.nichtAblegen);
  return doc;
}

function titel(zeile: NotizZeile): string {
  return titelAusKnoten(docVon(zeile));
}

function findeSeite(db: DatabaseSync, topicId: number, name: string, kontoId: string): NotizZeile | null {
  const treffer = liesNotizenFuerThema(db, topicId, kontoId).filter((zeile) => schluessel(titel(zeile)) === schluessel(name));
  treffer.sort((a, b) => b.id - a.id);
  return treffer[0] ?? null;
}

function pruefeLaenge(doc: Node): void {
  if (exportiere(doc).length > NOTE_TEXT_MAX) throw new AppFehler(400, UNGUELTIG);
}

function zielText(topic: string, name: string, abschnitt: string | null, angehaengt: boolean): string {
  if (angehaengt && abschnitt) return pfadText(name, abschnitt);
  if (angehaengt) return name;
  return pfadText(topic, name);
}

class SchonDa extends Error {
  readonly zeile: NotizZeile;

  constructor(zeile: NotizZeile) {
    super('already filed');
    this.zeile = zeile;
  }
}

function haenge(
  db: DatabaseSync,
  seite: NotizZeile,
  block: Node,
  abschnitt: string | null,
  kontoId: string,
  behalteQuelle: boolean,
): NotizZeile {
  const doc = haengeKnoten(docVon(seite), block, abschnitt, behalteQuelle);
  pruefeLaenge(doc);
  db.prepare(
    `INSERT INTO "note_revision" (note_id, doc, version, created, account_id) VALUES (?, ?, ?, ?, ?)`,
  ).run(seite.id, seite.docJson, seite.version, new Date().toISOString(), kontoId);
  const geschrieben = db
    .prepare('UPDATE "note" SET doc = ?, version = version + 1 WHERE id = ? AND account_id = ? AND version = ?')
    .run(jsonVon(doc), seite.id, kontoId, seite.version);
  if (Number(geschrieben.changes) !== 1) throw new AppFehler(409, KONFLIKT);
  const neu = liesNotizNachId(db, seite.id, kontoId);
  if (!neu) throw new AppFehler(500, TEXTE.nichtAblegen);
  return neu;
}

function legeNeu(
  db: DatabaseSync,
  doc: Node,
  topicId: number,
  source: NotizZeile['source'],
  clientId: string | null,
  kontoId: string,
): NotizZeile {
  pruefeLaenge(doc);
  try {
    const info = db
      .prepare(
        `INSERT INTO "note" (doc, created, topic_id, source, ai_confidence, client_id, pinned, account_id)
         VALUES (?, ?, ?, ?, NULL, ?, 0, ?)`,
      )
      .run(jsonVon(doc), new Date().toISOString(), topicId, source, clientId, kontoId);
    const zeile = liesNotizNachId(db, Number(info.lastInsertRowid), kontoId);
    if (!zeile) throw new AppFehler(500, TEXTE.nichtAblegen);
    return zeile;
  } catch (fehler) {
    if (clientId && fehler instanceof Error && fehler.message.includes('UNIQUE')) {
      const vorhanden = liesNotizNachClient(db, clientId, kontoId);
      if (vorhanden) throw new SchonDa(vorhanden);
    }
    throw fehler;
  }
}

function schonDa(zeile: NotizZeile): AblageErgebnis {
  return {
    notiz: alsNotiz(zeile),
    neu: false,
    ziel: pfadText(zeile.topic, titel(zeile)),
    undo: '',
  };
}

function loese(teil: ZielTeil, themen: readonly Thema[], seiten: readonly SeiteKurz[]): ZielLosung {
  if (teil.pfad === null) {
    return { topicName: INBOX_NAME, source: 'manual', neu: false, seite: null, abschnitt: null };
  }
  const plan = planeAblage(`#${teil.pfad}`, themen, seiten);
  if (!plan) throw new AppFehler(400, TEXTE.leerDatei);
  if (plan.ungueltig) throw new AppFehler(400, plan.hinweis ?? UNGUELTIG);
  const ziel = plan.ziele[0];
  if (!ziel) throw new AppFehler(400, UNGUELTIG);
  return {
    topicName: ziel.topicName,
    source: ziel.source,
    neu: ziel.neu,
    seite: ziel.seite,
    abschnitt: ziel.abschnitt,
  };
}

function koerper(teil: ZielTeil, roh: string | null, ganz: Node): Node {
  if (roh !== null) {
    if (teil.pfad === null && teil.doc === ganz) {
      const text = roh.trim();
      return text === roh ? ganz : importiere(text);
    }
    const exportText = exportiere(teil.doc);
    const text = exportText.trim();
    if (text === exportText) return teil.doc;
    return importiere(text);
  }
  return ohneRandzeilen(teil.doc);
}

export function legeAb(db: DatabaseSync, eingabe: string | Node, clientId: string | null, kontoId: string): AblageErgebnis {
  return transaktion(db, () => {
    if (clientId) {
      const vorhanden = liesNotizNachClient(db, clientId, kontoId);
      if (vorhanden) return schonDa(vorhanden);
    }
    const alsText = typeof eingabe === 'string';
    const ganz = alsText ? importiere(eingabe) : mitHakenKurz(eingabe);
    const teile = teileDokument(ganz);
    const leer = alsText ? eingabe.trim().length === 0 : istLeer(ganz);
    if (teile.every((teil) => teil.pfad === null) && leer) throw new AppFehler(400, TEXTE.leerDatei);
    const themen = listeThemen(db, kontoId);
    const seitenStand = listeSeiten(db, kontoId);
    const paare = teile.map((teil) => ({
      los: loese(teil, themen, seitenStand),
      body: koerper(teil, alsText ? eingabe : null, ganz),
    }));
    const neuIds = new Set<number>();
    const alt = new Map<number, AltBild>();
    const ziele: string[] = [];
    let letzte: NotizZeile | null = null;
    let irgendeinNeu = false;
    let clientOffen = clientId;
    try {
      for (const { los, body } of paare) {
        const topicId = los.neu ? legeThemaAn(db, los.topicName, kontoId) : themaId(db, los.topicName, kontoId);
        if (topicId === null) throw new AppFehler(500, TEXTE.nichtAblegen);
        if (los.seite) {
          const seite = findeSeite(db, topicId, los.seite, kontoId);
          if (seite) {
            if (istLeer(body)) {
              if (neuIds.has(seite.id)) continue;
              throw new AppFehler(400, LEER);
            }
            if (!neuIds.has(seite.id) && !alt.has(seite.id)) {
              alt.set(seite.id, { doc: seite.docJson, version: seite.version });
            }
            const neu = haenge(db, seite, body, los.abschnitt, kontoId, !alsText);
            letzte = neu;
            ziele.push(zielText(neu.topic, titel(neu), los.abschnitt, true));
            continue;
          }
        }
        const doc = neueSeiteKnoten(los.seite, los.abschnitt, body, los.topicName, !alsText);
        const zeile = legeNeu(db, doc, topicId, los.source, clientOffen, kontoId);
        clientOffen = null;
        neuIds.add(zeile.id);
        irgendeinNeu = true;
        letzte = zeile;
        ziele.push(zielText(zeile.topic, titel(zeile), null, false));
      }
    } catch (fehler) {
      if (fehler instanceof SchonDa) return schonDa(fehler.zeile);
      throw fehler;
    }
    if (!letzte) throw new AppFehler(500, TEXTE.nichtAblegen);
    const schritte: Array<{ art: 'anhaengen' | 'anlegen'; id: number; doc: string; version: number; nachher?: number }> = [];
    for (const [id, bild] of alt) {
      const zeile = liesNotizNachId(db, id, kontoId);
      if (!zeile) throw new AppFehler(500, TEXTE.nichtAblegen);
      schritte.push({ art: 'anhaengen', id, doc: bild.doc, version: bild.version, nachher: zeile.version });
    }
    for (const id of neuIds) {
      const zeile = liesNotizNachId(db, id, kontoId);
      if (!zeile) throw new AppFehler(500, TEXTE.nichtAblegen);
      schritte.push({ art: 'anlegen', id, doc: zeile.docJson, version: zeile.version });
    }
    return {
      notiz: alsNotiz(letzte),
      neu: irgendeinNeu,
      ziel: ziele.join(TEXTE.punktMitte),
      undo: merkeUndo(db, kontoId, { art: 'sammel', schritte, erfasst: alsText ? eingabe : exportiere(ganz) }),
    };
  });
}
