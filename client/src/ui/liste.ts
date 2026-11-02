export function rollenMaxPx(maxPx: number, fussPx: number, rahmenPx: number): number | null {
  if (!Number.isFinite(maxPx) || maxPx <= 0) return null;
  const frei = Math.floor(maxPx) - Math.ceil(Math.max(0, fussPx)) - Math.ceil(Math.max(0, rahmenPx));
  return Math.max(0, frei);
}
