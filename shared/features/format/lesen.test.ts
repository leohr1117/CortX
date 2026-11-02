import { describe, expect, it } from 'vitest';
import { leseBaum } from './index.ts';

describe('reading format', () => {
  it('turns a line that starts with "- " into a list', () => {
    expect(leseBaum('- milk\n- bread')).toEqual([
      {
        art: 'liste',
        punkte: [
          [{ art: 'text', text: 'milk' }],
          [{ art: 'text', text: 'bread' }],
        ],
      },
    ]);
    expect(leseBaum('-item\n - milk')).toEqual([
      {
        art: 'absatz',
        zeilen: [[{ art: 'text', text: '-item' }], [{ art: 'text', text: ' - milk' }]],
      },
    ]);
  });

  it('marks an open checkbox and a checked one', () => {
    expect(leseBaum('[] call\n[x] sent\n[x]now')).toEqual([
      {
        art: 'haken',
        punkte: [
          { abgehakt: false, teile: [{ art: 'text', text: 'call' }] },
          { abgehakt: true, teile: [{ art: 'text', text: 'sent' }] },
          { abgehakt: true, teile: [{ art: 'text', text: 'now' }] },
        ],
      },
    ]);
    expect(leseBaum('[X] no\n[ ] no')).toEqual([
      {
        art: 'absatz',
        zeilen: [[{ art: 'text', text: '[X] no' }], [{ art: 'text', text: '[ ] no' }]],
      },
    ]);
  });

  it('marks bold text and leaves a broken marker as text', () => {
    expect(leseBaum('see **Anna** now')).toEqual([
      {
        art: 'absatz',
        zeilen: [
          [
            { art: 'text', text: 'see ' },
            { art: 'fett', text: 'Anna' },
            { art: 'text', text: ' now' },
          ],
        ],
      },
    ]);
    expect(leseBaum('a ** alone')).toEqual([
      { art: 'absatz', zeilen: [[{ art: 'text', text: 'a ** alone' }]] },
    ]);
    expect(leseBaum('****')).toEqual([{ art: 'absatz', zeilen: [[{ art: 'text', text: '****' }]] }]);
    expect(leseBaum('**a**b**c**')).toEqual([
      {
        art: 'absatz',
        zeilen: [
          [
            { art: 'fett', text: 'a' },
            { art: 'text', text: 'b' },
            { art: 'fett', text: 'c' },
          ],
        ],
      },
    ]);
    expect(leseBaum('see **mil')).toEqual([
      { art: 'absatz', zeilen: [[{ art: 'text', text: 'see **mil' }]] },
    ]);
  });

  it('mixes a list, checkboxes, and bold in one note', () => {
    expect(leseBaum('Hello\n- **buy** milk\n[] **call**\n[x] done\n\nNext')).toEqual([
      { art: 'absatz', zeilen: [[{ art: 'text', text: 'Hello' }]] },
      {
        art: 'liste',
        punkte: [
          [
            { art: 'fett', text: 'buy' },
            { art: 'text', text: ' milk' },
          ],
        ],
      },
      {
        art: 'haken',
        punkte: [
          { abgehakt: false, teile: [{ art: 'fett', text: 'call' }] },
          { abgehakt: true, teile: [{ art: 'text', text: 'done' }] },
        ],
      },
      { art: 'absatz', zeilen: [[], [{ art: 'text', text: 'Next' }]] },
    ]);
    expect(leseBaum('- **milk** and bread\r\n- eggs')).toEqual([
      {
        art: 'liste',
        punkte: [
          [
            { art: 'fett', text: 'milk' },
            { art: 'text', text: ' and bread' },
          ],
          [{ art: 'text', text: 'eggs' }],
        ],
      },
    ]);
  });

  it('keeps html-like text and #topic tags as text', () => {
    expect(leseBaum('<b>hi</b> #work\n<script>alert(1)</script>\n**#shop** **<em>x</em>**')).toEqual([
      {
        art: 'absatz',
        zeilen: [
          [{ art: 'text', text: '<b>hi</b> #work' }],
          [{ art: 'text', text: '<script>alert(1)</script>' }],
          [
            { art: 'fett', text: '#shop' },
            { art: 'text', text: ' ' },
            { art: 'fett', text: '<em>x</em>' },
          ],
        ],
      },
    ]);
  });
});
