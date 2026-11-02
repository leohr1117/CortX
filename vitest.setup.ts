import fs from 'node:fs';
import path from 'node:path';

const kennung = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? String(process.pid);
const ordner = path.resolve('tmp-test', 'vitest');
fs.mkdirSync(ordner, { recursive: true });
process.env.CORTX_TEST = '1';
process.env.CORTX_DB = path.join(ordner, `vitest-${kennung}.db`);
