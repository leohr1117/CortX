import { expect, test } from './ruhe.ts';

const BILDER = 'tmp-test/screens';
const ICONS = [
  '/icons/icon-192-v2.png',
  '/icons/icon-512-v2.png',
  '/icons/icon-maskable-512-v2.png',
  '/icons/apple-touch-icon-v2.png',
  '/icons/favicon-v2.png',
];

test('the page title and sign-in page say CortX and the icons load', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page).toHaveTitle('CortX');
  await expect(page.locator('.marke')).toHaveText('CortX');
  await expect(page.getByText('Cortex', { exact: true })).toHaveCount(0);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'CortX');
  await page.screenshot({ path: `${BILDER}/${testInfo.project.name}-marke.png` });

  const manifestAntwort = await page.request.get('/manifest.webmanifest');
  expect(manifestAntwort.status()).toBe(200);
  const manifest = (await manifestAntwort.json()) as {
    id: string;
    name: string;
    short_name: string;
    icons: Array<{ src: string; purpose?: string }>;
  };
  expect(manifest.name).toBe('CortX');
  expect(manifest.short_name).toBe('CortX');
  expect(manifest.id).toBe('/');
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable' && icon.src === '/icons/icon-maskable-512-v2.png')).toBe(
    true,
  );

  for (const src of ICONS) {
    const antwort = await page.request.get(src);
    expect(antwort.status(), src).toBe(200);
    expect(antwort.headers()['content-type'] ?? '', src).toContain('image/png');
    const bytes = await antwort.body();
    expect(bytes.subarray(0, 8).toString('hex'), src).toBe('89504e470d0a1a0a');
  }
});
