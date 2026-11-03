import { INBOX_NAME } from '../../kern/grenzen.ts';
import type { Thema } from '../../kern/modell.ts';
import { gleicherName } from '../tags/index.ts';
import { themaName } from './name.ts';

function ordneWechsel(themen: readonly Thema[]): Thema[] {
  return [...themen].sort((a, b) => {
    const aInbox = gleicherName(a.name, INBOX_NAME) ? 0 : 1;
    const bInbox = gleicherName(b.name, INBOX_NAME) ? 0 : 1;
    if (aInbox !== bInbox) return aInbox - bInbox;
    return a.name.localeCompare(b.name);
  });
}

export function sucheThemen(frage: string, themen: readonly Thema[]): Thema[] {
  const nadel = frage.trim().toLocaleLowerCase();
  const liste =
    nadel.length === 0 ? [...themen] : themen.filter((thema) => thema.name.toLocaleLowerCase().includes(nadel));
  return ordneWechsel(liste);
}

export function neuesThemaZeile(frage: string, themen: readonly Thema[]): string | null {
  const name = themaName(frage);
  if (!name) return null;
  if (themen.some((thema) => gleicherName(thema.name, name))) return null;
  return name;
}
