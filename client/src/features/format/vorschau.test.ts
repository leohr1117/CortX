import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
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
  });

  it('keeps link labels as text until linking is on', () => {
    const aus = html('[ok](https://example.com/a)', false);
    expect(aus).toContain('ok');
    expect(aus).not.toContain('<a ');
    expect(aus).not.toContain('https://example.com/a');
  });
});
