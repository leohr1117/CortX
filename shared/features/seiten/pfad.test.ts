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
    const inbox = planeAblage('Buy milk', themen, seiten);
    expect(inbox?.ungueltig).toBe(false);
    expect(inbox?.ziele[0]).toMatchObject({
      text: 'Buy milk',
      topicName: INBOX_NAME,
      seite: null,
      source: 'manual',
    });
    const plan = planeAblage('#deutsch-lk/grammatik/faelle Verb', themen, seiten);
    expect(plan?.ungueltig).toBe(false);
    expect(plan?.ziele[0]).toMatchObject({
      text: 'Verb',
      topicName: 'Deutsch LK',
      seite: 'Grammatik',
      abschnitt: 'Faelle',
      neu: false,
      neuSeite: false,
      neuAbschnitt: false,
    });
    expect(plan?.ziele[0]?.teile.map((teil) => teil.name)).toEqual(['Deutsch LK', 'Grammatik', 'Faelle']);
  });

  it('marks a new part, a similar name, and an invalid path', () => {
    const neu = planeAblage('#Garten/Algebra Idea', themen, seiten);
    expect(neu?.ziele[0]?.teile).toEqual([
      { name: 'Garten', neu: true },
      { name: 'Algebra', neu: true },
    ]);
    expect(neu?.ziele[0]?.hinweis).toBeNull();
    expect(planeAblage('#hme Hmm', themen, seiten)?.ziele[0]?.hinweis).toBe('Did you mean Home?');
    expect(planeAblage('#a/b/c/d Too', themen, seiten)).toMatchObject({
      ungueltig: true,
      hinweis: 'A path has at most three levels.',
      ziele: [],
    });
    expect(planeAblage('#a//b Gap', themen, seiten)).toMatchObject({
      ungueltig: true,
      hinweis: 'That path is missing a name.',
      ziele: [],
    });
    expect(planeAblage('#school/', themen, seiten)?.ziele[0]).toMatchObject({
      topicName: 'school',
      seite: null,
    });
    expect(planeAblage('#school/', themen, seiten)?.ungueltig).toBe(false);
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
    const plan = planeAblage('#deutsch-lk/grammatik Next', themen, seiten);
    expect(plan?.ziele[0]).toMatchObject({ seite: 'Grammatik', neuSeite: false });
  });
});
