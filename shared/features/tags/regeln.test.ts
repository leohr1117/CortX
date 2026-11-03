import { describe, expect, it } from 'vitest';
import { INBOX_NAME } from '../../kern/grenzen.ts';
import type { Thema } from '../../kern/modell.ts';
import { planeAblage, vorschlaege } from '../seiten/index.ts';
import { ersetzeTag, findeTags, tagAnCaret } from './regeln.ts';

const themen: Thema[] = [
  { name: 'Work', count: 14 },
  { name: 'Workout', count: 6 },
  { name: 'Home', count: 2 },
  { name: INBOX_NAME, count: 1 },
];

describe('tag rules', () => {
  it('finds a tag anywhere in the text', () => {
    expect(findeTags('see #work now')).toEqual([{ name: 'work', start: 4, end: 9 }]);
    expect(findeTags('#Home first')).toEqual([{ name: 'Home', start: 0, end: 5 }]);
    expect(findeTags('end #Büro')).toEqual([{ name: 'Büro', start: 4, end: 9 }]);
  });

  it('ignores a hash that is part of a word', () => {
    expect(findeTags('C# and see#work')).toEqual([]);
  });

  it('reads a slash path as one tag and files the page', () => {
    expect(findeTags('#school/math')).toEqual([{ name: 'school/math', start: 0, end: 12 }]);
    expect(tagAnCaret('#school/math', 3)).toEqual({ name: 'school/math', start: 0, end: 12 });
    expect(planeAblage('#school/math See', themen)?.ziele[0]).toMatchObject({
      text: 'See',
      topicName: 'school',
      seite: 'math',
      source: 'tag',
      neu: true,
      neuSeite: true,
    });
    expect(planeAblage('See #school/math', themen)?.ziele[0]).toMatchObject({
      text: 'See #school/math',
      topicName: INBOX_NAME,
      source: 'manual',
    });
  });

  it('files a line-start path and leaves a later hash in the text', () => {
    const plan = planeAblage('#Home see and #work later', themen);
    expect(plan?.ziele[0]).toMatchObject({ text: 'see and #work later', topicName: 'Home', source: 'tag', neu: false });
    expect(planeAblage('see #Home and #work later', themen)?.ziele[0]).toMatchObject({
      text: 'see #Home and #work later',
      topicName: INBOX_NAME,
      source: 'manual',
    });
  });

  it('files text without a tag in the Inbox', () => {
    expect(planeAblage('  Buy milk  ', themen)?.ziele[0]).toMatchObject({
      text: 'Buy milk',
      topicName: INBOX_NAME,
      source: 'manual',
      neu: false,
    });
  });

  it('treats an empty note as nothing to file', () => {
    expect(planeAblage('   \n  ', themen)).toBeNull();
  });

  it('matches topic names without case and keeps the stored spelling', () => {
    expect(planeAblage('#WORK Call tomorrow', themen)?.ziele[0]).toMatchObject({
      text: 'Call tomorrow',
      topicName: 'Work',
      source: 'tag',
      neu: false,
    });
  });

  it('resolves a prefix to the topic with the most notes', () => {
    expect(planeAblage('#wo Fix soon', themen)?.ziele[0]).toMatchObject({ text: 'Fix soon', topicName: 'Work', neu: false });
  });

  it('prefers an exact name over a longer prefix with more notes', () => {
    const liste: Thema[] = [
      { name: 'Workout', count: 20 },
      { name: 'Wo', count: 1 },
    ];
    expect(planeAblage('#wo Go', liste)?.ziele[0]).toMatchObject({ topicName: 'Wo', neu: false });
  });

  it('plans a new topic with the typed spelling', () => {
    expect(planeAblage('#Garten Idea', themen)?.ziele[0]).toMatchObject({
      text: 'Idea',
      topicName: 'Garten',
      source: 'tag',
      neu: true,
    });
  });

  it('allows a note that is only a tag', () => {
    expect(planeAblage('#Home', themen)?.ziele[0]).toMatchObject({ text: '', topicName: 'Home', source: 'tag' });
  });

  it('lists matching topics, counts, and a new-topic row while typing', () => {
    const liste = vorschlaege('wo', themen);
    expect(liste.treffer.map((eintrag) => [eintrag.name, eintrag.zahl])).toEqual([
      ['Work', '14'],
      ['Workout', '6'],
    ]);
    expect(liste.neu).toBe(true);
    expect(liste.neuText).toBe('New topic “wo”');
    expect(liste.treffer[liste.gewaehlt]?.name).toBe('Work');
  });

  it('hides the new-topic row when the name already exists', () => {
    const liste = vorschlaege('work', themen);
    expect(liste.neu).toBe(false);
    expect(liste.treffer[liste.gewaehlt]?.name).toBe('Work');
  });

  it('offers every topic for a bare hash and does not invent an empty name', () => {
    const liste = vorschlaege('', themen);
    expect(liste.neu).toBe(false);
    expect(liste.treffer.map((thema) => thema.name)).toEqual(['Work', 'Workout', 'Home', INBOX_NAME]);
    expect(tagAnCaret('hello #', 'hello #'.length)).toEqual({ name: '', start: 6, end: 7 });
    expect(planeAblage('hello #', themen)?.ziele[0]).toMatchObject({
      text: 'hello #',
      topicName: INBOX_NAME,
      source: 'manual',
    });
  });

  it('reads the tag at the caret and replaces it', () => {
    const text = 'Fix #wo soon';
    const tag = tagAnCaret(text, text.length - 5);
    expect(tag).toMatchObject({ name: 'wo' });
    const neu = ersetzeTag(text, tag!, 'Work');
    expect(neu).toEqual({ text: 'Fix #Work soon', caret: 9 });
  });
});
