import { TOPIC_NAME_MAX } from '../../kern/grenzen.ts';
import type { Thema } from '../../kern/modell.ts';
import { schluessel } from '../seiten/text.ts';

export interface TagFund {
  name: string;
  start: number;
  end: number;
}

const NAME = /^[\p{L}\p{N}][\p{L}\p{N}_'-]*/u;
const NAMENSZEICHEN = /[\p{L}\p{N}_'-]/u;

function hashIstAnfang(text: string, index: number): boolean {
  if (text[index] !== '#') return false;
  if (index === 0) return true;
  const davor = text[index - 1] ?? '';
  return !NAMENSZEICHEN.test(davor);
}

function liesPfad(rest: string): string | null {
  const erstes = rest.match(NAME)?.[0];
  if (!erstes) return null;
  let name = erstes.slice(0, TOPIC_NAME_MAX);
  let pos = name.length;
  if (erstes.length > name.length) return name;
  while (rest[pos] === '/') {
    name += '/';
    pos += 1;
    if (rest[pos] === '/') continue;
    const weiter = rest.slice(pos).match(NAME)?.[0];
    if (!weiter) break;
    const capped = weiter.slice(0, TOPIC_NAME_MAX);
    name += capped;
    pos += capped.length;
    if (weiter.length > capped.length) break;
  }
  return name;
}

export function findeTags(text: string): TagFund[] {
  const funde: TagFund[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (!hashIstAnfang(text, index)) continue;
    const name = liesPfad(text.slice(index + 1));
    if (!name) continue;
    funde.push({ name, start: index, end: index + 1 + name.length });
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
  if (hash >= 0 && text[hash] === '#' && hashIstAnfang(text, hash)) {
    const danach = text[stelle];
    if (danach === undefined || !NAMENSZEICHEN.test(danach)) {
      return { name: '', start: hash, end: stelle };
    }
  }
  return null;
}

export function entferneTag(text: string, tag: TagFund): string {
  let davor = text.slice(0, tag.start);
  let danach = text.slice(tag.end);
  if (/^[.,;:!?)]/u.test(danach) && /\s$/u.test(davor)) {
    davor = davor.slice(0, -1);
  } else if (/\s$/u.test(davor) && /^\s/u.test(danach)) {
    danach = danach.slice(1);
  } else if (davor.length === 0 && /^\s/u.test(danach)) {
    danach = danach.slice(1);
  } else if (danach.length === 0 && /\s$/u.test(davor)) {
    davor = davor.slice(0, -1);
  }
  return davor + danach;
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
