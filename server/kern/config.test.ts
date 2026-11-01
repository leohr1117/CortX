import { describe, expect, it } from 'vitest';
import { lesePort } from './config.ts';

describe('config', () => {
  it('defaults to 3100 and rejects Stride and invalid ports', () => {
    expect(lesePort(undefined)).toBe(3100);
    expect(lesePort('')).toBe(3100);
    expect(lesePort('3110')).toBe(3110);
    expect(() => lesePort('3000')).toThrow(/Stride/);
    expect(() => lesePort('0')).toThrow(/Invalid/);
    expect(() => lesePort('abc')).toThrow(/Invalid/);
  });
});
