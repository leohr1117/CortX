import { describe, expect, it } from 'vitest';
import { rollenMaxPx } from './liste.ts';

describe('pinned list height', () => {
  it('keeps the pinned row inside the list cap', () => {
    const max = 320;
    const fuss = 57;
    const rahmen = 10;
    const rolle = rollenMaxPx(max, fuss, rahmen);
    expect(rolle).toBe(253);
    expect((rolle ?? 0) + fuss + rahmen).toBeLessThanOrEqual(max);
    expect(rollenMaxPx(320, 57.2, 10.1)).toBe(251);
    expect((251 + Math.ceil(57.2) + Math.ceil(10.1))).toBeLessThanOrEqual(320);
    expect(rollenMaxPx(50, 80, 10)).toBe(0);
    expect(rollenMaxPx(Number.NaN, 0, 0)).toBeNull();
    expect(rollenMaxPx(0, 0, 0)).toBeNull();
    expect(rollenMaxPx(-4, 8, 2)).toBeNull();
  });
});
