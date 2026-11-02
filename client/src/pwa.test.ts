import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';

const CLIENT = path.resolve('client');
const GRUND = 20;

interface Bild {
  width: number;
  height: number;
  colorType: number;
  rgb: Buffer;
}

interface Band {
  links: number;
  rechts: number;
  ende: number;
}

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

function liesPng(relativ: string): Bild {
  const buf = fs.readFileSync(path.join(CLIENT, relativ));
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  const rgb = Buffer.alloc(width * height * 3);
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    expect(raw[src]).toBe(0);
    src += 1;
    raw.copy(rgb, y * stride, src, src + stride);
    src += stride;
  }
  return { width, height, colorType, rgb };
}

function motiv(rgb: Buffer, width: number, x: number, y: number): boolean {
  const o = (y * width + x) * 3;
  return rgb[o] > 60 || rgb[o + 1] > 60;
}

function baender(bild: Bild): Band[] {
  const gruppen: Band[] = [];
  for (let y = 0; y < bild.height; y += 1) {
    let links = -1;
    let rechts = -1;
    for (let x = 0; x < bild.width; x += 1) {
      if (!motiv(bild.rgb, bild.width, x, y)) continue;
      if (links < 0) links = x;
      rechts = x;
    }
    if (links < 0) continue;
    const letzte = gruppen.at(-1);
    if (!letzte || y > letzte.ende + 1) gruppen.push({ links, rechts, ende: y });
    else {
      letzte.links = Math.min(letzte.links, links);
      letzte.rechts = Math.max(letzte.rechts, rechts);
      letzte.ende = y;
    }
  }
  return gruppen;
}

function vollflaechig(bild: Bild): void {
  expect(bild.colorType).toBe(2);
  const { rgb, width, height } = bild;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rand = x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
      const o = (y * width + x) * 3;
      if (rgb[o] > 250 && rgb[o + 1] > 250 && rgb[o + 2] > 250) {
        throw new Error(`white pixel at ${x},${y}`);
      }
      if (!rand) continue;
      expect([rgb[o], rgb[o + 1], rgb[o + 2]]).toEqual([GRUND, GRUND, GRUND]);
    }
  }
}

function inSichererZone(bild: Bild): void {
  const radius = bild.width * 0.4;
  const mitte = bild.width / 2;
  for (let y = 0; y < bild.height; y += 1) {
    for (let x = 0; x < bild.width; x += 1) {
      const o = (y * bild.width + x) * 3;
      const ab = Math.max(
        Math.abs(bild.rgb[o] - GRUND),
        Math.abs(bild.rgb[o + 1] - GRUND),
        Math.abs(bild.rgb[o + 2] - GRUND),
      );
      if (ab <= 12) continue;
      expect(Math.hypot(x + 0.5 - mitte, y + 0.5 - mitte)).toBeLessThanOrEqual(radius);
    }
  }
}

describe('home screen name', () => {
  it('shows CortX in the title and on the sign-in page', () => {
    const html = lies('index.html');
    expect(html).toContain('<title>CortX</title>');
    expect(html).toContain('name="apple-mobile-web-app-title" content="CortX"');
    expect(html).toContain('name="theme-color" content="#141414"');
    expect(html).toContain('/icons/favicon-v2.png');
    expect(html).toContain('/icons/apple-touch-icon-v2.png');
    expect(html).not.toContain('/icons/icon-192.png');
    expect(html).not.toContain('/icons/icon-512.png');
    expect(lies('src/features/zugang/Anmeldung.tsx')).toContain('CortX');
    for (const text of [html, ...quellen(path.join(CLIENT, 'src'))]) {
      expect(text).not.toMatch(/\bCortex\b/);
    }
  });
});

describe('install icon', () => {
  it('names the app CortX and publishes a maskable icon', () => {
    const manifest = JSON.parse(lies('public/manifest.webmanifest')) as {
      id: string;
      name: string;
      short_name: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
    };
    expect(manifest.id).toBe('/');
    expect(manifest.name).toBe('CortX');
    expect(manifest.short_name).toBe('CortX');
    expect(manifest.icons.map((icon) => icon.purpose)).toEqual(['any', 'any', 'maskable']);
    const maskierbar = manifest.icons.find((icon) => icon.purpose === 'maskable');
    expect(maskierbar).toMatchObject({
      src: '/icons/icon-maskable-512-v2.png',
      sizes: '512x512',
      type: 'image/png',
    });
    expect(lies('public/manifest.webmanifest')).not.toContain('/icons/icon-192.png');
    expect(lies('public/manifest.webmanifest')).not.toContain('/icons/icon-512.png"');
    const sw = lies('public/sw.js');
    expect(sw).toContain('cortex-1.5.1');
    expect(sw).toContain('/.well-known/');
    expect(sw).not.toContain('cortex-1.0.0');
    expect(sw).not.toContain('/icons/icon-192.png');

    const dateien: Array<[string, number]> = [
      ['public/icons/icon-192-v2.png', 192],
      ['public/icons/icon-512-v2.png', 512],
      ['public/icons/icon-maskable-512-v2.png', 512],
      ['public/icons/apple-touch-icon-v2.png', 180],
      ['public/icons/favicon-v2.png', 32],
    ];
    for (const [relativ, kante] of dateien) {
      expect(fs.existsSync(path.join(CLIENT, relativ))).toBe(true);
      const bild = liesPng(relativ);
      expect(bild.width).toBe(kante);
      expect(bild.height).toBe(kante);
      vollflaechig(bild);
      inSichererZone(bild);
      const gruppen = baender(bild);
      expect(gruppen).toHaveLength(3);
      const breiten = gruppen.map((band) => band.rechts - band.links);
      expect(breiten[0]).toBeGreaterThan(breiten[1]);
      expect(breiten[1]).toBeGreaterThan(breiten[2]);
      const toleranz = Math.max(2, Math.round(kante * 0.02));
      expect(Math.abs(gruppen[0].links - gruppen[1].links)).toBeLessThanOrEqual(toleranz);
      expect(Math.abs(gruppen[0].links - gruppen[2].links)).toBeLessThanOrEqual(toleranz);
    }
  });
});
