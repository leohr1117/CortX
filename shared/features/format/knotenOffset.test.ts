import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { knotenZuMarkdownOffset } from './knotenOffset.ts';
import { lade } from './laden.ts';
import { modell } from './modell.ts';
import { speichere } from './speichern.ts';
import { grenzen } from './stelle.ts';

const PROBEN = [
  '',
  'Hello',
  'Hello\n',
  'Hello\nWorld',
  '**Hello**',
  '***Test***',
  '= Sprint summary',
  '- milk',
  '[] call',
  '- [x] done',
  '**a**\n**b**\n**c** d **e**',
  '- a\n  b',
  '```\nwort\n```',
  '`**not**`',
  '!!`Gold`!!',
  '!!!! **fett**',
  '__alpha__\n__beta__\ngamma',
  'A. milk\n* bread',
  'I. one\nII. two',
  'i. one\nii. two',
  'a. milk',
  '[wort](https://example.com/a)',
  '# Titel',
];

function sichtbar(text: string, syntax: readonly boolean[]): string {
  let aus = '';
  for (let i = 0; i < text.length; i += 1) {
    const z = text[i] ?? '';
    if (syntax[i] || z === '\n' || z === '\r') continue;
    aus += z;
  }
  return aus;
}

describe('node to markdown offset', () => {
  it('maps stored notes the same way as the current boundaries', () => {
    for (const text of PROBEN) {
      const doc = lade(text);
      const abbildung = knotenZuMarkdownOffset(doc, text);
      expect(abbildung.syntax, text).toHaveLength(text.length);
      expect(abbildung.grenze, text).toEqual(grenzen(doc, text));
      expect(sichtbar(text, abbildung.syntax), text).toBe(doc.textContent);
      const umbruch = text.indexOf('\n');
      if (umbruch >= 0) expect(abbildung.syntax[umbruch], text).toBe(false);
    }
  });

  it('marks an escape written by the serializer and keeps the character', () => {
    const text = '\\*stern';
    const doc = lade(text);
    const abbildung = knotenZuMarkdownOffset(doc, text);
    expect(doc.textContent).toBe('*stern');
    expect(abbildung.syntax[0]).toBe(true);
    expect(sichtbar(text, abbildung.syntax)).toBe('*stern');
    expect(abbildung.grenze).toHaveLength(text.length + 1);
  });

  it('maps a bold node that has no stored source line', () => {
    const absatz = modell.nodes.absatz!.createChecked(null, modell.text('Hello', [modell.marks.fett!.create()]));
    const doc = modell.node('doc', null, [absatz]);
    const text = speichere(doc);
    const abbildung = knotenZuMarkdownOffset(doc, text);
    expect(sichtbar(text, abbildung.syntax)).toBe('Hello');
    expect(abbildung.syntax.some(Boolean)).toBe(true);
    expect(abbildung.grenze).toHaveLength(text.length + 1);
    expect(abbildung.grenze[text.length]).toBe(TextSelection.atEnd(doc).from);
    const hello = text.indexOf('Hello');
    expect(abbildung.grenze[hello]).toBeGreaterThan(0);
  });

  it('keeps marker-like code text as content', () => {
    const text = '```\n- milk\n```';
    const doc = lade(text);
    const geschrieben = speichere(doc);
    const abbildung = knotenZuMarkdownOffset(doc, geschrieben);
    const strich = geschrieben.indexOf('-');
    expect(strich).toBeGreaterThanOrEqual(0);
    expect(abbildung.syntax[strich]).toBe(false);
    expect(sichtbar(geschrieben, abbildung.syntax)).toBe(doc.textContent);
  });

  it('does not read the markdown parser', () => {
    const dateien = ['knotenOffset.ts', 'knotenSyntax.ts'];
    for (const name of dateien) {
      const quelle = readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');
      expect(quelle.includes('leseDokument'), name).toBe(false);
      expect(quelle.includes('lesen.ts'), name).toBe(false);
    }
  });
});
