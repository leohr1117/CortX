export interface WarteschlangeEintrag {
  clientId: string;
  doc: unknown;
  created: string;
  seq: number;
}

export function baueEintrag(doc: unknown, clientId: string, seq: number, created: string): WarteschlangeEintrag {
  return { clientId, doc, seq, created };
}

export function naechsteSeq(queue: readonly WarteschlangeEintrag[]): number {
  return queue.reduce((max, eintrag) => Math.max(max, eintrag.seq), 0) + 1;
}

export function reihenfolge(queue: readonly WarteschlangeEintrag[]): WarteschlangeEintrag[] {
  return [...queue].sort((a, b) => a.seq - b.seq || a.clientId.localeCompare(b.clientId));
}

export function istDauerhaft(status: number | null): boolean {
  if (status === null) return false;
  if (status === 401 || status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}
