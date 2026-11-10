import type { Page } from '@playwright/test';
import {
  ENTWURF_ID,
  ENTWURF_STORE,
  LOKAL_DB,
  WARTESCHLANGE_STORE,
  notizEntwurfId,
} from '../client/src/features/offline/index.ts';
import { pruefeDokument } from '../shared/features/format/dokument.ts';
import { exportiere } from '../shared/features/format/md.ts';

function textAusLokal(roh: unknown): string {
  if (typeof roh === 'string') return roh;
  if (!roh || typeof roh !== 'object') return '';
  const wert = roh as { doc?: unknown; text?: unknown };
  if (Object.hasOwn(wert, 'doc')) {
    const knoten = pruefeDokument(wert.doc);
    if (knoten) return exportiere(knoten);
  }
  return typeof wert.text === 'string' ? wert.text : '';
}

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

async function liesSchluessel(page: Page, schluessel: string): Promise<string> {
  const roh = await page.evaluate(async (namen) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const anfrage = indexedDB.open(namen.db);
      anfrage.onsuccess = () => resolve(anfrage.result);
      anfrage.onerror = () => reject(anfrage.error);
    });
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(namen.entwurfStore, 'readonly');
        const lesen = tx.objectStore(namen.entwurfStore).get(namen.schluessel);
        lesen.onsuccess = () => resolve(lesen.result ?? '');
        lesen.onerror = () => reject(lesen.error);
      });
    } finally {
      db.close();
    }
  }, { ...STORES, schluessel });
  return textAusLokal(roh);
}

export function liesEntwurf(page: Page): Promise<string> {
  return liesSchluessel(page, ENTWURF_ID);
}

export function liesNotizEntwurf(page: Page, id: number): Promise<string> {
  return liesSchluessel(page, notizEntwurfId(id));
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
