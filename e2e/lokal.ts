import type { Page } from '@playwright/test';
import { ENTWURF_ID, ENTWURF_STORE, LOKAL_DB, WARTESCHLANGE_STORE } from '../client/src/features/offline/index.ts';

const STORES = { db: LOKAL_DB, entwurfStore: ENTWURF_STORE, entwurfId: ENTWURF_ID, queue: WARTESCHLANGE_STORE };

export async function warteBereit(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.bereit === '1');
}

export async function leereLokal(page: Page): Promise<void> {
  await page.goto('/');
  await warteBereit(page);
  await page.evaluate(async (namen) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const anfrage = indexedDB.open(namen.db);
      anfrage.onsuccess = () => resolve(anfrage.result);
      anfrage.onerror = () => reject(anfrage.error);
    });
    const vorhanden = [namen.entwurfStore, namen.queue].filter((name) => db.objectStoreNames.contains(name));
    if (vorhanden.length === 0) {
      db.close();
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(vorhanden, 'readwrite');
      for (const name of vorhanden) tx.objectStore(name).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, STORES);
  await page.reload();
  await warteBereit(page);
}

export async function liesEntwurf(page: Page): Promise<string> {
  return page.evaluate(async (namen) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const anfrage = indexedDB.open(namen.db);
      anfrage.onsuccess = () => resolve(anfrage.result);
      anfrage.onerror = () => reject(anfrage.error);
    });
    try {
      return await new Promise<string>((resolve, reject) => {
        const tx = db.transaction(namen.entwurfStore, 'readonly');
        const lesen = tx.objectStore(namen.entwurfStore).get(namen.entwurfId);
        lesen.onsuccess = () => {
          const wert = lesen.result as { text?: string } | undefined;
          resolve(wert?.text ?? '');
        };
        lesen.onerror = () => reject(lesen.error);
      });
    } finally {
      db.close();
    }
  }, STORES);
}

export async function warteschlangeLaenge(page: Page): Promise<number> {
  return page.evaluate(async (namen) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const anfrage = indexedDB.open(namen.db);
      anfrage.onsuccess = () => resolve(anfrage.result);
      anfrage.onerror = () => reject(anfrage.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const tx = db.transaction(namen.queue, 'readonly');
        const lesen = tx.objectStore(namen.queue).count();
        lesen.onsuccess = () => resolve(lesen.result);
        lesen.onerror = () => reject(lesen.error);
      });
    } finally {
      db.close();
    }
  }, STORES);
}
