import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ART } from '../../../../shared/features/format/index.ts';
import { importiere } from '../../../../shared/features/format/md.ts';
import { modell } from '../../../../shared/features/format/modell.ts';
import { kastenInQuelle } from '../../../../shared/features/format/modellkasten.ts';
import { standAusText, standNachKasten } from '../edit/dokumentStand.ts';
import { LeseText } from './LeseText.tsx';
import { leseKnoten } from './leseKnoten.ts';

function html(text: string): string {
  return renderToStaticMarkup(createElement(LeseText, { doc: importiere(text) }));
}

function kastenStellen(text: string): number[] {
  return leseKnoten(importiere(text)).flatMap((block) => (block.art === ART.haken ? block.punkte.map((punkt) => punkt.pos) : []));
}

describe('reading view from the note document', () => {
  it('keeps lines and empty lines of a paragraph in one block', () => {
    expect(html('a\n\nb\n')).toBe(
      '<div class="lesetext"><p><span class="lauf">a</span><span class="lauf"></span><span class="lauf">b</span><span class="lauf"></span></p></div>',
    );
  });

  it('hangs an indented line onto the bullet above it', () => {
    expect(html('- a\n  b\n- c')).toBe('<div class="lesetext"><ul><li>a\nb</li><li>c</li></ul></div>');
  });

  it('splits ordered lists when the numbering style changes', () => {
    expect(html('1. a\n2. b\nB. c\nC. d')).toBe(
      '<div class="lesetext"><ol><li>a</li><li>b</li></ol><ol class="gross"><li>c</li><li>d</li></ol></div>',
    );
  });

  it('draws one code block per fence pair and drops the fences', () => {
    expect(html('```\nx\n\ny\n```\n```\nz\n```')).toBe(
      '<div class="lesetext"><pre><code>x\n\ny</code></pre><pre><code>z</code></pre></div>',
    );
  });

  it('nests marks in one fixed order so a highlight stays one mark', () => {
    const seite = html('!!a **b** [c](https://e.com)!!');
    expect(seite.match(/<mark/g)).toHaveLength(1);
    expect(seite).toContain('<strong>b</strong>');
    expect(html('_**y**_')).toContain('<strong><em>y</em></strong>');
    expect(html('~~**z**~~')).toContain('<s><strong>z</strong></s>');
  });

  it('reads a document typed in the editor without any source text', () => {
    const doc = modell.node('doc', null, [
      modell.node('ueberschrift', { stufe: 2 }, [modell.text('Plan')]),
      modell.node('punkt', { art: ART.haken, abgehakt: true }, [modell.text('done')]),
      modell.node('codeblock', { zaun: '```' }),
      modell.node('codeblock', { zaun: '```' }, [modell.text('code')]),
      modell.node('codeblock', { zaun: '```' }),
    ]);
    const seite = renderToStaticMarkup(createElement(LeseText, { doc }));
    expect(seite).toContain('<h2 class="abschnitt" id="abschnitt-0">Plan</h2>');
    expect(seite).toContain('<span class="haken zu" aria-hidden="true">');
    expect(seite).toContain('<span class="hakenlabel">done</span>');
    expect(seite).toContain('<pre><code>code</code></pre>');
  });
});

describe('checkbox in the reading view', () => {
  it('passes the document position of each box, not of continued lines', () => {
    const doc = importiere('- [ ] a\n  b\n- [x] c');
    const stellen = kastenStellen('- [ ] a\n  b\n- [x] c');
    expect(stellen.map((pos) => doc.nodeAt(pos)?.textContent)).toEqual(['a', 'c']);
  });

  it('ticks a box through the document and keeps its marker', () => {
    const stand = standAusText('Title\n\n- [ ] one\n[x] two');
    const [erste, zweite] = kastenStellen(stand.text);
    expect(standNachKasten(stand, erste!)?.text).toBe('Title\n\n- [x] one\n[x] two');
    expect(standNachKasten(stand, zweite!)?.text).toBe('Title\n\n- [ ] one\n[] two');
  });

  it('ignores a position that is not a box', () => {
    expect(standNachKasten(standAusText('plain'), 0)).toBeNull();
  });
});

function kaesten(text: string): number[] {
  const stellen: number[] = [];
  standAusText(text).knoten.forEach((knoten, pos) => {
    if (knoten.type.name === 'punkt' && knoten.attrs.art === 'haken') stellen.push(pos);
  });
  return stellen;
}

function abhaken(text: string, nummer = 0): string {
  const stand = standAusText(text);
  const pos = kaesten(text)[nummer];
  if (pos === undefined) throw new Error('no box');
  const nachher = standNachKasten(stand, pos);
  if (!nachher) throw new Error('box did not toggle');
  return nachher.text;
}

describe('ticking a box changes only the character in the box', () => {
  it('swaps the box character and keeps every other byte of the line, also in the export', () => {
    const paare: Array<[string, string]> = [
      ['[] a', '[x] a'],
      ['[x] a', '[] a'],
      ['[]a', '[x]a'],
      ['[x]a', '[]a'],
      ['[x]  a  ', '[]  a  '],
      ['- [ ] a', '- [x] a'],
      ['- [x] a', '- [ ] a'],
      ['* [ ] a', '* [x] a'],
      ['+ [x] a', '+ [ ] a'],
      ['- [ ]a', '- [x]a'],
      ['- [x]   viel', '- [ ]   viel'],
      ['- [ ] **fett** `c` ', '- [x] **fett** `c` '],
    ];
    for (const [vorher, nachher] of paare) expect(abhaken(vorher)).toBe(nachher);
  });

  it('leaves the other lines and their line endings untouched', () => {
    expect(abhaken('[] a\r\n[x] b\r\n', 1)).toBe('[] a\r\n[] b\r\n');
    expect(abhaken('T\n\n- [ ] one\n[x] two', 0)).toBe('T\n\n- [x] one\n[x] two');
    expect(abhaken('- [ ] a\n  b\n- [x] c', 1)).toBe('- [ ] a\n  b\n- [ ] c');
    expect(abhaken('[] a\n```\n[] b\n```')).toBe('[x] a\n```\n[] b\n```');
  });

  it('returns to the same bytes when ticked twice', () => {
    for (const text of ['[] a', '[x]a', '- [ ] a', '* [x] b\n', '[x]  a  ']) {
      expect(abhaken(abhaken(text))).toBe(text);
    }
  });

  it('keeps the stored source line in step with the export', () => {
    expect(kastenInQuelle('[x] a\n')).toBe('[] a\n');
    expect(kastenInQuelle('- [ ] a\r\n')).toBe('- [x] a\r\n');
    expect(kastenInQuelle('plain')).toBe('plain');
    const stand = standAusText('[x] a');
    const nachher = standNachKasten(stand, kaesten('[x] a')[0]!)!;
    expect(nachher.knoten.child(0).attrs.quelle).toBe('[] a');
  });
});
