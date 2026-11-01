export interface IpKopf {
  cf: string | null;
  forwarded: string | null;
}

function erstesStueck(wert: string | null): string | null {
  if (!wert) return null;
  const stueck = wert.split(',')[0]?.trim() ?? '';
  if (!stueck || stueck.length > 64 || /[\s\r\n]/.test(stueck)) return null;
  return stueck;
}

export function echteIp(kopf: IpKopf, socket: string): string {
  return erstesStueck(kopf.cf) ?? erstesStueck(kopf.forwarded) ?? erstesStueck(socket) ?? '0.0.0.0';
}
