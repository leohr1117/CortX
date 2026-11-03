import { describe, expect, it } from 'vitest';
import { SERVER_HOST, SERVER_PORT, STRIDE_PORT } from './grenzen.ts';

describe('server bounds', () => {
  it('keeps Cortex on loopback port 3100 and away from Stride', () => {
    expect(SERVER_HOST).toBe('127.0.0.1');
    expect(SERVER_PORT).toBe(3100);
    expect(STRIDE_PORT).toBe(3000);
  });
});
