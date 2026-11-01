import fs from 'node:fs';
import path from 'node:path';

const kennung = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? String(process.pid);
const ordner = path.resolve('tmp-bau', 'vitest');
fs.mkdirSync(ordner, { recursive: true });
process.env.CORTEX_TEST = '1';
process.env.CORTEX_DB = path.join(ordner, `vitest-${kennung}.db`);
