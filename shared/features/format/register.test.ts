import { describe, expect, it } from 'vitest';
import {
  INLINE_REGISTER,
  formatVon,
  kuerzelEintraege,
  leistenEintraege,
  vorschauSchichten,
  vorschauTag,
  vorschauWidget,
} from './register.ts';
import { FETT_MARKER, LISTEN_EINFUEGEN, UEBERSCHRIFT_MARKER, WICHTIG_ZEILE } from './zeile.ts';

describe('format register', () => {
  it('is the one list for the bar, the shortcuts, and the preview', () => {
    expect(leistenEintraege().map((eintrag) => eintrag.knopf.beschriftung)).toEqual([
      'Bold',
      'Italic',
      'Strikethrough',
      'Important',
      'Code',
      'Heading',
      'Bulleted list',
      'Checklist',
      'Link',
    ]);
    expect(leistenEintraege().flatMap((eintrag) => (eintrag.knopf.taste ? [eintrag.knopf.taste] : []))).toEqual([
      'Mod-b',
      'Mod-i',
      'Mod-Shift-x',
      'Mod-!',
      'Mod-e',
      'Mod-Shift-h',
      'Mod-Shift-l',
      'Mod-Shift-u',
      'Mod-k',
    ]);
    expect(kuerzelEintraege().map((eintrag) => eintrag.id)).toEqual(['haken', 'fett']);
    const fett = formatVon('fett');
    expect(fett.kuerzel).toEqual({ art: 'wort', ende: FETT_MARKER });
    expect(INLINE_REGISTER.find((eintrag) => eintrag.art === 'fett' && eintrag.knopf)?.marker).toBe(FETT_MARKER);
    const haken = formatVon('haken');
    expect(haken.syntax?.einsetzen).toBe('[] ');
    expect(haken.kuerzel).toEqual({ art: 'zeile', genau: '[ ]', ersatz: haken.syntax?.einsetzen });
    expect(formatVon('liste').syntax?.einsetzen).toBe(LISTEN_EINFUEGEN);
    expect(formatVon('wichtig').syntax?.zeile).toBe(WICHTIG_ZEILE);
    expect(formatVon('ueberschrift').syntax?.einsetzen).toBe(UEBERSCHRIFT_MARKER);
    expect(vorschauSchichten().map((schicht) => schicht.klasse)).toEqual([
      'cm-fett',
      'cm-kursiv',
      'cm-strich',
      'cm-code',
      'cm-link',
      'cm-ueberschrift',
      'cm-codeblock',
      'cm-wichtig',
    ]);
    expect(vorschauTag('fett')).toBe('strong');
    expect(vorschauTag('kursiv')).toBe('em');
    expect(vorschauTag('streich')).toBe('s');
    expect(vorschauTag('code')).toBe('code');
    expect(vorschauTag('wichtig')).toBe('mark');
    expect(vorschauWidget('liste')).toBe('punkt');
    expect(vorschauWidget('nummer')).toBe('nummer');
    expect(vorschauWidget('haken')).toBe('haken');
  });
});
