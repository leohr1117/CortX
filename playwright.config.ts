import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const E2E_PORT = 3110;
const datenbank = path.resolve('tmp-bau', `e2e-${process.pid}.db`);
const url = `http://127.0.0.1:${E2E_PORT}`;

fs.mkdirSync(path.resolve('tmp-bau'), { recursive: true });
fs.writeFileSync(path.resolve('tmp-bau', 'e2e-lauf.json'), JSON.stringify({ datenbank, url }));

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: url,
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'handy', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning server/index.ts',
    url,
    reuseExistingServer: false,
    env: {
      CORTEX_TEST: '1',
      CORTEX_DB: datenbank,
      PORT: String(E2E_PORT),
      LOG_LEVEL: 'warn',
    },
  },
});
