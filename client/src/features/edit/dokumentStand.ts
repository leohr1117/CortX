import type { Node } from 'prosemirror-model';
import { packeDokument, pruefeDokument } from '../../../../shared/features/format/dokument.ts';
import { exportiere, importiere } from '../../../../shared/features/format/md.ts';
import type { Notiz } from '../../../../shared/kern/modell.ts';

export interface DokumentStand {
  text: string;
  doc: unknown;
  knoten: Node;
}

export function standAusText(text: string): DokumentStand {
  const knoten = importiere(text);
  return { text, doc: packeDokument(knoten), knoten };
}

export const LEERER_STAND = standAusText('');

export function standAusAntwort(notiz: Notiz): DokumentStand {
  const knoten = pruefeDokument(notiz.doc) ?? importiere(notiz.text);
  return { text: notiz.text, doc: packeDokument(knoten), knoten };
}

export function standAusPack(pack: unknown, text: string): DokumentStand | null {
  const knoten = pruefeDokument(pack);
  if (!knoten) return null;
  return { text, doc: pack, knoten };
}

export function standAusEntwurf(roh: unknown, basis: DokumentStand): { stand: DokumentStand; leeren: boolean } {
  if (typeof roh === 'string') {
    if (roh.length === 0) return { stand: basis, leeren: false };
    if (roh.trim().length === 0) return { stand: basis, leeren: true };
    return { stand: standAusText(roh), leeren: false };
  }
  const knoten = pruefeDokument(roh);
  if (!knoten) return { stand: basis, leeren: false };
  const text = exportiere(knoten);
  if (text.trim().length === 0) return { stand: basis, leeren: true };
  return { stand: { text, doc: roh, knoten }, leeren: false };
}

export function gleicherStand(aktuell: DokumentStand, basis: DokumentStand): boolean {
  return aktuell.knoten.eq(basis.knoten);
}

export function entwurfZumSpeichern(aktuell: DokumentStand, basis: DokumentStand): unknown {
  if (aktuell.text.trim().length === 0 || gleicherStand(aktuell, basis)) return '';
  return aktuell.doc;
}

export function standNachKonflikt(notiz: Notiz): DokumentStand {
  return standAusAntwort(notiz);
}
