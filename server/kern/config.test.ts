import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stridePasswortZiel } from '../../shared/features/zugang/index.ts';
import { datenbankPfad, lesePort, stridePublicUrl, strideUrl } from './config.ts';
import { istTestlauf } from './testpfad.ts';

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
    const neu = process.env.CORTX_STRIDE_URL;
    const alt = process.env.CORTEX_STRIDE_URL;
    delete process.env.CORTX_STRIDE_URL;
    delete process.env.CORTEX_STRIDE_URL;
    try {
      expect(strideUrl()).toBe('http://127.0.0.1:3000/api/zugang');
      process.env.CORTEX_STRIDE_URL = 'http://127.0.0.1:3111/api/zugang';
      expect(strideUrl()).toBe('http://127.0.0.1:3111/api/zugang');
      process.env.CORTX_STRIDE_URL = 'http://127.0.0.1:3112/api/zugang';
      expect(strideUrl()).toBe('http://127.0.0.1:3112/api/zugang');
    } finally {
      if (neu === undefined) delete process.env.CORTX_STRIDE_URL;
      else process.env.CORTX_STRIDE_URL = neu;
      if (alt === undefined) delete process.env.CORTEX_STRIDE_URL;
      else process.env.CORTEX_STRIDE_URL = alt;
    }
  });

  it('reads the database path from the new name and falls back to the old one', () => {
    const neu = process.env.CORTX_DB;
    const alt = process.env.CORTEX_DB;
    const bevorzugt = path.resolve('tmp-test', 'vitest', 'bevorzugt.db');
    const ersatz = path.resolve('tmp-test', 'vitest', 'ersatz.db');
    try {
      process.env.CORTX_DB = bevorzugt;
      process.env.CORTEX_DB = ersatz;
      expect(datenbankPfad()).toBe(bevorzugt);
      delete process.env.CORTX_DB;
      expect(datenbankPfad()).toBe(ersatz);
    } finally {
      if (neu === undefined) delete process.env.CORTX_DB;
      else process.env.CORTX_DB = neu;
      if (alt === undefined) delete process.env.CORTEX_DB;
      else process.env.CORTEX_DB = alt;
    }
  });

  it('treats the new test flag as the one that counts', () => {
    expect(istTestlauf({ CORTX_TEST: '1' })).toBe(true);
    expect(istTestlauf({ CORTEX_TEST: '1' })).toBe(true);
    expect(istTestlauf({ CORTX_TEST: '0', CORTEX_TEST: '1' })).toBe(false);
    expect(istTestlauf({})).toBe(false);
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
