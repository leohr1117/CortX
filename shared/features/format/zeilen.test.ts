import { describe, expect, it } from 'vitest';
import { schalteCode, schalteFett, schalteWichtig } from './befehl.ts';
import { leseDokument } from './lesen.ts';
import type { FormatBefehl } from './register.ts';
import { textBefehl } from './zeilen.ts';

function lauf(id: FormatBefehl, text: string, start = 0, ende = text.length, ziel?: string) {
  return textBefehl(id).run(text, start, ende, ziel);
}

describe('formats on several lines', () => {
  it('keeps a single line on the same command', () => {
    expect(lauf('fett', 'Anna', 0, 4)).toEqual(schalteFett('Anna', 0, 4));
    expect(lauf('fett', 'one\ntwo', 5, 5)).toEqual(schalteFett('one\ntwo', 5, 5));
    expect(lauf('wichtig', 'see Anna', 4, 8)).toEqual(schalteWichtig('see Anna', 4, 8));
    expect(lauf('wichtig', 'Milk', 4, 4)).toEqual(schalteWichtig('Milk', 4, 4));
    expect(lauf('code', 'a\nb', 0, 3)).toEqual(schalteCode('a\nb', 0, 3));
    expect(lauf('ueberschrift', 'one\ntwo', 4, 7).text).toBe('one\n= two');
    const zaun = '```\n**x**\n```';
    expect(lauf('code', zaun).text).toBe('**x**');
  });

  it('wraps each inline line and clears it only when every line has it', () => {
    const paare = [
      ['fett', '**one**\n**two**'],
      ['kursiv', '*one*\n*two*'],
      ['strich', '~~one~~\n~~two~~'],
    ] as const;
    for (const [id, an] of paare) {
      const hin = lauf(id, 'one\ntwo');
      expect(hin.text).toBe(an);
      expect(lauf(id, hin.text, hin.start, hin.ende).text).toBe('one\ntwo');
    }
    expect(lauf('fett', '**one**\ntwo').text).toBe('**one**\n**two**');
    expect(lauf('fett', '__one__\n__two__').text).toBe('one\ntwo');
    expect(lauf('fett', 'one\n\ntwo').text).toBe('**one**\n\n**two**');
    expect(lauf('fett', 'hello\nworld', 1, 9).text).toBe('h**ello**\n**wor**ld');
  });

  it('keeps bold when italic wraps each of several lines', () => {
    const hin = lauf('kursiv', '**one**\n**two**');
    expect(hin.text).toBe('***one***\n***two***');
    const arten = leseDokument(hin.text).belege.map((beleg) => beleg.art);
    expect(arten).toContain('fett');
    expect(arten).toContain('kursiv');
    expect(lauf('kursiv', hin.text, hin.start, hin.ende).text).toBe('**one**\n**two**');
  });

  it('applies a block marker to each line and clears it only when every line has it', () => {
    expect(lauf('liste', 'one\ntwo').text).toBe('- one\n- two');
    expect(lauf('liste', '- one\n- two').text).toBe('one\ntwo');
    expect(lauf('liste', '* one\n+ two').text).toBe('one\ntwo');
    expect(lauf('liste', '1. one\n2. two').text).toBe('one\ntwo');
    expect(lauf('liste', '* one\ntwo').text).toBe('* one\n- two');
    expect(lauf('liste', 'one\n\ntwo').text).toBe('- one\n\n- two');
    expect(lauf('haken', 'one\ntwo').text).toBe('[] one\n[] two');
    expect(lauf('haken', '[] one\n[x] two').text).toBe('one\ntwo');
    expect(lauf('haken', '[] one\ntwo').text).toBe('[] one\n[] two');
    expect(lauf('ueberschrift', 'one\ntwo').text).toBe('= one\n= two');
    expect(lauf('ueberschrift', '= one\n= two').text).toBe('one\ntwo');
    expect(lauf('ueberschrift', '= one\ntwo').text).toBe('= one\n= two');
    expect(lauf('ueberschrift', '# one\n# two').text).toBe('= # one\n= # two');
    expect(lauf('wichtig', 'one\ntwo').text).toBe('!!!! one\n!!!! two');
    expect(lauf('wichtig', '!!!! one\n!!!! two').text).toBe('one\ntwo');
    expect(lauf('wichtig', '!!!! one\ntwo').text).toBe('!!!! one\n!!!! two');
  });

  it('bolds the words of a list or an important line and leaves the line marker', () => {
    const liste = lauf('fett', '- one\n- two');
    expect(liste.text).toBe('- **one**\n- **two**');
    expect(lauf('fett', liste.text, liste.start, liste.ende).text).toBe('- one\n- two');
    const wichtig = lauf('fett', '!!!! one\n!!!! two');
    expect(wichtig.text).toBe('!!!! **one**\n!!!! **two**');
    expect(lauf('fett', wichtig.text, wichtig.start, wichtig.ende).text).toBe('!!!! one\n!!!! two');
    expect(lauf('fett', '- **one**\n- two').text).toBe('- **one**\n- **two**');
  });

  it('links each line and clears the link only when every line has it', () => {
    const hin = lauf('link', 'one\ntwo', 0, 7, 'https://a.test');
    expect(hin.text).toBe('[one](https://a.test)\n[two](https://a.test)');
    expect(lauf('link', hin.text, hin.start, hin.ende, 'https://b.test').text).toBe('one\ntwo');
    expect(lauf('link', '[one](https://a.test)\ntwo', 0, '[one](https://a.test)\ntwo'.length, 'https://b.test').text).toBe(
      '[one](https://a.test)\n[two](https://b.test)',
    );
  });
});
