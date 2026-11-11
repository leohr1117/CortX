import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { setzeSwCache, SW_CACHE_PLATZHALTER, swCache } from '../../shared/kern/sw.ts';
import { AKTUELLE_VERSION } from '../../shared/versionen.ts';

const CLIENT = path.resolve('client');

const MARKEN: ReadonlyArray<{ relativ: string; bytes: number; kante?: number }> = [
  { relativ: 'public/icons/favicon-v3.svg', bytes: 343 },
  { relativ: 'public/icons/favicon-v3.png', bytes: 1053, kante: 32 },
  { relativ: 'public/icons/apple-touch-icon-v3.png', bytes: 5325, kante: 180 },
  { relativ: 'public/icons/icon-192-v3.png', bytes: 4740, kante: 192 },
  { relativ: 'public/icons/icon-512-v3.png', bytes: 15087, kante: 512 },
  { relativ: 'public/icons/icon-maskable-512-v3.png', bytes: 9050, kante: 512 },
];

const MANIFEST_ICONS = [
  { src: '/icons/icon-192-v3.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512-v3.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-maskable-512-v3.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

function lies(relativ: string): string {
  return fs.readFileSync(path.join(CLIENT, relativ), 'utf8');
}

function quellen(ordner: string): string[] {
  const fund: string[] = [];
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    const ziel = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) fund.push(...quellen(ziel));
    else if (eintrag.name.endsWith('.tsx') || eintrag.name.endsWith('.html')) fund.push(fs.readFileSync(ziel, 'utf8'));
  }
  return fund;
}

function pngKante(buf: Buffer): { width: number; height: number } {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(buf.toString('ascii', 12, 16)).toBe('IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('home screen name', () => {
  it('shows CortX in the title and on the sign-in page', () => {
    const html = lies('index.html');
    expect(html).toContain('<title>CortX</title>');
    expect(html).toContain('name="apple-mobile-web-app-title" content="CortX"');
    expect(html).toContain('name="theme-color" content="#141414"');
    const svg = html.indexOf('<link rel="icon" type="image/svg+xml" href="/icons/favicon-v3.svg" />');
    const png = html.indexOf('<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-v3.png" />');
    expect(svg).toBeGreaterThanOrEqual(0);
    expect(png).toBeGreaterThan(svg);
    expect(html).toContain('/icons/apple-touch-icon-v3.png');
    expect(html).not.toContain('-v2');
    expect(html).not.toContain('/icons/icon-192.png');
    expect(html).not.toContain('/icons/icon-512.png');
    expect(lies('src/features/zugang/Anmeldung.tsx')).toContain('CortX');
    for (const text of [html, ...quellen(path.join(CLIENT, 'src'))]) {
      expect(text).not.toMatch(/\bCortex\b/);
    }
  });
});

describe('service worker cache', () => {
  it('names the cache after the current version', () => {
    const quelle = lies('public/sw.js');
    expect(quelle).toContain(`const CACHE = '${SW_CACHE_PLATZHALTER}'`);
    expect(quelle).not.toMatch(/cortx-\d+\.\d+\.\d+/);
    expect(quelle).not.toMatch(/cortex-\d+\.\d+\.\d+/);
    expect(quelle).toContain('name !== CACHE');
    expect(quelle).toContain('caches.delete(name)');
    const fertig = setzeSwCache(quelle, AKTUELLE_VERSION);
    expect(fertig).toContain(`const CACHE = '${swCache(AKTUELLE_VERSION)}'`);
    expect(swCache(AKTUELLE_VERSION)).toBe(`cortx-${AKTUELLE_VERSION}`);
    expect(fertig).not.toContain(SW_CACHE_PLATZHALTER);
  });
});

describe('install icon', () => {
  it('names the app CortX and publishes the brand icons', () => {
    const manifestText = lies('public/manifest.webmanifest');
    const manifest = JSON.parse(manifestText) as {
      id: string;
      name: string;
      short_name: string;
      theme_color: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
    };
    expect(manifest.id).toBe('/');
    expect(manifest.name).toBe('CortX');
    expect(manifest.short_name).toBe('CortX');
    expect(manifest.theme_color).toBe('#141414');
    expect(manifest.icons).toEqual(MANIFEST_ICONS);
    expect(manifestText).not.toContain('-v2');
    expect(manifestText).not.toContain('/icons/icon-192.png');
    expect(manifestText).not.toContain('/icons/icon-512.png"');
    const sw = lies('public/sw.js');
    expect(sw).toContain('/.well-known/');
    expect(sw).not.toContain('-v2');
    expect(sw).not.toContain('/icons/icon-192.png');

    for (const marke of MARKEN) {
      const datei = path.join(CLIENT, marke.relativ);
      expect(fs.existsSync(datei), marke.relativ).toBe(true);
      const buf = fs.readFileSync(datei);
      expect(buf.length, marke.relativ).toBe(marke.bytes);
      if (marke.kante === undefined) {
        expect(buf.subarray(0, 4).toString('utf8'), marke.relativ).toBe('<svg');
        continue;
      }
      const kante = pngKante(buf);
      expect(kante.width, marke.relativ).toBe(marke.kante);
      expect(kante.height, marke.relativ).toBe(marke.kante);
    }
  });
});
