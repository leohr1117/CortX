import { describe, expect, it } from 'vitest';
import { stridePasswortZiel } from './passwort.ts';

describe('stride password page', () => {
  it('uses the password page on the stride origin', () => {
    expect(stridePasswortZiel('http://127.0.0.1:3000/api/zugang')).toBe(
      'http://127.0.0.1:3000/mehr/profil/passwort',
    );
    expect(stridePasswortZiel('http://127.0.0.1:3111/api/zugang')).toBe(
      'http://127.0.0.1:3111/mehr/profil/passwort',
    );
    expect(stridePasswortZiel('https://stride.example/api/zugang')).toBe(
      'https://stride.example/mehr/profil/passwort',
    );
  });
});
