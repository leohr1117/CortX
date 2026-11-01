import { TOPIC_NAME_MAX } from '../../kern/grenzen.ts';

const THEMA_NAME = /^[\p{L}\p{N}][\p{L}\p{N}&+'.,/\u2013\u2014 -]*$/u;

export function themaName(roh: string): string | null {
  const name = roh.trim();
  if (name.length === 0 || name.length > TOPIC_NAME_MAX) return null;
  if (!THEMA_NAME.test(name)) return null;
  return name;
}
