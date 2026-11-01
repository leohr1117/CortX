import type { Page } from '@playwright/test';

export const ANMELDE_NAME = 'note@example.com';
export const ANMELDE_PASSWORT = 'test-password';

export async function meldeAn(page: Page): Promise<void> {
  const antwort = await page.request.post('/api/zugang', {
    data: { name: ANMELDE_NAME, passwort: ANMELDE_PASSWORT },
  });
  if (!antwort.ok()) throw new Error(`Sign-in failed (${antwort.status()}).`);
}

export async function cookieFuer(url: string): Promise<string> {
  const antwort = await fetch(`${url}/api/zugang`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: ANMELDE_NAME, passwort: ANMELDE_PASSWORT }),
  });
  if (!antwort.ok) throw new Error(`Sign-in failed (${antwort.status}).`);
  const paar = antwort.headers
    .getSetCookie()
    .map((zeile) => zeile.split(';')[0] ?? '')
    .find((zeile) => zeile.startsWith('cortex_session='));
  if (!paar) throw new Error('Sign-in set no session.');
  return paar;
}
