import { describe, expect, it } from 'vitest';
import { tagMarken } from './marken.ts';

describe('tag marks', () => {
  it('colors the tag under the caret and keeps a slash in the finder range', () => {
    expect(tagMarken('See #school/math', 6)).toEqual([{ start: 4, end: 16, hier: true }]);
    expect(tagMarken('#school/math', 8)).toEqual([{ start: 0, end: 12, hier: true }]);
    expect(tagMarken('Say #', 5)).toEqual([{ start: 4, end: 5, hier: true }]);
  });
});
