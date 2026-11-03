import { describe, expect, it } from 'vitest';
import { INBOX_NAME } from '../../kern/grenzen.ts';
import type { Thema } from '../../kern/modell.ts';
import { planeAblage, type SeiteKurz } from './pfad.ts';

const themen: Thema[] = [
  { name: 'Work', count: 14 },
  { name: 'Workout', count: 6 },
  { name: 'Home', count: 2 },
  { name: 'Deutsch LK', count: 3 },
];

const seiten: SeiteKurz[] = [
  { id: 4, topic: 'Deutsch LK', titel: 'Grammatik', abschnitte: ['Faelle'] },
  { id: 9, topic: 'Deutsch LK', titel: 'Grammatik', abschnitte: ['Zeiten'] },
  { id: 2, topic: 'Home', titel: 'Kitchen', abschnitte: ['List'] },
  { id: 3, topic: 'Home', titel: 'Garden', abschnitte: [] },
];

describe('filing outcomes', () => {
  it('keeps text before the first target line and drops the path from the filed note', () => {
    const plan = planeAblage('before #tag stays\n#deutsch-lk/Grammatik/zeiten Verb', themen, seiten);
    expect(plan?.ungueltig).toBe(false);
    expect(plan?.ziele).toHaveLength(2);
    expect(plan?.ziele[0]).toMatchObject({
      text: 'before #tag stays',
      topicName: INBOX_NAME,
      source: 'manual',
      seite: null,
    });
    expect(plan?.ziele[1]).toMatchObject({
      text: 'Verb',
      topicName: 'Deutsch LK',
      seite: 'Grammatik',
      abschnitt: 'Zeiten',
      source: 'tag',
      neu: false,
      neuSeite: false,
      neuAbschnitt: false,
    });
    expect(plan?.ziele[1]?.text.includes('#')).toBe(false);
    expect(planeAblage('#deutsch lk/Grammatik/zeiten Verb', themen, seiten)?.ziele[0]).toMatchObject({
      topicName: 'Deutsch LK',
      seite: null,
      text: 'lk/Grammatik/zeiten Verb',
      source: 'tag',
    });
  });

  it('completes one page prefix and leaves several page prefixes as a new page', () => {
    expect(planeAblage('#home/kit Soup', themen, seiten)?.ziele[0]).toMatchObject({
      topicName: 'Home',
      seite: 'Kitchen',
      neuSeite: false,
      text: 'Soup',
    });
    expect(planeAblage('#deutsch-lk/gra Next', themen, seiten)?.ziele[0]).toMatchObject({
      topicName: 'Deutsch LK',
      seite: 'gra',
      neuSeite: true,
      hinweis: null,
    });
  });

  it('reads a section from the newest page when two titles match', () => {
    expect(planeAblage('#deutsch-lk/grammatik/zeiten Verb', themen, seiten)?.ziele[0]).toMatchObject({
      seite: 'Grammatik',
      abschnitt: 'Zeiten',
      neuAbschnitt: false,
    });
    expect(planeAblage('#deutsch-lk/grammatik/faelle Verb', themen, seiten)?.ziele[0]).toMatchObject({
      seite: 'Grammatik',
      abschnitt: 'faelle',
      neuAbschnitt: true,
      text: 'Verb',
      hinweis: null,
    });
  });

  it('hints at one close topic name and stays quiet for a short fragment or two neighbors', () => {
    expect(planeAblage('#wrok Note', themen, seiten)?.ziele[0]).toMatchObject({
      topicName: 'wrok',
      neu: true,
      hinweis: 'Did you mean Work?',
      text: 'Note',
    });
    expect(planeAblage('#zz Note', themen, seiten)?.ziele[0]).toMatchObject({
      topicName: 'zz',
      neu: true,
      hinweis: null,
    });
    const nachbarn: Thema[] = [
      { name: 'Work', count: 4 },
      { name: 'Werk', count: 2 },
    ];
    expect(planeAblage('#wprk Note', nachbarn)?.ziele[0]).toMatchObject({
      topicName: 'wprk',
      neu: true,
      hinweis: null,
    });
  });

  it('rejects the whole note when one path is too deep or missing a name', () => {
    expect(planeAblage('#home Soup\n#a/b/c/d Too', themen, seiten)).toEqual({
      ziele: [],
      ungueltig: true,
      hinweis: 'A path has at most three levels.',
    });
    expect(planeAblage('#home Soup\n#a//b Gap', themen, seiten)).toEqual({
      ziele: [],
      ungueltig: true,
      hinweis: 'That path is missing a name.',
    });
    expect(planeAblage('#home/ Note', themen, seiten)?.ziele[0]).toMatchObject({
      topicName: 'Home',
      seite: null,
      text: 'Note',
      source: 'tag',
    });
    expect(planeAblage('#home/', themen, seiten)?.ungueltig).toBe(false);
  });

  it('sends a topic prefix to the topic with the most notes and keeps an exact short name', () => {
    expect(planeAblage('#wo Go', themen, seiten)?.ziele[0]).toMatchObject({
      topicName: 'Work',
      neu: false,
      text: 'Go',
    });
    const liste: Thema[] = [
      { name: 'Workout', count: 20 },
      { name: 'Wo', count: 1 },
    ];
    expect(planeAblage('#wo Go', liste)?.ziele[0]).toMatchObject({ topicName: 'Wo', neu: false });
  });
});
