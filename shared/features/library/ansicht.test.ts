import { describe, expect, it } from 'vitest';
import {
  baueBibliothek,
  bibliothekLeer,
  gruppiereNotizen,
  letzteNotizZeile,
  tagesLabel,
  uhrzeit,
  type BibliothekZeile,
} from './index.ts';

const JETZT = new Date(2026, 10, 1, 18, 0, 0, 0);

function iso(monat: number, tag: number, stunde: number, minute: number, jahr = 2026): string {
  return new Date(jahr, monat - 1, tag, stunde, minute, 0, 0).toISOString();
}

describe('library view', () => {
  it('labels today, yesterday, and a calendar day', () => {
    expect(tagesLabel(iso(11, 1, 14, 32), JETZT)).toBe('Today');
    expect(tagesLabel(iso(10, 31, 17, 48), JETZT)).toBe('Yesterday');
    expect(tagesLabel(iso(10, 28, 8, 20), JETZT)).toBe('28 Oct');
    expect(tagesLabel(iso(10, 28, 8, 20, 2025), JETZT)).toBe('28 Oct 2025');
    expect(tagesLabel('not-a-date', JETZT)).toBe('Unknown');
  });

  it('treats the previous calendar day as yesterday across a month boundary', () => {
    const neujahr = new Date(2026, 0, 1, 9, 0, 0, 0);
    expect(tagesLabel(iso(12, 31, 23, 10, 2025), neujahr)).toBe('Yesterday');
  });

  it('describes the newest note the way the library list does', () => {
    expect(letzteNotizZeile(iso(11, 1, 10, 0), JETZT)).toBe('Last note today');
    expect(letzteNotizZeile(iso(10, 31, 18, 0), JETZT)).toBe('Last note yesterday');
    expect(letzteNotizZeile(iso(10, 29, 12, 0), JETZT)).toBe('Last note 29 Oct');
    expect(letzteNotizZeile('nope', JETZT)).toBe('Last note');
  });

  it('formats the clock in 24 hours', () => {
    expect(uhrzeit(iso(11, 1, 14, 32))).toBe('14:32');
    expect(uhrzeit(iso(11, 1, 9, 5))).toBe('09:05');
    expect(uhrzeit('nope')).toBe('');
  });

  it('keeps Inbox apart and sorts the other topics by name', () => {
    const roh: BibliothekZeile[] = [
      { name: 'Work', count: 14, lastNote: iso(11, 1, 14, 0) },
      { name: 'Inbox', count: 3, lastNote: iso(11, 1, 8, 0) },
      { name: 'ideas', count: 0, lastNote: null },
      { name: 'Books', count: 9, lastNote: iso(10, 31, 12, 0) },
    ];
    const ansicht = baueBibliothek(roh);
    expect(ansicht.inbox).toEqual({ name: 'Inbox', count: 3, lastNote: iso(11, 1, 8, 0) });
    expect(ansicht.topics.map((thema) => thema.name)).toEqual(['Books', 'Work']);
    expect(bibliothekLeer(ansicht)).toBe(false);
  });

  it('is empty only when Inbox and every topic have no notes', () => {
    const leer = baueBibliothek([{ name: 'Inbox', count: 0, lastNote: null }]);
    expect(bibliothekLeer(leer)).toBe(true);
    expect(leer.inbox.lastNote).toBeNull();
    const nurThema = baueBibliothek([
      { name: 'Inbox', count: 0, lastNote: null },
      { name: 'Home', count: 1, lastNote: iso(11, 1, 9, 0) },
    ]);
    expect(bibliothekLeer(nurThema)).toBe(false);
    expect(nurThema.inbox.count).toBe(0);
  });

  it('groups notes under a day with the newest day first', () => {
    const notizen = [
      { id: 1, created: iso(10, 28, 8, 20), text: 'old' },
      { id: 2, created: iso(11, 1, 9, 12), text: 'morning' },
      { id: 3, created: iso(11, 1, 14, 32), text: 'afternoon' },
      { id: 4, created: iso(10, 31, 17, 48), text: 'yesterday' },
    ];
    const gruppen = gruppiereNotizen(notizen, JETZT);
    expect(gruppen.map((gruppe) => gruppe.label)).toEqual(['Today', 'Yesterday', '28 Oct']);
    expect(gruppen[0]?.notizen.map((notiz) => notiz.id)).toEqual([3, 2]);
    expect(gruppen[1]?.notizen.map((notiz) => notiz.id)).toEqual([4]);
    expect(gruppen[2]?.notizen.map((notiz) => notiz.id)).toEqual([1]);
  });
});
