import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { STIL_REGISTER, STIL_VAR } from '../../../../shared/features/format/index.ts';
import { LeseText } from './LeseText.tsx';

describe('important and code on the page', () => {
  it('publishes the important background for code nested either way the tree allows', () => {
    const html = renderToStaticMarkup(createElement(LeseText, { text: '!!`Gold`!!' }));
    expect(html).toMatch(/<mark style="--stil-hintergrund:#f3e2a8">/);
    expect(html).toContain('<code>Gold</code>');
    expect(html).not.toContain('<code>!!');

    const zeile = renderToStaticMarkup(createElement(LeseText, { text: '!!!! `Gold`' }));
    expect(zeile).toContain('wichtigzeile');
    expect(zeile).toMatch(/<mark style="--stil-hintergrund:#f3e2a8">/);
    expect(zeile).toContain('<code>Gold</code>');
  });

  it('leaves code, bold code, and plain important without the pair', () => {
    const code = renderToStaticMarkup(createElement(LeseText, { text: '`!!not!!`' }));
    expect(code).toContain('<code>!!not!!</code>');
    expect(code).not.toContain(STIL_VAR);
    expect(code).not.toContain('<mark');

    const fett = renderToStaticMarkup(createElement(LeseText, { text: '**`Bold`**' }));
    expect(fett).toContain('<strong><code>Bold</code></strong>');
    expect(fett).not.toContain(STIL_VAR);

    const wichtig = renderToStaticMarkup(createElement(LeseText, { text: '!!Anna!!' }));
    expect(wichtig).toMatch(/<mark style="--stil-hintergrund:#f3e2a8">/);
    expect(wichtig).not.toContain('<code');
  });

  it('keeps each format in the stylesheet and does not override the pair', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../ui/cortx.css'), 'utf8');
    const code = STIL_REGISTER.find((eintrag) => eintrag.art === 'code');
    const wichtig = STIL_REGISTER.find((eintrag) => eintrag.art === 'wichtig');
    const schrift = code?.stil.schrift ?? '';
    const gold = wichtig?.stil.hintergrund ?? '';
    const farbe = wichtig?.stil.farbe ?? '';
    expect(schrift.length).toBeGreaterThan(0);
    expect(css.split(`font-family: ${schrift}`).length - 1).toBeGreaterThanOrEqual(2);
    expect(css).toContain(`background: ${gold}`);
    expect(css).toContain(`color: ${farbe}`);
    expect(css).toContain(`var(${STIL_VAR}, var(--flaeche-2))`);
    expect(css).not.toContain('.cm-code.cm-wichtig');
    expect(css).not.toContain('.cm-codeblock.cm-wichtig');
    expect(css).not.toContain('.lesetext mark code');
  });
});
