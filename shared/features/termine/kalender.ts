export const BERLIN = 'Europe/Berlin';

export interface KalenderTag {
  jahr: number;
  monat: number;
  tag: number;
}

export function gueltigerTag(tag: KalenderTag): boolean {
  if (tag.monat < 1 || tag.monat > 12 || tag.tag < 1) return false;
  const probe = new Date(Date.UTC(tag.jahr, tag.monat - 1, tag.tag));
  return probe.getUTCFullYear() === tag.jahr && probe.getUTCMonth() === tag.monat - 1 && probe.getUTCDate() === tag.tag;
}

export function berlinerTag(bezug: Date): KalenderTag | null {
  if (Number.isNaN(bezug.getTime())) return null;
  const teile = new Intl.DateTimeFormat('en-US', {
    timeZone: BERLIN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(bezug);
  const wert = (typ: Intl.DateTimeFormatPartTypes) => Number(teile.find((teil) => teil.type === typ)?.value);
  const ergebnis = { jahr: wert('year'), monat: wert('month'), tag: wert('day') };
  if (!Number.isInteger(ergebnis.jahr) || !Number.isInteger(ergebnis.monat) || !Number.isInteger(ergebnis.tag)) return null;
  return gueltigerTag(ergebnis) ? ergebnis : null;
}

export function plusTage(tag: KalenderTag, tage: number): KalenderTag {
  const basis = new Date(Date.UTC(tag.jahr, tag.monat - 1, tag.tag + tage));
  return { jahr: basis.getUTCFullYear(), monat: basis.getUTCMonth() + 1, tag: basis.getUTCDate() };
}

export function wochentag(tag: KalenderTag): number {
  return new Date(Date.UTC(tag.jahr, tag.monat - 1, tag.tag)).getUTCDay();
}

export function vorher(a: KalenderTag, b: KalenderTag): boolean {
  if (a.jahr !== b.jahr) return a.jahr < b.jahr;
  if (a.monat !== b.monat) return a.monat < b.monat;
  return a.tag < b.tag;
}

export function datumText(tag: KalenderTag): string {
  const monat = String(tag.monat).padStart(2, '0');
  const zahl = String(tag.tag).padStart(2, '0');
  return `${tag.jahr}-${monat}-${zahl}`;
}

export function loeseJahr(monat: number, tag: number, bezug: KalenderTag, jahr: number | null): KalenderTag | null {
  if (jahr !== null) {
    const fest = { jahr, monat, tag };
    return gueltigerTag(fest) ? fest : null;
  }
  const dieses = { jahr: bezug.jahr, monat, tag };
  if (gueltigerTag(dieses) && !vorher(dieses, bezug)) return dieses;
  const naechstes = { jahr: bezug.jahr + 1, monat, tag };
  return gueltigerTag(naechstes) ? naechstes : null;
}
