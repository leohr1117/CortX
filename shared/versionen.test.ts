import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { versionKleiner } from './features/version/hinweis.ts';
import { AKTUELLE_VERSION, VERSIONEN } from './versionen.ts';

const ERWARTET = [
  '1.10.0',
  '1.9.0',
  '1.8.13',
  '1.8.12',
  '1.8.11',
  '1.8.10',
  '1.8.9',
  '1.8.8',
  '1.8.7',
  '1.8.6',
  '1.8.5',
  '1.8.4',
  '1.8.3',
  '1.8.2',
  '1.8.1',
  '1.8.0',
  '1.7.3',
  '1.7.2',
  '1.7.1',
  '1.7.0',
  '1.6.0',
  '1.5.5',
  '1.5.4',
  '1.5.3',
  '1.5.2',
  '1.5.1',
  '1.5.0',
  '1.4.1',
  '1.4.0',
  '1.3.0',
  '1.2.0',
  '1.1.0',
  '1.0.0',
  '0.5.0',
  '0.4.0',
  '0.3.0',
  '0.2.0',
  '0.1.0',
];

describe('versionen', () => {
  it('matches package.json and lists every version newest first', () => {
    const paket = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
    ) as { version: string };
    expect(AKTUELLE_VERSION).toBe(paket.version);
    expect(AKTUELLE_VERSION).toBe(VERSIONEN[0]?.version);
    expect(VERSIONEN.map((eintrag) => eintrag.version)).toEqual(ERWARTET);
    let vorher: string | null = null;
    for (const eintrag of VERSIONEN) {
      expect(eintrag.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(eintrag.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(eintrag.zeilen.length).toBeGreaterThanOrEqual(1);
      expect(eintrag.zeilen.length).toBeLessThanOrEqual(4);
      for (const zeile of eintrag.zeilen) {
        expect(zeile.trim()).toBe(zeile);
        expect(zeile.length).toBeGreaterThan(0);
        expect(zeile).not.toMatch(/\bU\d+/);
        expect(zeile).not.toMatch(/schema|migration|semver/i);
      }
      if (vorher) expect(versionKleiner(eintrag.version, vorher)).toBe(true);
      vorher = eintrag.version;
    }
  });
});
