const STEUER = /[\u0000-\u001f\u007f"'<>\\]/;

export function sicherZiel(ziel: string): string | null {
  const roh = ziel.trim();
  if (roh.length === 0 || STEUER.test(roh)) return null;
  let url: URL;
  try {
    url = new URL(roh);
  } catch {
    return null;
  }
  const protokoll = url.protocol.toLowerCase();
  if (protokoll !== 'http:' && protokoll !== 'https:' && protokoll !== 'mailto:') return null;
  return roh;
}
