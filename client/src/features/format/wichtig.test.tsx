import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LeseText } from './LeseText.tsx';

function lin(kanal: number): number {
  const c = kanal / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function leuchtdichte(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = lin((n >> 16) & 255);
  const g = lin((n >> 8) & 255);
  const b = lin(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function kontrast(hell: string, dunkel: string): number {
  const a = leuchtdichte(hell);
  const b = leuchtdichte(dunkel);
  const oben = Math.max(a, b);
  const unten = Math.min(a, b);
  return (oben + 0.05) / (unten + 0.05);
}

function farbton(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let ton = 0;
  if (max === r) ton = ((g - b) / delta) % 6;
  else if (max === g) ton = (b - r) / delta + 2;
  else ton = (r - g) / delta + 4;
  ton *= 60;
  return ton < 0 ? ton + 360 : ton;
}

describe('wichtig on the page', () => {
  it('renders a mark and keeps script text as text', () => {
    const html = renderToStaticMarkup(
      createElement(LeseText, {
        text: '!!<script>alert(1)</script>!!\n!!!! <img src=x onerror=alert(1)>',
        verlinken: true,
      }),
    );
    const tags = html.match(/<\/?[^>]+>/g) ?? [];
    expect(tags.some((tag) => tag === '<mark>' || tag.startsWith('<mark '))).toBe(true);
    for (const tag of tags) {
      expect(tag).not.toMatch(/<\s*script/i);
      expect(tag).not.toMatch(/<\s*img/i);
      expect(tag).not.toMatch(/\son\w+\s*=/i);
    }
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).toContain('Wichtig');
    expect(html).toContain('wichtigzeile');
    expect(renderToStaticMarkup(createElement(LeseText, { text: 'Wow!!' }))).not.toContain('<mark');
  });

  it('uses a gold highlight with enough contrast and no red', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../ui/cortx.css'), 'utf8');
    const wurzel = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
    const wert = (name: string) => wurzel.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? '';
    const hintergrund = wert('--wichtig-hintergrund');
    const schrift = wert('--wichtig-schrift');
    const balken = wert('--wichtig-balken');
    const strich = wert('--wichtig-strich');
    expect(hintergrund).toBe('#f3e2a8');
    expect(schrift).toBe('#1a1a1a');
    expect(balken).toBe('#b8892e');
    expect(strich).toBe('#5c4314');
    expect(css).toContain('background: var(--wichtig-hintergrund)');
    expect(css).toContain('color: var(--wichtig-schrift)');
    expect(css).toContain('border-left: 3px solid var(--wichtig-balken)');
    expect(css).not.toContain('background: #f3e2a8');
    expect(css).not.toContain('color: #1a1a1a');
    expect(css).not.toContain('solid #b8892e');
    expect(css).not.toContain('0 0 #b8892e');
    expect(kontrast(hintergrund, schrift)).toBeGreaterThanOrEqual(4.5);
    for (const farbe of [hintergrund, balken, strich]) {
      const ton = farbton(farbe);
      expect(ton).toBeGreaterThan(30);
      expect(ton).toBeLessThan(55);
    }
    expect(css).not.toContain('cm-wichtig { color: var(--gefahr)');
  });
});
