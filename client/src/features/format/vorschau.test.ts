import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import { LeseText } from './LeseText.tsx';

const TEXT = [
  '# Title',
  '## Section',
  '## Next',
  '= Legacy',
  '### Smaller',
  '!!!! Gold **bold**',
  '- bullet',
  '* star',
  '1. one',
  '[] open',
  '[x] done',
  '- [ ] task',
  'plain **bold** *it* ~~no~~ !!gold!! `code`',
  '[ok](https://example.com/a) [bad](javascript:alert(1))',
  '```',
  '**no**',
  '```',
].join('\n');

function html(text: string, verlinken = true): string {
  return renderToStaticMarkup(createElement(LeseText, { text, verlinken }));
}

describe('reading view', () => {
  it('maps each block kind to its element', () => {
    const seite = html(TEXT);
    expect(seite).toContain('<h2 class="titel">Title</h2>');
    expect(seite).toContain('<h2 class="abschnitt" id="abschnitt-0">Section</h2>');
    expect(seite).toContain('<h2 class="abschnitt" id="abschnitt-1">Next</h2>');
    expect(seite).toContain('<h3>Legacy</h3>');
    expect(seite).toContain('<h3>Smaller</h3>');
    expect(seite).toContain('class="wichtigzeile"');
    expect(seite).toContain('--stil-hintergrund:#f3e2a8');
    expect(seite).toContain('<strong>bold</strong>');
    expect(seite).toContain('<ul><li>bullet</li><li>star</li></ul>');
    expect(seite).toContain('<ol><li>one</li></ol>');
    expect(seite.match(/class="hakenzeile"/g)).toHaveLength(3);
    expect(seite.match(/class="haken"/g)).toHaveLength(2);
    expect(seite.match(/class="haken zu"/g)).toHaveLength(1);
    expect(seite).toContain('<span class="sr-nur">Wichtig</span>gold');
    expect(seite).toContain('<em>it</em>');
    expect(seite).toContain('<s>no</s>');
    expect(seite).toContain('<code>code</code>');
    expect(seite).toContain('<pre><code>**no**</code></pre>');
    expect(seite).toContain('href="https://example.com/a"');
    expect(seite).toContain('target="_blank"');
    expect(seite).toContain('rel="noreferrer noopener"');
    expect(seite).not.toContain('javascript:');
    expect(seite).not.toContain('<li>task</li>');
    expect(seite).not.toContain('<li>open</li>');
    expect(seite).not.toContain('role="checkbox"');
  });

  it('turns a checkbox into a control only when the reading view can save it', () => {
    const suche = html('[] open\n[x] done', false);
    expect(suche).not.toContain('role="checkbox"');
    expect(suche).toContain('aria-hidden="true"');
    const lesen = renderToStaticMarkup(
      createElement(LeseText, {
        text: '```\n[] a\n```\n[] open\n[x] done\nkeep',
        verlinken: true,
        onKasten: () => undefined,
      }),
    );
    expect(lesen.match(/role="checkbox"/g)).toHaveLength(2);
    expect(lesen).toContain('aria-checked="false"');
    expect(lesen).toContain('aria-checked="true"');
    expect(lesen).toContain(`aria-label="${TEXTE.kasten}"`);
    expect(lesen).toContain('tabindex="0"');
    expect(lesen).toContain('class="haken"');
    expect(lesen).toContain('class="haken zu"');
    expect(lesen).toContain('>keep<');
    expect(lesen).toContain('[] a');
  });

  it('keeps link labels as text until linking is on', () => {
    const aus = html('[ok](https://example.com/a)', false);
    expect(aus).toContain('ok');
    expect(aus).not.toContain('<a ');
    expect(aus).not.toContain('https://example.com/a');
  });
});
