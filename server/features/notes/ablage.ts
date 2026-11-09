import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { haengeBlock, neueSeite, pfadText, planeAblage, schluessel, seitentitel } from '../../../shared/features/seiten/index.ts';
import { NOTE_TEXT_MAX } from '../../../shared/kern/grenzen.ts';
import { TEXTE } from '../../../shared/kern/texte.ts';
import type { Notiz } from '../../../shared/kern/modell.ts';
import { AppFehler } from '../../kern/fehler.ts';
import { transaktion } from '../../kern/db.ts';
import { legeThemaAn, listeThemen, themaId } from '../topics/index.ts';
import { listeSeiten } from './katalog.ts';
import {
  alsNotiz,
  liesNotizNachClient,
  liesNotizNachId,
  liesNotizenFuerThema,
  spalteAusText,
  type NotizZeile,
} from './lesen.ts';

const UNGUELTIG = TEXTE.notizUngueltig;
const KONFLIKT = TEXTE.seiteKonflikt;
const LEER = TEXTE.leerAblegen;

export interface AblageErgebnis {
  notiz: Notiz;
  neu: boolean;
  ziel: string;
  undo: string;
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

function findeSeite(db: DatabaseSync, topicId: number, titel: string, kontoId: string): NotizZeile | null {
  const treffer = liesNotizenFuerThema(db, topicId, kontoId).filter(
    (zeile) => schluessel(seitentitel(zeile.text)) === schluessel(titel),
  );
  treffer.sort((a, b) => b.id - a.id);
  return treffer[0] ?? null;
}

function pruefeLaenge(text: string): void {
  if (text.length > NOTE_TEXT_MAX) throw new AppFehler(400, UNGUELTIG);
}

function zielText(topic: string, titel: string, abschnitt: string | null, angehaengt: boolean): string {
  if (angehaengt && abschnitt) return pfadText(titel, abschnitt);
  if (angehaengt) return titel;
  return pfadText(topic, titel);
}

class SchonDa extends Error {
  readonly zeile: NotizZeile;

  constructor(zeile: NotizZeile) {
    super('already filed');
    this.zeile = zeile;
  }
}

interface AltBild {
  doc: string;
  version: number;
}

function haenge(db: DatabaseSync, seite: NotizZeile, block: string, abschnitt: string | null, kontoId: string): NotizZeile {
  const text = haengeBlock(seite.text, block, abschnitt);
  pruefeLaenge(text);
  db.prepare(
    `INSERT INTO "note_revision" (note_id, doc, version, created, account_id) VALUES (?, ?, ?, ?, ?)`,
  ).run(seite.id, seite.docJson, seite.version, new Date().toISOString(), kontoId);
  const geschrieben = db
    .prepare('UPDATE "note" SET doc = ?, version = version + 1 WHERE id = ? AND account_id = ? AND version = ?')
    .run(spalteAusText(text), seite.id, kontoId, seite.version);
  if (Number(geschrieben.changes) !== 1) throw new AppFehler(409, KONFLIKT);
  const neu = liesNotizNachId(db, seite.id, kontoId);
  if (!neu) throw new AppFehler(500, TEXTE.nichtAblegen);
  return neu;
}

function legeNeu(
  db: DatabaseSync,
  text: string,
  topicId: number,
  source: NotizZeile['source'],
  clientId: string | null,
  kontoId: string,
): NotizZeile {
  pruefeLaenge(text);
  try {
    const info = db
      .prepare(
        `INSERT INTO "note" (doc, created, topic_id, source, ai_confidence, client_id, pinned, account_id)
         VALUES (?, ?, ?, ?, NULL, ?, 0, ?)`,
      )
      .run(spalteAusText(text), new Date().toISOString(), topicId, source, clientId, kontoId);
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
    ziel: pfadText(zeile.topic, seitentitel(zeile.text)),
    undo: '',
  };
}

export function legeAb(db: DatabaseSync, roh: string, clientId: string | null, kontoId: string): AblageErgebnis {
  return transaktion(db, () => {
    if (clientId) {
      const vorhanden = liesNotizNachClient(db, clientId, kontoId);
      if (vorhanden) return schonDa(vorhanden);
    }
    const plan = planeAblage(roh, listeThemen(db, kontoId), listeSeiten(db, kontoId));
    if (!plan) throw new AppFehler(400, TEXTE.leerDatei);
    if (plan.ungueltig) throw new AppFehler(400, plan.hinweis ?? UNGUELTIG);
    const neuIds = new Set<number>();
    const alt = new Map<number, AltBild>();
    const ziele: string[] = [];
    let letzte: NotizZeile | null = null;
    let irgendeinNeu = false;
    let clientOffen = clientId;
    try {
      for (const ziel of plan.ziele) {
        const topicId = ziel.neu ? legeThemaAn(db, ziel.topicName, kontoId) : themaId(db, ziel.topicName, kontoId);
        if (topicId === null) throw new AppFehler(500, TEXTE.nichtAblegen);
        if (ziel.seite) {
          const seite = findeSeite(db, topicId, ziel.seite, kontoId);
          if (seite) {
            if (ziel.text.trim().length === 0) {
              if (neuIds.has(seite.id)) continue;
              throw new AppFehler(400, LEER);
            }
            if (!neuIds.has(seite.id) && !alt.has(seite.id)) {
              alt.set(seite.id, { doc: seite.docJson, version: seite.version });
            }
            const neu = haenge(db, seite, ziel.text, ziel.abschnitt, kontoId);
            letzte = neu;
            ziele.push(zielText(neu.topic, seitentitel(neu.text), ziel.abschnitt, true));
            continue;
          }
        }
        const text = neueSeite(ziel.seite, ziel.abschnitt, ziel.text, ziel.topicName);
        const zeile = legeNeu(db, text, topicId, ziel.source, clientOffen, kontoId);
        clientOffen = null;
        neuIds.add(zeile.id);
        irgendeinNeu = true;
        letzte = zeile;
        ziele.push(zielText(zeile.topic, seitentitel(zeile.text), null, false));
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
      undo: merkeUndo(db, kontoId, { art: 'sammel', schritte, erfasst: roh }),
    };
  });
}
