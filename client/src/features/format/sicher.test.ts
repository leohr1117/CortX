import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { importiere } from '../../../../shared/features/format/md.ts';
import { LeseText } from './LeseText.tsx';

function tags(html: string): string[] {
  return html.match(/<\/?[^>]+>/g) ?? [];
}

describe('rendered notes stay text', () => {
  it('escapes script and image markup and drops unsafe links', () => {
    const html = renderToStaticMarkup(
      createElement(LeseText, {
        doc: importiere('<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[click](javascript:alert(1))\n[ok](https://example.com/a)'),
        verlinken: true,
      }),
    );
    for (const tag of tags(html)) {
      expect(tag).not.toMatch(/<\s*script/i);
      expect(tag).not.toMatch(/<\s*img/i);
      expect(tag).not.toMatch(/\son\w+\s*=/i);
      expect(tag).not.toMatch(/javascript:/i);
    }
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).toContain('click');
    expect(html).toContain('href="https://example.com/a"');
    expect(html).not.toContain('javascript:');
  });
});
