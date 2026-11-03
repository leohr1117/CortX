import { COOKIE_NAME } from './grenzen.ts';

function setzeCookie(name: string, wert: string, sicher: boolean, maxAge: number): string {
  const teile = [`${name}=${wert}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${maxAge}`];
  if (sicher) teile.push('Secure');
  return teile.join('; ');
}

export function loeschCookie(name: string, sicher: boolean): string {
  return setzeCookie(name, '', sicher, 0);
}

export function istSicher(protoHeader: string | undefined, protocol: string): boolean {
  const proto = protoHeader?.split(',')[0]?.trim().toLowerCase() ?? '';
  if (proto === 'https') return true;
  return protocol === 'https';
}

function liesCookie(kopf: string | undefined, name: string): string | null {
  if (!kopf) return null;
  for (const stueck of kopf.split(';')) {
    const gleich = stueck.trim().indexOf('=');
    if (gleich <= 0) continue;
    const schluessel = stueck.trim().slice(0, gleich);
    if (schluessel !== name) continue;
    const wert = stueck.trim().slice(gleich + 1);
    return wert.length > 0 ? wert : null;
  }
  return null;
}

function gueltigesToken(wert: string | null): wert is string {
  return !!wert && wert.length >= 32 && wert.length <= 200 && /^[A-Za-z0-9_-]+$/.test(wert);
}

export function sitzungCookie(wert: string, sicher: boolean, maxAge: number): string {
  return setzeCookie(COOKIE_NAME, wert, sicher, maxAge);
}

export function liesSitzung(kopf: string | undefined): string | null {
  const wert = liesCookie(kopf, COOKIE_NAME);
  return gueltigesToken(wert) ? wert : null;
}
