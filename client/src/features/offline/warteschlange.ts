export interface WarteschlangeEintrag {
  clientId: string;
  text: string;
  created: string;
  seq: number;
}

export function baueEintrag(text: string, clientId: string, seq: number, created: string): WarteschlangeEintrag {
  return { clientId, text, seq, created };
}

export function naechsteSeq(queue: readonly WarteschlangeEintrag[]): number {
  return queue.reduce((max, eintrag) => Math.max(max, eintrag.seq), 0) + 1;
}

export function reiheEin(
  queue: readonly WarteschlangeEintrag[],
  eintrag: WarteschlangeEintrag,
): WarteschlangeEintrag[] {
  if (queue.some((alt) => alt.clientId === eintrag.clientId)) return [...queue];
  return [...queue, eintrag];
}

export function ohneEintrag(queue: readonly WarteschlangeEintrag[], clientId: string): WarteschlangeEintrag[] {
  return queue.filter((alt) => alt.clientId !== clientId);
}

export function reihenfolge(queue: readonly WarteschlangeEintrag[]): WarteschlangeEintrag[] {
  return [...queue].sort((a, b) => a.seq - b.seq || a.clientId.localeCompare(b.clientId));
}

export function istDauerhaft(status: number | null): boolean {
  if (status === null) return false;
  if (status === 401 || status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}
