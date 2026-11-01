import { describe, expect, it } from 'vitest';
import {
  baueEintrag,
  istDauerhaft,
  naechsteSeq,
  ohneEintrag,
  reihenfolge,
  reiheEin,
} from './warteschlange.ts';

describe('offline queue', () => {
  it('keeps one entry per client id and leaves the earlier text', () => {
    const erste = baueEintrag('Buy milk', 'a', 1, '2026-01-01T00:00:00.000Z');
    const queue = reiheEin([], erste);
    const nochmal = reiheEin(queue, baueEintrag('Other', 'a', 2, '2026-01-01T00:00:01.000Z'));
    expect(nochmal).toHaveLength(1);
    expect(nochmal[0]?.text).toBe('Buy milk');
    expect(queue).toHaveLength(1);
  });

  it('sends the queue in order and drops a confirmed note', () => {
    const a = baueEintrag('one', 'a', 2, 't');
    const b = baueEintrag('two', 'b', 1, 't');
    const queue = reiheEin(reiheEin([], a), b);
    expect(reihenfolge(queue).map((eintrag) => eintrag.clientId)).toEqual(['b', 'a']);
    expect(naechsteSeq(queue)).toBe(3);
    expect(ohneEintrag(queue, 'b').map((eintrag) => eintrag.clientId)).toEqual(['a']);
    expect(naechsteSeq([])).toBe(1);
  });

  it('retries network failures and stops on a rejected note', () => {
    expect(istDauerhaft(null)).toBe(false);
    expect(istDauerhaft(500)).toBe(false);
    expect(istDauerhaft(408)).toBe(false);
    expect(istDauerhaft(429)).toBe(false);
    expect(istDauerhaft(400)).toBe(true);
    expect(istDauerhaft(404)).toBe(true);
  });
});
