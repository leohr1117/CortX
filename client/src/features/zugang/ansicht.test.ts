import { describe, expect, it } from 'vitest';
import { naechsteAnsicht } from './ansicht.ts';

describe('sign-in screen', () => {
  it('waits without painting the app, and keeps the draft reachable offline', () => {
    expect(naechsteAnsicht('wartet', true)).toBe('warte');
    expect(naechsteAnsicht('wartet', false)).toBe('app');
    expect(naechsteAnsicht('aus', true)).toBe('login');
    expect(naechsteAnsicht('aus', false)).toBe('app');
    expect(naechsteAnsicht('an', true)).toBe('app');
    expect(naechsteAnsicht('an', false)).toBe('app');
  });
});
