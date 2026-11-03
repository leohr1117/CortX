import { describe, expect, it } from 'vitest';
import { AKTUELLE_VERSION } from '../../versionen.ts';
import { entscheideUpdateHinweis } from './hinweis.ts';

describe('update hinweis', () => {
  it('shows one snackbar for a missed update and keeps the dot until the page is seen', () => {
    const verpasst = entscheideUpdateHinweis({ benachrichtigt: '1.0.0', gesehen: '1.0.0' }, AKTUELLE_VERSION, false);
    expect(verpasst.snackbar).toBe(true);
    expect(verpasst.badge).toBe(true);
    expect(verpasst.schreiben).toEqual({ benachrichtigt: AKTUELLE_VERSION });

    const danach = entscheideUpdateHinweis(
      { benachrichtigt: AKTUELLE_VERSION, gesehen: '1.0.0' },
      AKTUELLE_VERSION,
      false,
    );
    expect(danach.snackbar).toBe(false);
    expect(danach.badge).toBe(true);
    expect(danach.schreiben).toBeNull();

    const gelesen = entscheideUpdateHinweis(
      { benachrichtigt: AKTUELLE_VERSION, gesehen: AKTUELLE_VERSION },
      AKTUELLE_VERSION,
      false,
    );
    expect(gelesen.snackbar).toBe(false);
    expect(gelesen.badge).toBe(false);
    expect(gelesen.schreiben).toBeNull();
  });

  it('stays quiet for a fresh account and writes both values once', () => {
    const frisch = entscheideUpdateHinweis({ benachrichtigt: null, gesehen: null }, AKTUELLE_VERSION, true);
    expect(frisch.snackbar).toBe(false);
    expect(frisch.badge).toBe(false);
    expect(frisch.schreiben).toEqual({ benachrichtigt: AKTUELLE_VERSION, gesehen: AKTUELLE_VERSION });

    const gesetzt = entscheideUpdateHinweis(
      { benachrichtigt: AKTUELLE_VERSION, gesehen: AKTUELLE_VERSION },
      AKTUELLE_VERSION,
      true,
    );
    expect(gesetzt.snackbar).toBe(false);
    expect(gesetzt.badge).toBe(false);
    expect(gesetzt.schreiben).toBeNull();
  });

  it('treats an existing account without a stand as an update', () => {
    const alt = entscheideUpdateHinweis({ benachrichtigt: null, gesehen: null }, AKTUELLE_VERSION, false);
    expect(alt.snackbar).toBe(true);
    expect(alt.badge).toBe(true);
    expect(alt.schreiben).toEqual({ benachrichtigt: AKTUELLE_VERSION });
  });
});
