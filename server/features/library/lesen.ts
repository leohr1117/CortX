import type { DatabaseSync } from 'node:sqlite';
import { baueBibliothek, type Bibliothek, type BibliothekZeile } from '../../../shared/features/library/index.ts';
import type { Notiz } from '../../../shared/kern/modell.ts';
import { alsNotiz, liesNotizenFuerThema } from '../notes/index.ts';
import { themaId } from '../topics/index.ts';

interface RohZeile {
  name: string;
  count: number;
  lastNote: string | null;
}

export function liesBibliothek(db: DatabaseSync): Bibliothek {
  const roh = db
    .prepare(
      `
      SELECT "topic".name AS name,
             COUNT("note".id) AS count,
             MAX("note".created) AS lastNote
      FROM "topic"
      LEFT JOIN "note" ON "note".topic_id = "topic".id
      GROUP BY "topic".id
      `,
    )
    .all() as unknown as RohZeile[];
  const zeilen: BibliothekZeile[] = roh.map((zeile) => ({
    name: zeile.name,
    count: Number(zeile.count),
    lastNote: zeile.lastNote,
  }));
  return baueBibliothek(zeilen);
}

export function liesThemaAnsicht(db: DatabaseSync, name: string): { topic: string; notes: Notiz[] } | null {
  const id = themaId(db, name);
  if (id === null) return null;
  const thema = db.prepare('SELECT name FROM "topic" WHERE id = ?').get(id) as { name: string } | undefined;
  if (!thema) return null;
  return { topic: thema.name, notes: liesNotizenFuerThema(db, id).map(alsNotiz) };
}
