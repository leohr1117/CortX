import { describe, expect, it } from 'vitest';
import { echteIp } from './ip.ts';

describe('client address', () => {
  it('prefers the connecting header, then the forwarded chain, then the socket', () => {
    expect(echteIp({ cf: '203.0.113.8', forwarded: '198.51.100.2, 10.0.0.1' }, '127.0.0.1')).toBe('203.0.113.8');
    expect(echteIp({ cf: '  ', forwarded: '198.51.100.2, 10.0.0.1' }, '127.0.0.1')).toBe('198.51.100.2');
    expect(echteIp({ cf: null, forwarded: null }, '::ffff:127.0.0.1')).toBe('::ffff:127.0.0.1');
  });

  it('drops a header that is not a single address', () => {
    expect(echteIp({ cf: '203.0.113.8\r\nX: 1', forwarded: null }, '127.0.0.1')).toBe('127.0.0.1');
    expect(echteIp({ cf: null, forwarded: '' }, '')).toBe('0.0.0.0');
  });
});
