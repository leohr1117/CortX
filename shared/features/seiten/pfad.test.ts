import { describe, expect, it } from 'vitest';
import { INBOX_NAME } from '../../kern/grenzen.ts';
import type { Thema } from '../../kern/modell.ts';
import { planeAblage, vorschlaege, type SeiteKurz } from './pfad.ts';

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

describe('filing path', () => {
  it('files a topic, page, and section and matches spaces as hyphens', () => {
    expect(planeAblage('Buy milk', themen, seiten)).toMatchObject({
      text: 'Buy milk',
      topicName: INBOX_NAME,
      seite: null,
      source: 'manual',
    });
    const plan = planeAblage('Verb #deutsch-lk/grammatik/faelle', themen, seiten);
    expect(plan).toMatchObject({
      text: 'Verb',
      topicName: 'Deutsch LK',
      seite: 'Grammatik',
      abschnitt: 'Faelle',
      neu: false,
      neuSeite: false,
      neuAbschnitt: false,
      ungueltig: false,
    });
    expect(plan?.teile.map((teil) => teil.name)).toEqual(['Deutsch LK', 'Grammatik', 'Faelle']);
  });

  it('marks a new part, a similar name, and an invalid path', () => {
    const neu = planeAblage('Idea #Garten/Algebra', themen, seiten);
    expect(neu?.teile).toEqual([
      { name: 'Garten', neu: true },
      { name: 'Algebra', neu: true },
    ]);
    expect(neu?.hinweis).toBeNull();
    expect(planeAblage('Hmm #hme', themen, seiten)?.hinweis).toBe('Did you mean Home?');
    expect(planeAblage('Too #a/b/c/d', themen, seiten)).toMatchObject({
      ungueltig: true,
      hinweis: 'A path has at most three levels.',
    });
    expect(planeAblage('Gap #a//b', themen, seiten)).toMatchObject({
      ungueltig: true,
      hinweis: 'That path is missing a name.',
    });
    expect(planeAblage('Open #school/', themen, seiten)).toMatchObject({
      topicName: 'school',
      seite: null,
      ungueltig: false,
    });
  });

  it('suggests one level at a time and does not pick among several page prefixes', () => {
    const themenListe = vorschlaege('wo', themen, seiten);
    expect(themenListe.treffer.map((eintrag) => eintrag.name)).toEqual(['Work', 'Workout']);
    expect(themenListe.neuText).toBe('New topic “wo”');
    const seitenListe = vorschlaege('deutsch-lk/gra', themen, seiten);
    expect(seitenListe.treffer.map((eintrag) => eintrag.name)).toEqual(['Grammatik', 'Grammatik']);
    expect(seitenListe.neu).toBe(true);
    expect(seitenListe.gewaehlt).toBe(seitenListe.treffer.length);
    expect(seitenListe.neuText).toBe('New page “gra”');
    const abschnitt = vorschlaege('deutsch-lk/grammatik/zei', themen, seiten);
    expect(abschnitt.treffer.map((eintrag) => eintrag.name)).toEqual(['Zeiten']);
    expect(abschnitt.neuText).toBe('New section “zei”');
    const leer = vorschlaege('home/', themen, seiten);
    expect(leer.treffer.map((eintrag) => eintrag.name)).toEqual(['Kitchen']);
    expect(leer.neu).toBe(false);
  });

  it('appends to the newest page when two titles match', () => {
    const plan = planeAblage('Next #deutsch-lk/grammatik', themen, seiten);
    expect(plan).toMatchObject({ seite: 'Grammatik', neuSeite: false });
  });
});
