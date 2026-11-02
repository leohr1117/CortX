import { describe, expect, it } from 'vitest';
import { stridePasswortZiel } from '../../shared/features/zugang/index.ts';
import { lesePort, stridePublicUrl, strideUrl } from './config.ts';

describe('config', () => {
  it('defaults to 3100 and rejects Stride and invalid ports', () => {
    expect(lesePort(undefined)).toBe(3100);
    expect(lesePort('')).toBe(3100);
    expect(lesePort('3110')).toBe(3110);
    expect(() => lesePort('3000')).toThrow(/Stride/);
    expect(() => lesePort('0')).toThrow(/Invalid/);
    expect(() => lesePort('abc')).toThrow(/Invalid/);
  });

  it('keeps sign-in on the internal stride address', () => {
    const vorher = process.env.CORTEX_STRIDE_URL;
    delete process.env.CORTEX_STRIDE_URL;
    try {
      expect(strideUrl()).toBe('http://127.0.0.1:3000/api/zugang');
      process.env.CORTEX_STRIDE_URL = 'http://127.0.0.1:3111/api/zugang';
      expect(strideUrl()).toBe('http://127.0.0.1:3111/api/zugang');
    } finally {
      if (vorher === undefined) delete process.env.CORTEX_STRIDE_URL;
      else process.env.CORTEX_STRIDE_URL = vorher;
    }
  });

  it('reads the public stride address for the password page', () => {
    const vorher = process.env.CORTX_STRIDE_PUBLIC_URL;
    delete process.env.CORTX_STRIDE_PUBLIC_URL;
    try {
      expect(stridePublicUrl()).toBe('https://stride.leohr.de');
      expect(stridePasswortZiel(stridePublicUrl())).toBe('https://stride.leohr.de/mehr/profil/passwort');
      process.env.CORTX_STRIDE_PUBLIC_URL = 'https://stride.example/';
      expect(stridePublicUrl()).toBe('https://stride.example');
      expect(stridePasswortZiel(stridePublicUrl())).toBe('https://stride.example/mehr/profil/passwort');
    } finally {
      if (vorher === undefined) delete process.env.CORTX_STRIDE_PUBLIC_URL;
      else process.env.CORTX_STRIDE_PUBLIC_URL = vorher;
    }
  });
});
