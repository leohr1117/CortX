import { describe, expect, it } from 'vitest';
import { wandleKuerzel } from './index.ts';

describe('shortcut boundaries', () => {
  it('wraps bold only at the two stars after a word', () => {
    expect(wandleKuerzel('', 0)).toBeNull();
    expect(wandleKuerzel('hello**', 0)).toBeNull();
    expect(wandleKuerzel('hello**', Number.NaN)).toBeNull();
    expect(wandleKuerzel('hello**', -3)).toBeNull();
    expect(wandleKuerzel('hello**', 3)).toBeNull();
    expect(wandleKuerzel('hello**', 7.9)).toEqual({ text: '**hello**', start: 9, ende: 9 });
    expect(wandleKuerzel('hello**', 99)).toEqual({ text: '**hello**', start: 9, ende: 9 });
    expect(wandleKuerzel('(hello**', 8)).toEqual({ text: '**(hello**', start: 10, ende: 10 });
    expect(wandleKuerzel('[hello**', 8)).toEqual({ text: '**[hello**', start: 10, ende: 10 });
    expect(wandleKuerzel('say (hello**', 12)).toEqual({ text: 'say **(hello**', start: 14, ende: 14 });
    expect(wandleKuerzel('a\nhello**', 9)).toEqual({ text: 'a\n**hello**', start: 11, ende: 11 });
    expect(wandleKuerzel('= hello**', 9)).toEqual({ text: '= **hello**', start: 11, ende: 11 });
    expect(wandleKuerzel('hello***', 8)).toBeNull();
    expect(wandleKuerzel('**', 2)).toBeNull();
    expect(wandleKuerzel('hi__', 4)).toBeNull();
    expect(wandleKuerzel('*hi*', 4)).toBeNull();
    expect(wandleKuerzel('tag#1**', 7)).toBeNull();
  });

  it('turns a box only when the line so far is exactly that box', () => {
    expect(wandleKuerzel('x\n[ ]', 5)).toEqual({ text: 'x\n[] ', start: 5, ende: 5 });
    expect(wandleKuerzel('[ ]milk', 3)).toEqual({ text: '[] milk', start: 3, ende: 3 });
    expect(wandleKuerzel('= [ ]', 5)).toBeNull();
    expect(wandleKuerzel('[x]', 3)).toBeNull();
    expect(wandleKuerzel('`[ ]`', 4)).toBeNull();
  });
});
