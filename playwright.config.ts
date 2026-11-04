import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const E2E_PORT = 3110;
const datenbank = path.resolve('tmp-test', `e2e-${process.pid}.db`);
const url = `http://127.0.0.1:${E2E_PORT}`;

fs.mkdirSync(path.resolve('tmp-test'), { recursive: true });
// Process ids get reused, so a leftover database from an earlier run must not leak into this one.
if (!process.env.TEST_WORKER_INDEX) {
  for (const endung of ['', '-wal', '-shm']) fs.rmSync(datenbank + endung, { force: true });
}
fs.writeFileSync(path.resolve('tmp-test', 'e2e-lauf.json'), JSON.stringify({ datenbank, url }));

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  updateSnapshots: 'none',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: url,
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'handy',
      testIgnore: /[/\\]abnahme[/\\]/,
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
    {
      name: 'desktop',
      testIgnore: /[/\\]abnahme[/\\]/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'abnahme-handy',
      testMatch: /[/\\]abnahme[/\\].*\.spec\.ts$/,
      use: { ...devices['Pixel 7'], serviceWorkers: 'block' },
    },
    {
      name: 'abnahme-desktop',
      testMatch: /[/\\]abnahme[/\\].*\.spec\.ts$/,
      testIgnore: /[/\\]abnahme[/\\]handy\.spec\.ts$/,
      use: { viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' },
    },
  ],
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning e2e/server.ts',
    url,
    reuseExistingServer: false,
    env: {
      CORTX_TEST: '1',
      CORTX_DB: datenbank,
      PORT: String(E2E_PORT),
      LOG_LEVEL: 'warn',
    },
  },
});
