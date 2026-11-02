import { describe, expect, it } from 'vitest';
import { KARTE_DAUER_MIT_MS, KARTE_DAUER_OHNE_MS, karteDauer } from './karte.tsx';

describe('karte', () => {
  it('keeps the durations in one place', () => {
    expect(karteDauer(false)).toBe(KARTE_DAUER_OHNE_MS);
    expect(karteDauer(false)).toBe(5000);
    expect(karteDauer(true)).toBe(KARTE_DAUER_MIT_MS);
    expect(karteDauer(true)).toBe(8000);
  });
});
