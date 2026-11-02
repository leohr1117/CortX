import { describe, expect, it } from 'vitest';
import { belege, leseBaum, schalteWichtig, suchtext } from './index.ts';

describe('wichtig', () => {
  it('marks words between !! when the opening pair is allowed', () => {
    expect(leseBaum('!!Text!!')).toEqual([
      { art: 'absatz', zeilen: [[{ art: 'wichtig', text: 'Text' }]] },
    ]);
    expect(leseBaum(' !!Text!!')).toEqual([
      {
        art: 'absatz',
        zeilen: [[{ art: 'text', text: ' ' }, { art: 'wichtig', text: 'Text' }]],
      },
    ]);
    expect(leseBaum('(!!Text!!)')).toEqual([
      {
        art: 'absatz',
        zeilen: [
          [
            { art: 'text', text: '(' },
            { art: 'wichtig', text: 'Text' },
            { art: 'text', text: ')' },
          ],
        ],
      },
    ]);
    expect(leseBaum('see !!Anna!! now')).toEqual([
      {
        art: 'absatz',
        zeilen: [
          [
            { art: 'text', text: 'see ' },
            { art: 'wichtig', text: 'Anna' },
            { art: 'text', text: ' now' },
          ],
        ],
      },
    ]);
    expect(leseBaum('!!**Anna**!!')).toEqual([
      { art: 'absatz', zeilen: [[{ art: 'wichtig', teile: [{ art: 'fett', text: 'Anna' }] }]] },
    ]);
    expect(leseBaum('!!a!! and !!b!!')).toEqual([
      {
        art: 'absatz',
        zeilen: [
          [
            { art: 'wichtig', text: 'a' },
            { art: 'text', text: ' and ' },
            { art: 'wichtig', text: 'b' },
          ],
        ],
      },
    ]);
  });

  it('leaves the named sentences and a word-internal pair as text', () => {
    for (const text of ['Super!! Und dann toll!!', 'Wow!!', 'Hallo!! Wie gehts!!', 'a!!b!!', '"!!Text!!"', ',!!Text!!']) {
      expect(leseBaum(text)).toEqual([{ art: 'absatz', zeilen: [[{ art: 'text', text }]] }]);
    }
  });

  it('rejects a space directly inside and a line break', () => {
    expect(leseBaum('!! Text!!')).toEqual([{ art: 'absatz', zeilen: [[{ art: 'text', text: '!! Text!!' }]] }]);
    expect(leseBaum('!!Text !!')).toEqual([{ art: 'absatz', zeilen: [[{ art: 'text', text: '!!Text !!' }]] }]);
    expect(leseBaum('!!Text\n!!')).toEqual([
      { art: 'absatz', zeilen: [[{ art: 'text', text: '!!Text' }], [{ art: 'text', text: '!!' }]] },
    ]);
  });

  it('treats an escaped pair as text', () => {
    expect(leseBaum('\\!!')).toEqual([{ art: 'absatz', zeilen: [[{ art: 'text', text: '!!' }]] }]);
    expect(leseBaum('siehe \\!!nicht!!')).toEqual([
      { art: 'absatz', zeilen: [[{ art: 'text', text: 'siehe !!nicht!!' }]] },
    ]);
    expect(leseBaum('!!nicht\\!!')).toEqual([
      { art: 'absatz', zeilen: [[{ art: 'text', text: '!!nicht!!' }]] },
    ]);
  });

  it('lets image syntax win over an opening pair', () => {
    expect(leseBaum('!![alt](https://example.com/a.png)')).toEqual([
      { art: 'absatz', zeilen: [[{ art: 'text', text: '!![alt](https://example.com/a.png)' }]] },
    ]);
    expect(leseBaum('!![')).toEqual([{ art: 'absatz', zeilen: [[{ art: 'text', text: '!![' }]] }]);
    expect(leseBaum('![pic](https://example.com/a.png)')).toEqual([
      { art: 'absatz', zeilen: [[{ art: 'text', text: '![pic](https://example.com/a.png)' }]] },
    ]);
  });

  it('leaves pairs inside code spans and code blocks as text', () => {
    expect(leseBaum('say `!!not!!` and `!!!! `')).toEqual([
      {
        art: 'absatz',
        zeilen: [
          [
            { art: 'text', text: 'say ' },
            { art: 'code', text: '!!not!!' },
            { art: 'text', text: ' and ' },
            { art: 'code', text: '!!!! ' },
          ],
        ],
      },
    ]);
    expect(leseBaum('```\n!!not!!\n!!!! line\n```')).toEqual([{ art: 'codeblock', text: '!!not!!\n!!!! line' }]);
  });

  it('marks a whole line that starts with four bangs and a space', () => {
    expect(leseBaum('!!!! Bring milk')).toEqual([
      { art: 'wichtig', teile: [{ art: 'text', text: 'Bring milk' }] },
    ]);
    expect(leseBaum('!!!! !!Anna!!')).toEqual([
      { art: 'wichtig', teile: [{ art: 'wichtig', text: 'Anna' }] },
    ]);
    expect(leseBaum('!!!!')).toEqual([{ art: 'absatz', zeilen: [[{ art: 'text', text: '!!!!' }]] }]);
    expect(leseBaum(' !!!! no\n!!!!! no')).toEqual([
      { art: 'absatz', zeilen: [[{ art: 'text', text: ' !!!! no' }], [{ art: 'text', text: '!!!!! no' }]] },
    ]);
    expect(leseBaum('!!!! - not a list\n- milk')).toEqual([
      { art: 'wichtig', teile: [{ art: 'text', text: '- not a list' }] },
      { art: 'liste', punkte: [[{ art: 'text', text: 'milk' }]] },
    ]);
  });

  it('keeps lists, checkboxes, bold, headings, and hash tags', () => {
    expect(leseBaum('- milk\n[] call\n[x] done\n**fett**\n= Head\n#topic')).toEqual([
      { art: 'liste', punkte: [[{ art: 'text', text: 'milk' }]] },
      {
        art: 'haken',
        punkte: [
          { abgehakt: false, teile: [{ art: 'text', text: 'call' }] },
          { abgehakt: true, teile: [{ art: 'text', text: 'done' }] },
        ],
      },
      { art: 'absatz', zeilen: [[{ art: 'fett', text: 'fett' }]] },
      { art: 'ueberschrift', teile: [{ art: 'text', text: 'Head' }] },
      { art: 'absatz', zeilen: [[{ art: 'text', text: '#topic' }]] },
    ]);
    expect(leseBaum('= !!Anna!!\n- !!milk!!\n[] !!call!!')).toEqual([
      { art: 'ueberschrift', teile: [{ art: 'wichtig', text: 'Anna' }] },
      { art: 'liste', punkte: [[{ art: 'wichtig', text: 'milk' }]] },
      { art: 'haken', punkte: [{ abgehakt: false, teile: [{ art: 'wichtig', text: 'call' }] }] },
    ]);
    expect(leseBaum('!!!! #topic')).toEqual([{ art: 'wichtig', teile: [{ art: 'text', text: '#topic' }] }]);
    expect(leseBaum('<script>alert(1)</script>\n!!<em>x</em>!!')).toEqual([
      {
        art: 'absatz',
        zeilen: [
          [{ art: 'text', text: '<script>alert(1)</script>' }],
          [{ art: 'wichtig', text: '<em>x</em>' }],
        ],
      },
    ]);
  });

  it('records source ranges and drops the markers from the plain words', () => {
    const inline = belege('!!A!!').find((eintrag) => eintrag.art === 'wichtig');
    expect(inline).toMatchObject({ von: 2, bis: 3, ganzVon: 0, ganzBis: 5, marker: [[0, 2], [3, 5]] });
    const zeile = belege('!!!! A').find((eintrag) => eintrag.art === 'wichtig' && eintrag.marker.length === 1);
    expect(zeile).toMatchObject({ von: 5, bis: 6, ganzVon: 0, ganzBis: 6, marker: [[0, 5]] });
    expect(suchtext('!!Anna!!\n!!!! milk\n**fett**')).toBe('Anna\nmilk\nfett');
  });

  it('toggles words and a whole line from the cursor', () => {
    const woerter = schalteWichtig('see Anna now', 4, 8);
    expect(woerter).toEqual({ text: 'see !!Anna!! now', start: 6, ende: 10 });
    expect(schalteWichtig(woerter.text, woerter.start, woerter.ende).text).toBe('see Anna now');
    const zeile = schalteWichtig('Milk', 4, 4);
    expect(zeile).toEqual({ text: '!!!! Milk', start: 9, ende: 9 });
    expect(schalteWichtig(zeile.text, 7, 7).text).toBe('Milk');
    expect(schalteWichtig('!!Anna!!', 2, 6).text).toBe('Anna');
  });
});
