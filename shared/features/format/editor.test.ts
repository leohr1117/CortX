import { describe, expect, it } from 'vitest';
import {
  schalteCode,
  schalteHaken,
  schalteKopf,
  schalteListe,
  schalteVerknuepfung,
  schalteWichtig,
} from './index.ts';

describe('editor commands', () => {
  it('wraps a code span at the cursor and removes a fence only when the selection holds a line break', () => {
    const zaun = '```\nhello\n```';
    const imWort = schalteCode(zaun, 4, 9);
    expect(imWort.text).toBe('```\n`hello`\n```');
    const amCursor = schalteCode(zaun, 4, 4);
    expect(amCursor.text).toBe('```\n``hello\n```');
    expect(amCursor.start).toBe(5);
    const weg = schalteCode(zaun, 0, zaun.length);
    expect(weg).toEqual({ text: 'hello', start: 0, ende: 5 });
  });

  it('clears a star, a plus, and a number with the list command', () => {
    expect(schalteListe('* milk', 2, 2).text).toBe('milk');
    expect(schalteListe('+ milk', 2, 2).text).toBe('milk');
    expect(schalteListe('12. milk', 4, 4)).toEqual({ text: 'milk', start: 0, ende: 0 });
    expect(schalteListe('milk\r', 0, 4).text).toBe('- milk\r');
    expect(schalteListe('milk', 99, 99)).toEqual({ text: '- milk', start: 6, ende: 6 });
  });

  it('clears a box, a checked box, and a task line with the checklist command', () => {
    expect(schalteHaken('[]todo', 6, 6).text).toBe('todo');
    expect(schalteHaken('[x] done', 8, 8).text).toBe('done');
    expect(schalteHaken('- [x] buy', 9, 9).text).toBe('buy');
  });

  it('marks a selection inline and a bare cursor as a whole line', () => {
    expect(schalteWichtig('see Anna', 4, 8).text).toBe('see !!Anna!!');
    expect(schalteWichtig('Milk', 4, 4)).toEqual({ text: '!!!! Milk', start: 9, ende: 9 });
    expect(schalteWichtig('', 0, 0).text).toBe('!!!! ');
    expect(schalteWichtig('!!Anna!!', 4, 4).text).toBe('Anna');
    expect(schalteWichtig('!!!! Milk', 5, 9)).toEqual({ text: 'Milk', start: 0, ende: 4 });
  });

  it('inserts a link without checking the address and marks only the current line', () => {
    expect(schalteVerknuepfung('see ', 4, 4, 'https://a.test').text).toBe('see [https://a.test](https://a.test)');
    expect(schalteVerknuepfung('x', 0, 1, 'javascript:alert(1)').text).toBe('[x](javascript:alert(1))');
    expect(schalteKopf('one\ntwo', 4, 7).text).toBe('one\n= two');
  });
});
