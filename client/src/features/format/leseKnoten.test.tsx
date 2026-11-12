import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ART } from '../../../../shared/features/format/index.ts';
import { importiere } from '../../../../shared/features/format/md.ts';
import { modell } from '../../../../shared/features/format/modell.ts';
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
