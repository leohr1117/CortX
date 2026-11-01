import path from 'node:path';
import { SPEICHER } from '../../shared/kern/grenzen.ts';

export const WURZEL = path.resolve(import.meta.dirname, '..', '..');
export const DATA = path.join(WURZEL, 'data');

export function istTestlauf(): boolean {
  return process.env.VITEST === 'true' || process.env.CORTEX_TEST === '1';
}

export function verweigereEchteDatenbank(pfad: string): string {
  if (pfad === SPEICHER) return pfad;
  const absolut = path.resolve(pfad);
  const ziel = absolut.toLowerCase();
  const daten = DATA.toLowerCase();
  if (ziel === daten || ziel.startsWith(`${daten}${path.sep}`)) {
    throw new Error(`Refusing to open a database inside data/ (${absolut}).`);
  }
  return absolut;
}
