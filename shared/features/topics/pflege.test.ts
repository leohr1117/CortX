import { describe, expect, it } from 'vitest';
import { TOPIC_NAME_MAX } from '../../kern/grenzen.ts';
import type { Thema } from '../../kern/modell.ts';
import {
  filtereZiele,
  pflegeMeldung,
  planeLoeschen,
  planeUmbenennen,
  planeZusammenfuehren,
  zusammenHinweis,
  zieleFuerZusammenfuehren,
  zitier,
} from './pflege.ts';

const NAMEN = ['Inbox', 'Books', 'Home', 'Work'];

function thema(name: string, count: number): Thema {
  return { name, count };
}

describe('topic maintenance rules', () => {
  it('renames, keeps a case change, and rejects empty, duplicate, and reserved names', () => {
    expect(planeUmbenennen('Work', '  Studio  ', NAMEN)).toEqual({
      ok: true,
      aktuell: 'Work',
      name: 'Studio',
      geaendert: true,
    });
    expect(planeUmbenennen('work', 'WORK', NAMEN)).toEqual({
      ok: true,
      aktuell: 'Work',
      name: 'WORK',
      geaendert: true,
    });
    expect(planeUmbenennen('Work', '  Work  ', NAMEN)).toEqual({
      ok: true,
      aktuell: 'Work',
      name: 'Work',
      geaendert: false,
    });
    expect(planeUmbenennen('Work', 'Side \u2013 Project', NAMEN)).toMatchObject({ ok: true, name: 'Side \u2013 Project' });
    expect(planeUmbenennen('Work', '   ', NAMEN)).toEqual({ ok: false, grund: 'empty' });
    expect(planeUmbenennen('Work', 'books', NAMEN)).toEqual({ ok: false, grund: 'duplicate' });
    expect(planeUmbenennen('Work', 'INBOX', NAMEN)).toEqual({ ok: false, grund: 'reserved' });
    expect(planeUmbenennen('Work', '!!!', NAMEN)).toEqual({ ok: false, grund: 'invalid' });
    expect(planeUmbenennen('Work', 'a'.repeat(TOPIC_NAME_MAX + 1), NAMEN)).toEqual({ ok: false, grund: 'invalid' });
    expect(planeUmbenennen('Missing', 'Studio', NAMEN)).toEqual({ ok: false, grund: 'missing' });
    expect(planeUmbenennen('inbox', 'Studio', NAMEN)).toEqual({ ok: false, grund: 'locked' });
  });

  it('merges only into another existing topic', () => {
    expect(planeZusammenfuehren('Work', 'ideas', ['Inbox', 'Ideas', 'Work'])).toEqual({
      ok: true,
      quelle: 'Work',
      ziel: 'Ideas',
    });
    expect(planeZusammenfuehren('Work', 'work', NAMEN).ok).toBe(false);
    expect(planeZusammenfuehren('Work', 'Work', NAMEN)).toEqual({ ok: false, grund: 'self' });
    expect(planeZusammenfuehren('Work', 'Inbox', NAMEN)).toEqual({ ok: false, grund: 'reserved' });
    expect(planeZusammenfuehren('Work', 'Nope', NAMEN)).toEqual({ ok: false, grund: 'unknown' });
    expect(planeZusammenfuehren('Work', '   ', NAMEN)).toEqual({ ok: false, grund: 'invalid' });
    expect(planeZusammenfuehren('Work', '!!!', NAMEN)).toEqual({ ok: false, grund: 'invalid' });
    expect(planeZusammenfuehren('Missing', 'Books', NAMEN)).toEqual({ ok: false, grund: 'missing' });
    expect(planeZusammenfuehren('Inbox', 'Books', NAMEN)).toEqual({ ok: false, grund: 'locked' });
  });

  it('deletes a topic and refuses Inbox', () => {
    expect(planeLoeschen(' work ', NAMEN)).toEqual({ ok: true, name: 'Work' });
    expect(planeLoeschen('Inbox', NAMEN)).toEqual({ ok: false, grund: 'locked' });
    expect(planeLoeschen('Nope', NAMEN)).toEqual({ ok: false, grund: 'missing' });
    expect(planeLoeschen('   ', NAMEN)).toEqual({ ok: false, grund: 'missing' });
  });

  it('lists merge targets alphabetically without Inbox or the current topic', () => {
    const themen = [
      thema('Workout', 6),
      thema('Inbox', 3),
      thema('Work', 14),
      thema('Travel \u2013 Lisbon', 5),
      thema('Ideas', 23),
      thema('Home', 7),
      thema('Books', 9),
    ];
    const ziele = zieleFuerZusammenfuehren(themen, 'work');
    expect(ziele.map((eintrag) => eintrag.name)).toEqual(['Books', 'Home', 'Ideas', 'Travel \u2013 Lisbon', 'Workout']);
    expect(filtereZiele('  LIS ', ziele).map((eintrag) => eintrag.name)).toEqual(['Travel \u2013 Lisbon']);
    expect(filtereZiele('', ziele)).toEqual(ziele);
    expect(filtereZiele('zzz', ziele)).toEqual([]);
  });

  it('phrases the merge hint and the quoted name', () => {
    expect(zitier('Work')).toBe('\u201CWork\u201D');
    expect(zusammenHinweis(14, 'Work')).toBe('All 14 notes move there and \u201CWork\u201D is removed.');
    expect(zusammenHinweis(1, 'Work')).toBe('The note moves there and \u201CWork\u201D is removed.');
    expect(zusammenHinweis(0, 'Work')).toBe('\u201CWork\u201D is removed.');
    expect(pflegeMeldung('empty')).toBe('Enter a name.');
    expect(pflegeMeldung('duplicate')).toBe('A topic with this name already exists.');
    expect(pflegeMeldung('reserved')).toBe('That name is reserved.');
    expect(pflegeMeldung('locked')).toBe('Inbox cannot be changed.');
  });
});
