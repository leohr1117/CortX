import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts', 'client/src/**/*.test.ts', 'client/src/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
    environment: 'node',
    fileParallelism: false,
  },
});
