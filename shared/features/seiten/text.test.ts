import { describe, expect, it } from 'vitest';
import { haengeBlock, neueSeite, seitentitel, zaehleAbschnitte } from './text.ts';

describe('page text', () => {
  it('reads the title from the first non-empty line', () => {
    const text = '# Deutsch LK\n\nIntro\n\n## Analysis\n\nBody\n\n### Detail\n\n## Later';
    expect(seitentitel(text)).toBe('Deutsch LK');
    expect(zaehleAbschnitte(text)).toBe(2);
    expect(seitentitel('Just a line\n\nMore')).toBe('Just a line');
    expect(seitentitel('\n\n  \nAfter blanks\r\nRest')).toBe('After blanks');
    expect(seitentitel('')).toBe('');
    expect(seitentitel('\n  \r\n')).toBe('');
  });

  it('strips heading and formatting markers from the title', () => {
    expect(seitentitel('= Legacy title')).toBe('Legacy title');
    expect(seitentitel('# **Deutsch** LK')).toBe('Deutsch LK');
    expect(seitentitel('## Section first')).toBe('Section first');
    expect(seitentitel('**Buy** milk')).toBe('Buy milk');
    expect(seitentitel('!!Buy!! milk')).toBe('Buy milk');
    expect(seitentitel('!!!! Important line')).toBe('Important line');
    expect(seitentitel('`code` title')).toBe('code title');
    expect(seitentitel('- Buy milk')).toBe('Buy milk');
  });

  it('stores a new page as a paragraph and keeps a heading the user wrote', () => {
    expect(neueSeite('Mathe', 'Analysis', 'The limit')).toBe('Mathe\n\n## Analysis\n\nThe limit');
    expect(neueSeite('Mathe', null, '')).toBe('Mathe');
    expect(neueSeite('Mathe', null, 'Limits')).toBe('Mathe\n\nLimits');
    expect(neueSeite(null, null, 'Buy milk', 'Inbox')).toBe('Buy milk');
    expect(neueSeite(null, null, '', 'Home')).toBe('Home');
    expect(neueSeite(null, null, '# Already\n\nBody', 'Inbox')).toBe('# Already\n\nBody');
    expect(neueSeite('Mathe', null, 'Limits').startsWith('# ')).toBe(false);
  });

  it('appends a block at the page end, inside a section, or as a new section', () => {
    const seite = '# Mathe\n\nIntro\n\n## Analysis\n\nOld\n\n## Later\n\nEnd';
    expect(haengeBlock(seite, 'Tail', null)).toBe(`${seite}\n\nTail`);
    expect(haengeBlock(seite, 'More', 'analysis')).toBe(
      '# Mathe\n\nIntro\n\n## Analysis\n\nOld\n\nMore\n\n## Later\n\nEnd',
    );
    expect(haengeBlock(seite, 'Fresh', 'Proofs')).toBe(`${seite}\n\n## Proofs\n\nFresh`);
    expect(haengeBlock(seite, '   ', 'Analysis')).toBe(seite);
  });
});
