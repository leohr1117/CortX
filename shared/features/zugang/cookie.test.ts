import { describe, expect, it } from 'vitest';
import { COOKIE_NAME, SITZUNG_SEKUNDEN } from './grenzen.ts';
import { istSicher, liesSitzung, loeschCookie, sitzungCookie } from './cookie.ts';

describe('session cookie', () => {
  const token = 'a'.repeat(43);

  it('sets an http-only lax cookie and adds secure only for https', () => {
    const klar = sitzungCookie(token, false, SITZUNG_SEKUNDEN);
    expect(klar).toContain(`${COOKIE_NAME}=${token}`);
    expect(klar).toContain('HttpOnly');
    expect(klar).toContain('SameSite=Lax');
    expect(klar).toContain(`Max-Age=${SITZUNG_SEKUNDEN}`);
    expect(klar).not.toContain('Secure');
    expect(sitzungCookie(token, true, SITZUNG_SEKUNDEN)).toContain('Secure');
    expect(loeschCookie(COOKIE_NAME, true)).toContain('Max-Age=0');
  });

  it('reads only a well-formed session token', () => {
    expect(liesSitzung(`${COOKIE_NAME}=${token}; andere=1`)).toBe(token);
    expect(liesSitzung('andere=1')).toBeNull();
    expect(liesSitzung(`${COOKIE_NAME}=kurz`)).toBeNull();
    expect(liesSitzung(`${COOKIE_NAME}=${token};%0d`)).toBe(token);
  });

  it('treats a forwarded https proto as a secure request', () => {
    expect(istSicher('https', 'http')).toBe(true);
    expect(istSicher('HTTPS, http', 'http')).toBe(true);
    expect(istSicher(undefined, 'http')).toBe(false);
    expect(istSicher(undefined, 'https')).toBe(true);
  });
});
