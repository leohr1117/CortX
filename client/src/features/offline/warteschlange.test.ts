import { describe, expect, it } from 'vitest';
import {
  baueEintrag,
  istDauerhaft,
  naechsteSeq,
  reihenfolge,
} from './warteschlange.ts';

describe('offline queue', () => {
  it('sends the queue in order', () => {
    const a = baueEintrag('one', 'a', 2, 't');
    const b = baueEintrag('two', 'b', 1, 't');
    const queue = [a, b];
    expect(reihenfolge(queue).map((eintrag) => eintrag.clientId)).toEqual(['b', 'a']);
    expect(naechsteSeq(queue)).toBe(3);
    expect(naechsteSeq([])).toBe(1);
  });

  it('retries a network failure and a signed-out request, and stops on a rejected note', () => {
    expect(istDauerhaft(null)).toBe(false);
    expect(istDauerhaft(500)).toBe(false);
    expect(istDauerhaft(408)).toBe(false);
    expect(istDauerhaft(429)).toBe(false);
    expect(istDauerhaft(401)).toBe(false);
    expect(istDauerhaft(400)).toBe(true);
    expect(istDauerhaft(404)).toBe(true);
  });
});
