import { describe, expect, it } from 'vitest';
import { FEHLER_FENSTER_MS, FEHLER_GLOBAL, FEHLER_JE_IP } from './grenzen.ts';
import { limitGrund } from './limit.ts';

const JETZT = Date.parse('2026-11-01T12:00:00.000Z');

function versuch(ip: string, vorMs: number) {
  return { ip, at: JETZT - vorMs };
}

describe('sign-in failure limit', () => {
  it('allows attempts inside the budget', () => {
    const versuche = [versuch('203.0.113.5', 1_000), versuch('203.0.113.5', 2_000)];
    expect(limitGrund(versuche, '203.0.113.5', JETZT, FEHLER_FENSTER_MS, FEHLER_JE_IP, FEHLER_GLOBAL)).toBeNull();
  });

  it('blocks one address after its own failures', () => {
    const versuche = Array.from({ length: FEHLER_JE_IP }, (_, index) => versuch('203.0.113.5', index * 1_000));
    expect(limitGrund(versuche, '203.0.113.5', JETZT, FEHLER_FENSTER_MS, FEHLER_JE_IP, FEHLER_GLOBAL)).toBe('ip');
    expect(limitGrund(versuche, '203.0.113.9', JETZT, FEHLER_FENSTER_MS, FEHLER_JE_IP, FEHLER_GLOBAL)).toBeNull();
  });

  it('blocks everyone when the global budget is spent', () => {
    const versuche = Array.from({ length: FEHLER_GLOBAL }, (_, index) => versuch(`198.51.100.${index}`, 1_000));
    expect(limitGrund(versuche, '203.0.113.5', JETZT, FEHLER_FENSTER_MS, FEHLER_JE_IP, FEHLER_GLOBAL)).toBe('global');
  });

  it('ignores failures outside the window', () => {
    const versuche = Array.from({ length: FEHLER_JE_IP }, () => versuch('203.0.113.5', FEHLER_FENSTER_MS + 1));
    expect(limitGrund(versuche, '203.0.113.5', JETZT, FEHLER_FENSTER_MS, FEHLER_JE_IP, FEHLER_GLOBAL)).toBeNull();
  });
});
