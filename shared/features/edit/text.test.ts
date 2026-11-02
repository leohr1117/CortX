import { describe, expect, it } from 'vitest';
import { NOTE_TEXT_MAX } from '../../kern/grenzen.ts';
import { ablageZeile, planeNotizText, textGeaendert, textMeldung } from './index.ts';

const JETZT = new Date(2026, 10, 1, 18, 0, 0, 0);

function iso(monat: number, tag: number, stunde: number, minute: number, jahr = 2026): string {
  return new Date(jahr, monat - 1, tag, stunde, minute, 0, 0).toISOString();
}

describe('note text', () => {
  it('trims the start, keeps a trailing space, and rejects an empty or oversized note', () => {
    expect(planeNotizText('  Hello  ')).toEqual({ ok: true, text: 'Hello  ' });
    expect(planeNotizText('**Hello** ')).toEqual({ ok: true, text: '**Hello** ' });
    expect(planeNotizText('**Hello** \n')).toEqual({ ok: true, text: '**Hello** \n' });
    expect(planeNotizText('a'.repeat(NOTE_TEXT_MAX))).toEqual({ ok: true, text: 'a'.repeat(NOTE_TEXT_MAX) });
    expect(planeNotizText('   ')).toEqual({ ok: false, grund: 'empty' });
    expect(planeNotizText('a'.repeat(NOTE_TEXT_MAX + 1))).toEqual({ ok: false, grund: 'long' });
    expect(textMeldung('empty')).toBe('Write something to save.');
    expect(textMeldung('long')).toBe('That note is too long.');
  });

  it('treats any difference, including spaces, as an unsaved edit', () => {
    expect(textGeaendert('Hello', 'Hello')).toBe(false);
    expect(textGeaendert('Hello', 'Hello ')).toBe(true);
    expect(textGeaendert('Hello', '')).toBe(true);
  });

  it('describes when a note was filed', () => {
    expect(ablageZeile({ created: iso(11, 1, 9, 12), topic: 'Work', source: 'tag' }, JETZT)).toBe(
      'Filed today at 09:12 via #work',
    );
    expect(ablageZeile({ created: iso(10, 31, 17, 48), topic: 'Work', source: 'tag' }, JETZT)).toBe(
      'Filed yesterday at 17:48 via #work',
    );
    expect(ablageZeile({ created: iso(10, 28, 8, 20), topic: 'Inbox', source: 'manual' }, JETZT)).toBe(
      'Filed 28 Oct at 08:20',
    );
    expect(ablageZeile({ created: iso(10, 28, 8, 20, 2025), topic: 'Work', source: 'ai' }, JETZT)).toBe(
      'Filed 28 Oct 2025 at 08:20',
    );
    expect(ablageZeile({ created: 'nope', topic: 'Work', source: 'tag' }, JETZT)).toBe(
      'Filed on an unknown day via #work',
    );
  });
});
