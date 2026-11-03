import type { Thema } from '../../kern/modell.ts';
import { ersetzeTag, tagAnCaret, type TagFund } from '../tags/regeln.ts';
import { caretEbene, ersetzeSegment, vorschlaege, type SeiteKurz, type VorschlagListe } from './pfad.ts';
import { EBENEN, PFAD_TRENNER } from './register.ts';

export interface ZielAmCursor {
  tag: TagFund;
  relativ: number;
  ebene: number;
  fragment: string;
  schluessel: string;
  liste: VorschlagListe | null;
}

export function zielAmCursor(
  text: string,
  caret: number,
  themen: readonly Thema[],
  seiten: readonly SeiteKurz[] = [],
  zu: string | null = null,
): ZielAmCursor | null {
  const tag = tagAnCaret(text, caret);
  if (!tag) return null;
  const relativ = caret - tag.start - 1;
  const lage = caretEbene(tag.name, relativ);
  const schluessel = `${tag.start}:${tag.name}`;
  const liste = lage.ebene < EBENEN.length && zu !== schluessel ? vorschlaege(tag.name, themen, seiten, relativ) : null;
  return { tag, relativ, ebene: lage.ebene, fragment: lage.fragment, schluessel, liste };
}

export function setzeVorschlag(text: string, caret: number, einsetzen: string): { text: string; caret: number } | null {
  const tag = tagAnCaret(text, caret);
  if (!tag) return null;
  const relativ = caret - tag.start - 1;
  if (tag.name.includes(PFAD_TRENNER)) return ersetzeSegment(text, tag, einsetzen, relativ);
  return ersetzeTag(text, tag, einsetzen);
}
