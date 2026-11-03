import { describe, expect, it } from 'vitest';
import { INBOX_NAME } from '../../kern/grenzen.ts';
import type { Thema } from '../../kern/modell.ts';
import type { SeiteKurz } from './pfad.ts';
import { setzeVorschlag, zielAmCursor } from './zielvorschlag.ts';

const themen: Thema[] = [
  { name: 'Work', count: 14 },
  { name: 'Workout', count: 6 },
  { name: 'Home', count: 2 },
  { name: 'Deutsch LK', count: 3 },
  { name: INBOX_NAME, count: 1 },
];

const seiten: SeiteKurz[] = [
  { id: 4, topic: 'Deutsch LK', titel: 'Grammatik', abschnitte: ['Aufsatz'] },
  { id: 9, topic: 'Deutsch LK', titel: 'Grammatik', abschnitte: ['Faelle', 'Zeiten'] },
  { id: 2, topic: 'Home', titel: 'Kitchen', abschnitte: ['List'] },
];

describe('target suggestions at the caret', () => {
  it('offers topics in count order and keeps the new row out of the list', () => {
    const text = 'Remember #wo';
    const ziel = zielAmCursor(text, text.length, themen, seiten);
    expect(ziel?.liste?.treffer.map((eintrag) => eintrag.name)).toEqual(['Work', 'Workout']);
    expect(ziel?.liste?.treffer.map((eintrag) => eintrag.zahl)).toEqual(['14', '6']);
    expect(ziel?.liste?.neu).toBe(true);
    expect(ziel?.liste?.neuText).toBe('New topic \u201Cwo\u201D');
    expect(ziel?.liste?.gewaehlt).toBe(0);
    expect(ziel?.fragment).toBe('wo');
    const zeile = zielAmCursor('#wo', 3, themen, seiten);
    expect(zeile?.liste?.treffer.map((eintrag) => eintrag.name)).toEqual(['Work', 'Workout']);
  });

  it('inserts the chosen topic and then stays closed for that path', () => {
    const text = 'Remember #wo';
    const ziel = zielAmCursor(text, text.length, themen, seiten);
    const neu = setzeVorschlag(text, text.length, 'Workout');
    expect(neu).toEqual({ text: 'Remember #Workout', caret: 'Remember #Workout'.length });
    if (!neu || !ziel) throw new Error('missing suggestion');
    const zu = `${ziel.tag.start}:${neu.text.slice(ziel.tag.start + 1, neu.caret)}`;
    expect(zielAmCursor(neu.text, neu.caret, themen, seiten, zu)?.liste).toBeNull();
  });

  it('replaces only the segment under the caret', () => {
    const text = '#deutsch-lk/gra';
    const imThema = 5;
    const thema = zielAmCursor(text, imThema, themen, seiten);
    expect(thema?.fragment).toBe('deutsch-lk');
    expect(thema?.liste?.treffer.map((eintrag) => eintrag.name)).toEqual(['Deutsch LK']);
    expect(setzeVorschlag(text, imThema, 'Deutsch-LK')).toEqual({
      text: '#Deutsch-LK/gra',
      caret: '#Deutsch-LK/gra'.length,
    });
    const inSeite = text.length;
    const seite = zielAmCursor(text, inSeite, themen, seiten);
    expect(seite?.liste?.treffer.map((eintrag) => eintrag.name)).toEqual(['Grammatik', 'Grammatik']);
    expect(seite?.liste?.neu).toBe(true);
    expect(seite?.liste?.gewaehlt).toBe(seite?.liste?.treffer.length);
    expect(seite?.liste?.neuText).toBe('New page \u201Cgra\u201D');
    expect(setzeVorschlag(text, inSeite, 'Grammatik')).toEqual({
      text: '#deutsch-lk/Grammatik',
      caret: '#deutsch-lk/Grammatik'.length,
    });
  });

  it('suggests a section and leaves a caret outside the path alone', () => {
    const text = '#deutsch-lk/grammatik/zei Verb';
    const caret = '#deutsch-lk/grammatik/zei'.length;
    const ziel = zielAmCursor(text, caret, themen, seiten);
    expect(ziel?.liste?.treffer.map((eintrag) => eintrag.name)).toEqual(['Zeiten']);
    expect(ziel?.liste?.neuText).toBe('New section \u201Czei\u201D');
    expect(setzeVorschlag(text, caret, 'Zeiten')?.text).toBe('#deutsch-lk/grammatik/Zeiten Verb');
    expect(zielAmCursor(text, text.length, themen, seiten)).toBeNull();
    expect(zielAmCursor('#wo', 0, themen, seiten)).toBeNull();
    expect(setzeVorschlag('Buy milk', 3, 'Work')).toBeNull();
  });

  it('hides the list when that path was dismissed or the path is too deep', () => {
    const text = '#wo';
    const ziel = zielAmCursor(text, text.length, themen, seiten);
    expect(zielAmCursor(text, text.length, themen, seiten, ziel?.schluessel)?.liste).toBeNull();
    expect(zielAmCursor('#a/b/c/d', '#a/b/c/d'.length, themen, seiten)?.liste).toBeNull();
  });
});
