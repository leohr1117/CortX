export const SUCH_MAX = 200;
export const SUCH_LIMIT = 50;

export type SuchGrund = 'leer' | 'lang';

export type SuchPlan = { ok: true; ausdruck: string } | { ok: false; grund: SuchGrund };

export function suchMeldung(grund: SuchGrund): string {
  if (grund === 'lang') return 'The search is too long.';
  return 'The search is missing or invalid.';
}

export function planeSuche(roh: string): SuchPlan {
  if (roh.length > SUCH_MAX) return { ok: false, grund: 'lang' };
  const text = roh.trim();
  if (text.length === 0) return { ok: false, grund: 'leer' };
  const ausdruck = text
    .split(/\s+/)
    .map((teil) => `"${teil.replaceAll('"', '""')}"`)
    .join(' ');
  return { ok: true, ausdruck };
}
