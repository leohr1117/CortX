import type { Thema } from '../../kern/modell.ts';
import { hashIstAnfang, istNamenszeichen, liesPfadName, PFAD_PRAEFIX } from '../seiten/register.ts';
import { schluessel } from '../seiten/text.ts';

export interface TagFund {
  name: string;
  start: number;
  end: number;
}

export function findeTags(text: string): TagFund[] {
  const funde: TagFund[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (!hashIstAnfang(text, index)) continue;
    const name = liesPfadName(text.slice(index + PFAD_PRAEFIX.length));
    if (!name) continue;
    funde.push({ name, start: index, end: index + PFAD_PRAEFIX.length + name.length });
    index += name.length;
  }
  return funde;
}

export function tagAnCaret(text: string, caret: number): TagFund | null {
  const stelle = Math.max(0, Math.min(caret, text.length));
  for (const tag of findeTags(text)) {
    if (stelle > tag.start && stelle <= tag.end) return tag;
  }
  const hash = stelle - 1;
  if (hash >= 0 && text[hash] === PFAD_PRAEFIX && hashIstAnfang(text, hash)) {
    const danach = text[stelle];
    if (danach === undefined || !istNamenszeichen(danach)) {
      return { name: '', start: hash, end: stelle };
    }
  }
  return null;
}

export function ersetzeTag(text: string, tag: TagFund, name: string): { text: string; caret: number } {
  return {
    text: `${text.slice(0, tag.start)}#${name}${text.slice(tag.end)}`,
    caret: tag.start + 1 + name.length,
  };
}

export function gleicherName(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

export function sortiereThemen(themen: Thema[]): Thema[] {
  return [...themen].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function passendeThemen(fragment: string, themen: Thema[]): Thema[] {
  const nadel = schluessel(fragment);
  const liste =
    fragment.length === 0 ? themen : themen.filter((thema) => schluessel(thema.name).startsWith(nadel));
  return sortiereThemen(liste);
}

export function loeseThema(fragment: string, themen: Thema[]): { name: string; neu: boolean } | null {
  if (fragment.length === 0) return null;
  const exakt = sortiereThemen(themen.filter((thema) => schluessel(thema.name) === schluessel(fragment)))[0];
  if (exakt) return { name: exakt.name, neu: false };
  const erste = passendeThemen(fragment, themen)[0];
  if (erste) return { name: erste.name, neu: false };
  return { name: fragment, neu: true };
}
