import { describe, expect, it } from 'vitest';
import {
  belege,
  leseBaum,
  liegtInCode,
  schalteCode,
  schalteFett,
  schalteHaken,
  schalteKursiv,
  schalteListe,
  schalteStrich,
  schalteVerknuepfung,
  sicherZiel,
  suchtext,
  wandleKuerzel,
} from './index.ts';

describe('markdown beside the existing notation', () => {
  it('keeps a hash at the start of a line as text', () => {
    expect(leseBaum('# Title\n#work\n= Real')).toEqual([
      {
        art: 'absatz',
        zeilen: [[{ art: 'text', text: '# Title' }], [{ art: 'text', text: '#work' }]],
      },
      { art: 'ueberschrift', teile: [{ art: 'text', text: 'Real' }] },
    ]);
  });

  it('reads italic, strike, and underscore bold without a second syntax for stars', () => {
    expect(leseBaum('*Anna* and _Bea_ and __Cara__ and ~~Dan~~')).toEqual([
      {
        art: 'absatz',
        zeilen: [
          [
            { art: 'kursiv', text: 'Anna' },
            { art: 'text', text: ' and ' },
            { art: 'kursiv', text: 'Bea' },
            { art: 'text', text: ' and ' },
            { art: 'fett', text: 'Cara' },
            { art: 'text', text: ' and ' },
            { art: 'streich', text: 'Dan' },
          ],
        ],
      },
    ]);
    expect(leseBaum('a_b_c')).toEqual([{ art: 'absatz', zeilen: [[{ art: 'text', text: 'a_b_c' }]] }]);
    expect(leseBaum('****')).toEqual([{ art: 'absatz', zeilen: [[{ art: 'text', text: '****' }]] }]);
    expect(leseBaum('**a*')).toEqual([
      {
        art: 'absatz',
        zeilen: [[{ art: 'text', text: '*' }, { art: 'kursiv', text: 'a' }]],
      },
    ]);
  });

  it('leaves markdown inside code spans and code blocks as text', () => {
    expect(leseBaum('say `**not** = #tag`')).toEqual([
      {
        art: 'absatz',
        zeilen: [
          [
            { art: 'text', text: 'say ' },
            { art: 'code', text: '**not** = #tag' },
          ],
        ],
      },
    ]);
    expect(leseBaum('```\n**not**\n= no\n#nope\n```')).toEqual([
      { art: 'codeblock', text: '**not**\n= no\n#nope' },
    ]);
    expect(leseBaum('```js\nconst a = 1\n```')).toEqual([{ art: 'codeblock', text: 'const a = 1' }]);
  });

  it('reads links, lists, and task lines', () => {
    expect(leseBaum('see [Anna](https://example.com/a) now')).toEqual([
      {
        art: 'absatz',
        zeilen: [
          [
            { art: 'text', text: 'see ' },
            { art: 'link', teile: [{ art: 'text', text: 'Anna' }], ziel: 'https://example.com/a' },
            { art: 'text', text: ' now' },
          ],
        ],
      },
    ]);
    expect(leseBaum('![pic](https://example.com/a.png)')).toEqual([
      { art: 'absatz', zeilen: [[{ art: 'text', text: '![pic](https://example.com/a.png)' }]] },
    ]);
    expect(leseBaum('* milk\n+ bread\n1. eggs\n2. tea')).toEqual([
      {
        art: 'liste',
        punkte: [[{ art: 'text', text: 'milk' }], [{ art: 'text', text: 'bread' }]],
      },
      {
        art: 'liste',
        geordnet: true,
        punkte: [[{ art: 'text', text: 'eggs' }], [{ art: 'text', text: 'tea' }]],
      },
    ]);
    expect(leseBaum('- [ ] open\n- [x] done\n* [x] too')).toEqual([
      {
        art: 'haken',
        punkte: [
          { abgehakt: false, teile: [{ art: 'text', text: 'open' }] },
          { abgehakt: true, teile: [{ art: 'text', text: 'done' }] },
          { abgehakt: true, teile: [{ art: 'text', text: 'too' }] },
        ],
      },
    ]);
  });

  it('records source ranges for bold markers', () => {
    const fett = belege('**A**').find((eintrag) => eintrag.art === 'fett');
    expect(fett).toMatchObject({ von: 2, bis: 3, ganzVon: 0, ganzBis: 5, marker: [[0, 2], [3, 5]] });
  });

  it('flattens visible words for a later index', () => {
    expect(suchtext('= **Anna**\n- milk\n`code`')).toBe('Anna\nmilk\ncode');
  });
});

