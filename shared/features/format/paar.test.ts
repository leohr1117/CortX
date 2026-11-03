import { describe, expect, it } from 'vitest';
import { loeschePaar } from './register.ts';

describe('formatting pairs', () => {
  it('drops both stars when the closing one is deleted', () => {
    expect(loeschePaar('*test*', 5, 6)).toEqual({ text: 'test', start: 4, ende: 4 });
  });

  it('drops both stars when the opening one is deleted', () => {
    expect(loeschePaar('*test*', 0, 1)).toEqual({ text: 'test', start: 0, ende: 0 });
  });

  it('drops a whole bold pair when one star at the end is deleted', () => {
    expect(loeschePaar('**x**', 4, 5)).toEqual({ text: 'x', start: 1, ende: 1 });
    expect(loeschePaar('**x**', 3, 4)).toEqual({ text: 'x', start: 1, ende: 1 });
  });

  it('uses the same command for every inline pair', () => {
    expect(loeschePaar('~~x~~', 4, 5)).toEqual({ text: 'x', start: 1, ende: 1 });
    expect(loeschePaar('!!x!!', 4, 5)).toEqual({ text: 'x', start: 1, ende: 1 });
    expect(loeschePaar('`x`', 2, 3)).toEqual({ text: 'x', start: 1, ende: 1 });
    expect(loeschePaar('_x_', 2, 3)).toEqual({ text: 'x', start: 1, ende: 1 });
    expect(loeschePaar('__x__', 4, 5)).toEqual({ text: 'x', start: 1, ende: 1 });
  });

  it('leaves the words and a nested pair in place', () => {
    expect(loeschePaar('*test*', 2, 3)).toBeNull();
    expect(loeschePaar('**a *b* c**', 6, 7)).toEqual({ text: '**a b c**', start: 5, ende: 5 });
    expect(loeschePaar('**a *b* c**', 10, 11)).toEqual({ text: 'a *b* c', start: 7, ende: 7 });
    expect(loeschePaar('***Test***', 9, 10)?.text).toContain('Test');
  });

  it('ignores a line marker, a link, a list star, and a broken pair', () => {
    expect(loeschePaar('!!!! A', 0, 1)).toBeNull();
    expect(loeschePaar('[a](https://a.test)', 2, 3)).toBeNull();
    expect(loeschePaar('* milk', 0, 1)).toBeNull();
    expect(loeschePaar('*test', 0, 1)).toBeNull();
    expect(loeschePaar('hello', 4, 5)).toBeNull();
    expect(loeschePaar('```\nx\n```', 0, 1)).toBeNull();
  });
});
