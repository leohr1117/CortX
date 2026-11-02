export interface SuchRoh {
  id: number;
  text: string;
  topic: string;
  created: string;
}

export interface SuchTreffer {
  id: number;
  text: string;
  topic: string;
  created: string;
}

export function formeTreffer(roh: readonly SuchRoh[], limit: number): SuchTreffer[] {
  const sortiert = [...roh].sort((a, b) => {
    const delta = Date.parse(b.created) - Date.parse(a.created);
    if (Number.isFinite(delta) && delta !== 0) return delta;
    return b.id - a.id;
  });
  const gesehen = new Set<number>();
  const einzig: SuchRoh[] = [];
  for (const zeile of sortiert) {
    if (gesehen.has(zeile.id)) continue;
    gesehen.add(zeile.id);
    einzig.push(zeile);
    if (einzig.length >= limit) break;
  }
  return einzig.map((zeile) => ({
    id: zeile.id,
    text: zeile.text,
    topic: zeile.topic,
    created: zeile.created,
  }));
}
