import { test as basis, expect } from '@playwright/test';

let projektSaat = '';

export const test = basis.extend({
  _stelleSaat: [async ({}, nutzen, testInfo) => {
    if (projektSaat !== testInfo.project.name) {
      projektSaat = testInfo.project.name;
      const { stelleSaat } = await import('./schau.ts');
      stelleSaat();
    }
    await nutzen(undefined);
  }, { auto: true }],
});

export { expect };
