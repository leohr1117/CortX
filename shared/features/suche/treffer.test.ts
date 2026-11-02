import { describe, expect, it } from 'vitest';
import { formeTreffer, type SuchRoh } from './index.ts';

function zeile(id: number, text: string, created: string, topic = 'Work'): SuchRoh {
  return { id, text, topic, created };
}

describe('search hits', () => {
  it('keeps every line and the whole note', () => {
    const roh = 'one\n\ntwo  three';
    const lang = `lantern ${'alpha '.repeat(40)}tailmarker`;
    const treffer = formeTreffer(
      [zeile(1, roh, '2026-10-01T00:00:00.000Z'), zeile(2, lang, '2026-10-15T00:00:00.000Z')],
      5,
    );
    expect(treffer.map((eintrag) => eintrag.id)).toEqual([2, 1]);
    expect(treffer[0]?.text).toBe(lang);
    expect(treffer[1]?.text).toBe(roh);
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
    expect(treffer[2]?.text.includes('tailmarker')).toBe(true);
    expect(treffer[2]?.text.endsWith('...')).toBe(false);
  });
});
