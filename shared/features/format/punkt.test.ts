import { describe, expect, it } from 'vitest';
import { seitentitel } from '../seiten/text.ts';
import { aktivListe } from './aktiv.ts';
import { leseBaum, leseDokument } from './index.ts';
import { punktArt } from './punkt.ts';
import { suchtext } from './suchtext.ts';

describe('list enter', () => {
  it('reads a phone line break as enter and a soft break as its own key', () => {
    expect(punktArt('insertParagraph', null)).toBe('enter');
    expect(punktArt('insertLineBreak', null)).toBe('umbruch');
    expect(punktArt('insertText', '\n')).toBe('enter');
    expect(punktArt('insertText', '\r\n')).toBe('enter');
    expect(punktArt('insertText', 'a')).toBeNull();
    expect(punktArt('deleteContentBackward', null)).toBe('zurueck');
    expect(punktArt('insertCompositionText', '\n')).toBeNull();
  });

  it('reads a wrapped bullet and a numbered line as text after the marker', () => {
    expect(leseBaum('- milk\n  world\n- bread')).toEqual([
      {
        art: 'liste',
        punkte: [
          [
            { art: 'text', text: 'milk' },
            { art: 'text', text: '\n' },
            { art: 'text', text: 'world' },
          ],
          [{ art: 'text', text: 'bread' }],
        ],
      },
    ]);
    expect(leseBaum('- milk\n world')).toEqual([
      { art: 'liste', punkte: [[{ art: 'text', text: 'milk' }]] },
      { art: 'absatz', zeilen: [[{ art: 'text', text: ' world' }]] },
    ]);
    expect(leseBaum('[] call\n   later')).toEqual([
      {
        art: 'haken',
        punkte: [
          {
            abgehakt: false,
            teile: [
              { art: 'text', text: 'call' },
              { art: 'text', text: '\n' },
              { art: 'text', text: 'later' },
            ],
          },
        ],
      },
    ]);
    expect(leseBaum('1. milk\n   more')).toEqual([
      { art: 'liste', geordnet: true, punkte: [[{ art: 'text', text: 'milk' }]] },
      { art: 'absatz', zeilen: [[{ art: 'text', text: '   more' }]] },
    ]);
  });

  it('keeps the list button on the first line only', () => {
    const text = '- milk\n  world';
    const beleg = leseDokument(text).belege.find((eintrag) => eintrag.art === 'liste');
    expect(beleg?.bisZeile).toBe(6);
    expect(beleg?.folgeBis).toBe(text.length);
    expect(aktivListe(text, 4, 4)).toBe(true);
    expect(aktivListe(text, 10, 10)).toBe(false);
  });

  it('keeps a page title on the first line and still finds both lines in search', () => {
    expect(seitentitel('- milk\n  world')).toBe('milk');
    expect(suchtext('- milk\n  world')).toBe('milk\nworld');
    expect(suchtext('- milk\n world')).toBe('milk\n world');
  });
});
