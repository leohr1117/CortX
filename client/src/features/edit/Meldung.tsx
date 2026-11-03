export interface NotizMeldung {
  token: string;
  topic: string;
}

const MERKER = 'cortex.note-undo';

function text(wert: unknown): wert is string {
  return typeof wert === 'string' && wert.length > 0;
}

function liesNotizMeldung(roh: unknown): NotizMeldung | null {
  if (!roh || typeof roh !== 'object') return null;
  const wert = roh as { token?: unknown; topic?: unknown };
  if (!text(wert.token) || !text(wert.topic)) return null;
  return { token: wert.token, topic: wert.topic };
}

export function merkeNotiz(meldung: NotizMeldung): void {
  try {
    sessionStorage.setItem(MERKER, JSON.stringify(meldung));
  } catch {
    return;
  }
}

export function liesGemerkteNotiz(): NotizMeldung | null {
  try {
    const roh = sessionStorage.getItem(MERKER);
    if (!roh) return null;
    return liesNotizMeldung(JSON.parse(roh) as unknown);
  } catch {
    return null;
  }
}

export function vergissNotiz(): void {
  try {
    sessionStorage.removeItem(MERKER);
  } catch {
    return;
  }
}
