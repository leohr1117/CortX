import { describe, expect, it } from 'vitest';
import { schalteUeberschrift, zeileIstUeberschrift } from './index.ts';

describe('heading toggle', () => {
  it('marks the line at the cursor and clears it again', () => {
    const an = schalteUeberschrift('Title', 2, 2);
    expect(an).toEqual({ text: '= Title', start: 4, ende: 4 });
    expect(zeileIstUeberschrift(an.text, an.start)).toBe(true);
    expect(schalteUeberschrift(an.text, an.start, an.ende)).toEqual({ text: 'Title', start: 2, ende: 2 });
  });

  it('changes only the line that holds the cursor', () => {
    const text = 'one\ntwo\n- milk\n[] call\n**bold**\n#work';
    const zweite = schalteUeberschrift(text, 5, 6);
    expect(zweite.text).toBe('one\n= two\n- milk\n[] call\n**bold**\n#work');
    expect(zweite).toMatchObject({ start: 7, ende: 8 });
    expect(zeileIstUeberschrift(zweite.text, 0)).toBe(false);
    expect(zeileIstUeberschrift(zweite.text, 4)).toBe(true);
    expect(zeileIstUeberschrift(zweite.text, 3)).toBe(false);

    const liste = schalteUeberschrift(text, text.indexOf('- milk'), text.indexOf('- milk'));
    expect(liste.text).toBe('one\ntwo\n= - milk\n[] call\n**bold**\n#work');
    const haken = schalteUeberschrift(text, text.indexOf('[] call'), text.indexOf('[] call'));
    expect(haken.text).toBe('one\ntwo\n- milk\n= [] call\n**bold**\n#work');
    const fett = schalteUeberschrift(text, text.indexOf('**bold**'), text.indexOf('**bold**'));
    expect(fett.text).toBe('one\ntwo\n- milk\n[] call\n= **bold**\n#work');
    const tag = schalteUeberschrift(text, text.indexOf('#work'), text.indexOf('#work'));
    expect(tag.text).toBe('one\ntwo\n- milk\n[] call\n**bold**\n= #work');
    expect(zeileIstUeberschrift('#work', 0)).toBe(false);
    expect(zeileIstUeberschrift('=Title', 0)).toBe(false);
  });

  it('keeps the carriage return and a selection that crosses the line', () => {
    expect(schalteUeberschrift('ab\r\ncd', 0, 0)).toEqual({ text: '= ab\r\ncd', start: 2, ende: 2 });
    expect(schalteUeberschrift('ab\r\ncd', 4, 5)).toEqual({ text: 'ab\r\n= cd', start: 6, ende: 7 });
    expect(schalteUeberschrift('one\ntwo', 1, 5)).toEqual({ text: '= one\ntwo', start: 3, ende: 7 });
    expect(schalteUeberschrift('= one', 0, 5)).toEqual({ text: 'one', start: 0, ende: 3 });
    expect(schalteUeberschrift('= Title', 1, 1)).toEqual({ text: 'Title', start: 0, ende: 0 });
  });

  it('clamps a cursor that falls outside the text', () => {
    expect(schalteUeberschrift('ab', -5, 100)).toEqual({ text: '= ab', start: 2, ende: 4 });
    expect(schalteUeberschrift('', Number.NaN, Number.NaN)).toEqual({ text: '= ', start: 2, ende: 2 });
    expect(schalteUeberschrift('ab\n', 3, 1)).toEqual({ text: '= ab\n', start: 3, ende: 5 });
  });
});
