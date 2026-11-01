import { MOCK_PORT, starteStrideMock } from '../server/features/zugang/mock.ts';

const mock = await starteStrideMock(MOCK_PORT);
process.env.CORTEX_STRIDE_URL = mock.url;
await import('../server/index.ts');
