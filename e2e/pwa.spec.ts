import { expect, test } from './ruhe.ts';

const BILDER = 'tmp-test/screens';

const MARKEN: Array<{ src: string; bytes: number; typ: string; kante?: number }> = [
  { src: '/icons/favicon-v3.svg', bytes: 343, typ: 'image/svg+xml' },
  { src: '/icons/favicon-v3.png', bytes: 1053, typ: 'image/png', kante: 32 },
  { src: '/icons/apple-touch-icon-v3.png', bytes: 5325, typ: 'image/png', kante: 180 },
  { src: '/icons/icon-192-v3.png', bytes: 4740, typ: 'image/png', kante: 192 },
  { src: '/icons/icon-512-v3.png', bytes: 15087, typ: 'image/png', kante: 512 },
  { src: '/icons/icon-maskable-512-v3.png', bytes: 9050, typ: 'image/png', kante: 512 },
];

function pngKante(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.toString('ascii', 12, 16)).toBe('IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('the page title and sign-in page say CortX and the icons load', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page).toHaveTitle('CortX');
  await expect(page.locator('.marke')).toHaveText('CortX');
  await expect(page.getByText('Cortex', { exact: true })).toHaveCount(0);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'CortX');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#141414');

  const icons = page.locator('link[rel="icon"]');
  await expect(icons).toHaveCount(2);
  await expect(icons.nth(0)).toHaveAttribute('type', 'image/svg+xml');
  await expect(icons.nth(0)).toHaveAttribute('href', '/icons/favicon-v3.svg');
  await expect(icons.nth(1)).toHaveAttribute('href', '/icons/favicon-v3.png');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon-v3.png');

  const html = await page.content();
  expect(html).not.toContain('-v2');
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-marke.png` });

  const manifestAntwort = await page.request.get('/manifest.webmanifest');
  expect(manifestAntwort.status()).toBe(200);
  const manifestText = await manifestAntwort.text();
  expect(manifestText).not.toContain('-v2');
  const manifest = JSON.parse(manifestText) as {
    id: string;
    name: string;
    short_name: string;
    theme_color: string;
    icons: Array<{ src: string; sizes: string; purpose?: string }>;
  };
  expect(manifest.name).toBe('CortX');
  expect(manifest.short_name).toBe('CortX');
  expect(manifest.id).toBe('/');
  expect(manifest.theme_color).toBe('#141414');
  expect(manifest.icons.map((icon) => icon.src)).toEqual([
    '/icons/icon-192-v3.png',
    '/icons/icon-512-v3.png',
    '/icons/icon-maskable-512-v3.png',
  ]);
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable' && icon.src === '/icons/icon-maskable-512-v3.png')).toBe(
    true,
  );

  for (const marke of MARKEN) {
    const antwort = await page.request.get(marke.src);
    expect(antwort.status(), marke.src).toBe(200);
    expect(antwort.headers()['content-type'] ?? '', marke.src).toContain(marke.typ);
    const bytes = await antwort.body();
    expect(bytes.length, marke.src).toBe(marke.bytes);
    if (marke.kante === undefined) {
      expect(bytes.subarray(0, 4).toString('utf8'), marke.src).toBe('<svg');
      continue;
    }
    const kante = pngKante(bytes);
    expect(kante.width, marke.src).toBe(marke.kante);
    expect(kante.height, marke.src).toBe(marke.kante);
  }
});
