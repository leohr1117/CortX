import { describe, expect, it } from 'vitest';
import { TOPIC_NAME_MAX } from '../../kern/grenzen.ts';
import type { Thema } from '../../kern/modell.ts';
import { themaName } from './name.ts';
import { neuesThemaZeile, sucheThemen } from './wechsel.ts';

const LISTE: Thema[] = [
  { name: 'Work', count: 14 },
  { name: 'Inbox', count: 3 },
  { name: 'Ideas', count: 23 },
  { name: 'Books', count: 9 },
];

describe('topic names', () => {
  it('trims a readable name and keeps an en dash', () => {
    expect(themaName('  Travel \u2013 Lisbon  ')).toBe('Travel \u2013 Lisbon');
    expect(themaName('Home')).toBe('Home');
    expect(themaName('a'.repeat(TOPIC_NAME_MAX))).toHaveLength(TOPIC_NAME_MAX);
  });

  it('rejects empty, oversized, and symbolic names', () => {
    expect(themaName('   ')).toBeNull();
    expect(themaName('a'.repeat(TOPIC_NAME_MAX + 1))).toBeNull();
    expect(themaName('bad\nname')).toBeNull();
    expect(themaName('!!!')).toBeNull();
    expect(themaName('#Home')).toBeNull();
  });
});

describe('move picker', () => {
  it('pins Inbox first and then sorts by name', () => {
    expect(sucheThemen('', LISTE).map((thema) => thema.name)).toEqual(['Inbox', 'Books', 'Ideas', 'Work']);
  });

  it('filters by text and offers a new topic only when the name is new', () => {
    expect(sucheThemen('wo', LISTE).map((thema) => thema.name)).toEqual(['Work']);
    expect(neuesThemaZeile('wo', LISTE)).toBe('wo');
    expect(neuesThemaZeile('  work ', LISTE)).toBeNull();
    expect(neuesThemaZeile('inbox', LISTE)).toBeNull();
    expect(neuesThemaZeile('!!!', LISTE)).toBeNull();
    expect(neuesThemaZeile('Zimmer', LISTE)).toBe('Zimmer');
  });
});
