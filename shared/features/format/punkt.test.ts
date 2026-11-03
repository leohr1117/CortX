import { describe, expect, it } from 'vitest';
import { seitentitel } from '../seiten/text.ts';
import { aktivListe } from './aktiv.ts';
import { leseBaum, leseDokument } from './index.ts';
import { punktArt, punktTaste, type PunktArt } from './register.ts';
import { suchtext } from './suchtext.ts';

function taste(text: string, index: number, art: PunktArt) {
  return punktTaste(text, index, index, art);
}

function erwarte(text: string, index: number, art: PunktArt, neu: string, cursor: number): void {
  expect(taste(text, index, art)).toEqual({ text: neu, start: cursor, ende: cursor });
}

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

  it('adds the same bullet and splits at the cursor', () => {
    erwarte('- a', 3, 'enter', '- a\n- ', 6);
    erwarte('- hello', 5, 'enter', '- hel\n- lo', 8);
    erwarte('* a', 3, 'enter', '* a\n* ', 6);
    erwarte('+ a', 3, 'enter', '+ a\n+ ', 6);
  });

  it('adds an unchecked task and keeps the bullet in front', () => {
    erwarte('[] call', 7, 'enter', '[] call\n[] ', 11);
    erwarte('[x] done', 8, 'enter', '[x] done\n[] ', 12);
    erwarte('- [ ] a', 7, 'enter', '- [ ] a\n- [ ] ', 14);
    erwarte('- [x] a', 7, 'enter', '- [x] a\n- [ ] ', 14);
    erwarte('* [x] a', 7, 'enter', '* [x] a\n* [ ] ', 14);
    erwarte('+ [ ] a', 7, 'enter', '+ [ ] a\n+ [ ] ', 14);
    erwarte('[x]now', 6, 'enter', '[x]now\n[]', 9);
    erwarte('- [x]a', 6, 'enter', '- [x]a\n- [ ]', 12);
  });

  it('ends an empty item from anywhere on that line and clears a carriage return', () => {
    for (const art of ['enter', 'zurueck'] as const) {
      erwarte('- ', 2, art, '', 0);
      erwarte('[] ', 3, art, '', 0);
      erwarte('[x] ', 4, art, '', 0);
      erwarte('[x]', 3, art, '', 0);
      erwarte('- [ ] ', 6, art, '', 0);
      erwarte('- [x] ', 6, art, '', 0);
    }
    erwarte('- a\n- \n- b', 4, 'enter', '- a\n\n- b', 4);
    erwarte('- a\n- \n- b', 6, 'zurueck', '- a\n\n- b', 4);
    erwarte('- \r', 2, 'zurueck', '', 0);
    erwarte('- milk\r', 6, 'enter', '- milk\n- \r', 9);
  });

  it('leaves backspace alone except at the start of an empty item', () => {
    expect(taste('- ', 0, 'zurueck')).toBeNull();
    expect(taste('- milk', 0, 'zurueck')).toBeNull();
    expect(taste('- milk', 2, 'zurueck')).toBeNull();
    expect(taste('- milk', 6, 'zurueck')).toBeNull();
    expect(punktTaste('- milk', 0, 2, 'enter')).toBeNull();
    expect(punktTaste('- milk', 2, 4, 'zurueck')).toBeNull();
  });

  it('breaks inside the item and joins only a matching indent', () => {
    erwarte('- hello', 5, 'umbruch', '- hel\n  lo', 8);
    const bruch = taste('- hello', 5, 'umbruch');
    expect(leseBaum(bruch?.text ?? '')).toEqual([
      {
        art: 'liste',
        punkte: [
          [
            { art: 'text', text: 'hel' },
            { art: 'text', text: '\n' },
            { art: 'text', text: 'lo' },
          ],
        ],
      },
    ]);
    erwarte('- ab\n  ', 7, 'enter', '- ab\n- ', 7);
    erwarte('- ab\n  cd', 8, 'enter', '- ab\n  c\n- d', 11);
    erwarte('- ab\n  cd', 9, 'enter', '- ab\n  cd\n- ', 12);
    erwarte('- ab\n  ', 7, 'zurueck', '- ab\n', 5);
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
  });

  it('keeps the list button on the first line only', () => {
    const text = '- milk\n  world';
    const beleg = leseDokument(text).belege.find((eintrag) => eintrag.art === 'liste');
    expect(beleg?.bisZeile).toBe(6);
    expect(beleg?.folgeBis).toBe(text.length);
    expect(aktivListe(text, 4, 4)).toBe(true);
    expect(aktivListe(text, 10, 10)).toBe(false);
    expect(taste('  world', 3, 'enter')).toBeNull();
  });

  it('ignores numbered lines, plain text, a selection, and text inside a fence', () => {
    expect(taste('1. item', 7, 'enter')).toBeNull();
    expect(taste('hello', 5, 'enter')).toBeNull();
    expect(taste('*test*', 6, 'enter')).toBeNull();
    expect(taste('*test*', 0, 'zurueck')).toBeNull();
    expect(punktTaste('1. milk', 0, 3, 'enter')).toBeNull();
    const zaun = '```\n- a\n```';
    expect(taste(zaun, 7, 'enter')).toBeNull();
    expect(taste(zaun, 6, 'umbruch')).toBeNull();
    expect(taste(zaun, 6, 'zurueck')).toBeNull();
    expect(leseBaum('1. milk\n   more')).toEqual([
      { art: 'liste', geordnet: true, punkte: [[{ art: 'text', text: 'milk' }]] },
      { art: 'absatz', zeilen: [[{ art: 'text', text: '   more' }]] },
    ]);
  });

  it('keeps a page title on the first line and still finds both lines in search', () => {
    expect(seitentitel('- milk\n  world')).toBe('milk');
    expect(suchtext('- milk\n  world')).toBe('milk\nworld');
    expect(suchtext('- milk\n world')).toBe('milk\n world');
  });
});
