import { describe, expect, it } from 'vitest';
import { haengeBlock, mitH1, neueSeite, seitentitel, zaehleAbschnitte } from './text.ts';

describe('page text', () => {
  it('reads the first heading as the title and counts sections', () => {
    const text = '# Deutsch LK\n\nIntro\n\n## Analysis\n\nBody\n\n### Detail\n\n## Later';
    expect(seitentitel(text)).toBe('Deutsch LK');
    expect(zaehleAbschnitte(text)).toBe(2);
    expect(seitentitel('= Legacy title')).toBe('Legacy title');
    expect(seitentitel('Just a line')).toBe('Just a line');
  });

  it('puts a title on a new page and keeps a title that is already there', () => {
    expect(mitH1('Buy milk', 'Inbox')).toBe('# Buy milk');
    expect(mitH1('', 'Home')).toBe('# Home');
    expect(mitH1('# Already\n\nBody', 'Inbox')).toBe('# Already\n\nBody');
    expect(neueSeite('Mathe', 'Analysis', 'The limit')).toBe('# Mathe\n\n## Analysis\n\nThe limit');
    expect(neueSeite('Mathe', null, '')).toBe('# Mathe');
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
