import { describe, expect, it } from 'vitest';
import { formeTreffer, kuerzeText, type SuchRoh } from './index.ts';

function zeile(id: number, text: string, created: string, topic = 'Work'): SuchRoh {
  return { id, text, topic, created };
}

describe('search hits', () => {
  it('collapses whitespace and shortens a long note on a word', () => {
    expect(kuerzeText('one\n\ntwo  three')).toBe('one two three');
    expect(kuerzeText('short lantern')).toBe('short lantern');
    const lang = `lantern ${'alpha '.repeat(40)}tailmarker`;
    const kurz = kuerzeText(lang, 80);
    expect(kurz.endsWith('...')).toBe(true);
    expect(kurz.includes('tailmarker')).toBe(false);
    expect(kurz.startsWith('lantern')).toBe(true);
    expect(kurz.includes('  ')).toBe(false);
  });

  it('puts the newest note first, drops duplicates, and keeps the limit', () => {
    const treffer = formeTreffer(
      [
        zeile(1, 'older lantern', '2026-10-01T00:00:00.000Z', 'Inbox'),
        zeile(4, 'same moment', '2026-11-01T00:00:00.000Z', 'Home'),
        zeile(2, `lantern ${'alpha '.repeat(40)}tailmarker`, '2026-10-15T00:00:00.000Z'),
        zeile(4, 'same moment again', '2026-11-01T00:00:00.000Z', 'Home'),
        zeile(3, 'tied moment', '2026-11-01T00:00:00.000Z', 'Work'),
      ],
      3,
    );
    expect(treffer.map((eintrag) => eintrag.id)).toEqual([4, 3, 2]);
    expect(treffer[0]).toMatchObject({ topic: 'Home', text: 'same moment' });
    expect(treffer[2]?.text.includes('tailmarker')).toBe(false);
    expect(treffer[2]?.text.endsWith('...')).toBe(true);
  });
});
