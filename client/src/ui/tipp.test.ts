import { describe, expect, test } from 'vitest';
import { istTipp, wiederholung } from './tipp.ts';

describe('istTipp', () => {
  const start = { x: 40, y: 200, scroll: 0 };

  test('a short finger lift is a tap', () => {
    expect(istTipp(start, { x: 44, y: 206, scroll: 0, maus: false })).toBe(true);
  });

  test('a mouse event is not a finger tap', () => {
    expect(istTipp(start, { x: 40, y: 200, scroll: 0, maus: true })).toBe(false);
  });

  test('a drag or a scroll is not a tap', () => {
    expect(istTipp(start, { x: 40, y: 230, scroll: 0, maus: false })).toBe(false);
    expect(istTipp(start, { x: 40, y: 200, scroll: 30, maus: false })).toBe(false);
    expect(istTipp(null, { x: 40, y: 200, scroll: 0, maus: false })).toBe(false);
  });
});

describe('wiederholung', () => {
  test('the first click counts and a second one in the same moment does not', () => {
    const ziel = {};
    expect(wiederholung(ziel, 1_000)).toBe(false);
    expect(wiederholung(ziel, 1_400)).toBe(true);
    expect(wiederholung(ziel, 2_000)).toBe(false);
  });

  test('another row keeps its own click', () => {
    const erste = {};
    const zweite = {};
    expect(wiederholung(erste, 5_000)).toBe(false);
    expect(wiederholung(zweite, 5_100)).toBe(false);
  });
});