describe('safe link targets', () => {
  it('allows http, https, and mailto', () => {
    expect(sicherZiel('https://example.com/a')).toBe('https://example.com/a');
    expect(sicherZiel('http://example.com')).toBe('http://example.com');
    expect(sicherZiel('mailto:a@b.c')).toBe('mailto:a@b.c');
  });

  it('rejects script, data, and broken targets', () => {
    expect(sicherZiel('javascript:alert(1)')).toBeNull();
    expect(sicherZiel('JAVASCRIPT:alert(1)')).toBeNull();
    expect(sicherZiel('data:text/html,hi')).toBeNull();
    expect(sicherZiel('vbscript:msg')).toBeNull();
    expect(sicherZiel('https://example.com/?q="x"')).toBeNull();
    expect(sicherZiel('https://ex ample.com')).toBeNull();
  });
});

describe('format commands', () => {
  it('wraps bold and italic without eating a bold marker', () => {
    const fett = schalteFett('Anna', 0, 4);
    expect(fett).toEqual({ text: '**Anna**', start: 2, ende: 6 });
    expect(schalteFett(fett.text, fett.start, fett.ende)).toEqual({ text: 'Anna', start: 0, ende: 4 });
    const kursiv = schalteKursiv('**Anna**', 2, 6);
    expect(kursiv.text).toBe('***Anna***');
    expect(kursiv.text.includes('**')).toBe(true);
  });

  it('toggles strike, list, checklist, link, and code', () => {
    expect(schalteStrich('Dan', 0, 3).text).toBe('~~Dan~~');
    const liste = schalteListe('milk', 0, 4);
    expect(liste.text).toBe('- milk');
    expect(schalteListe(liste.text, 2, 2).text).toBe('milk');
    const haken = schalteHaken('call', 0, 4);
    expect(haken.text).toBe('[] call');
    expect(schalteHaken(haken.text, 3, 3).text).toBe('call');
    expect(schalteVerknuepfung('Anna', 0, 4, 'https://example.com').text).toBe('[Anna](https://example.com)');
    expect(schalteCode('a', 0, 1).text).toBe('`a`');
    expect(schalteCode('a\nb', 0, 3).text).toBe('```\na\nb\n```');
  });
});

describe('combined formatting', () => {
  it('stacks bold and italic around the same word', () => {
    const gemeinsam = { art: 'fett' as const, teile: [{ art: 'kursiv' as const, text: 'Test' }] };
    expect(leseBaum('***Test***')).toEqual([{ art: 'absatz', zeilen: [[gemeinsam]] }]);
    expect(leseBaum('**_x_**')).toEqual([{ art: 'absatz', zeilen: [[{ art: 'fett', teile: [{ art: 'kursiv', text: 'x' }] }]] }]);
    expect(leseBaum('_**x**_')).toEqual([{ art: 'absatz', zeilen: [[{ art: 'kursiv', teile: [{ art: 'fett', text: 'x' }] }]] }]);
    expect(suchtext('***Test***')).toBe('Test');
  });

  it('stacks strike, wichtig, and a whole line with bold', () => {
    expect(leseBaum('~~**x**~~')).toEqual([
      { art: 'absatz', zeilen: [[{ art: 'streich', teile: [{ art: 'fett', text: 'x' }] }]] },
    ]);
    expect(leseBaum('**!!x!!**')).toEqual([
      { art: 'absatz', zeilen: [[{ art: 'fett', teile: [{ art: 'wichtig', text: 'x' }] }]] },
    ]);
    expect(leseBaum('!!**x**!!')).toEqual([
      { art: 'absatz', zeilen: [[{ art: 'wichtig', teile: [{ art: 'fett', text: 'x' }] }]] },
    ]);
    expect(leseBaum('!!!! **x**')).toEqual([{ art: 'wichtig', teile: [{ art: 'fett', text: 'x' }] }]);
    const innen = belege('***Test***').filter((eintrag) => eintrag.von < eintrag.bis);
    expect(innen.map((eintrag) => eintrag.art).sort()).toEqual(['fett', 'kursiv']);
  });
});

describe('typing shortcuts', () => {
  it('wraps a word and a checkbox, and undo text is the shortcut', () => {
    expect(wandleKuerzel('hello**', 7)).toEqual({ text: '**hello**', start: 9, ende: 9 });
    expect(wandleKuerzel('**hello**', 9)).toBeNull();
    expect(wandleKuerzel('say hello** there', 11)).toEqual({ text: 'say **hello** there', start: 13, ende: 13 });
    expect(wandleKuerzel('[ ]', 3)).toEqual({ text: '[] ', start: 3, ende: 3 });
    expect(wandleKuerzel('see [ ]', 7)).toBeNull();
    expect(wandleKuerzel('hello** ', 7)).toEqual({ text: '**hello** ', start: 9, ende: 9 });
    expect(wandleKuerzel('**hello** ', 10)).toBeNull();
  });

  it('does not rewrite inside code', () => {
    expect(liegtInCode('`hello**`', 7)).toBe(true);
    expect(wandleKuerzel('`hello**`', 8)).toBeNull();
    expect(wandleKuerzel('```\nhello**\n```', 11)).toBeNull();
  });
});
