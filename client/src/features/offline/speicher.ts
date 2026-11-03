import { TEXTE } from '../../../../shared/kern/texte.ts';
import type { WarteschlangeEintrag } from './warteschlange.ts';

export const LOKAL_DB = 'cortex';
export const ENTWURF_STORE = 'draft';
export const ENTWURF_ID = 'capture';
export const WARTESCHLANGE_STORE = 'queue';

export function notizEntwurfId(id: number): string {
  return `note:${id}`;
}

let kette: Promise<void> = Promise.resolve();

export function exklusiv<T>(arbeit: () => Promise<T>): Promise<T> {
  const ergebnis = kette.then(arbeit, arbeit);
  kette = ergebnis.then(
    () => undefined,
    () => undefined,
  );
  return ergebnis;
}

function oeffne(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error(TEXTE.speicherWeg));
  return new Promise((resolve, reject) => {
    const anfrage = indexedDB.open(LOKAL_DB, 1);
    anfrage.onupgradeneeded = () => {
      const db = anfrage.result;
      if (!db.objectStoreNames.contains(ENTWURF_STORE)) db.createObjectStore(ENTWURF_STORE);
      if (!db.objectStoreNames.contains(WARTESCHLANGE_STORE)) {
        db.createObjectStore(WARTESCHLANGE_STORE, { keyPath: 'clientId' });
      }
    };
    anfrage.onsuccess = () => resolve(anfrage.result);
    anfrage.onerror = () => reject(anfrage.error ?? new Error(TEXTE.speicherWeg));
  });
}

async function liesWert(schluessel: string): Promise<string> {
  const db = await oeffne();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(ENTWURF_STORE, 'readonly');
      const lesen = tx.objectStore(ENTWURF_STORE).get(schluessel);
      lesen.onsuccess = () => {
        const wert = lesen.result as { text?: string } | undefined;
        resolve(wert?.text ?? '');
      };
      lesen.onerror = () => reject(lesen.error ?? new Error(TEXTE.entwurfLesen));
    });
  } finally {
    db.close();
  }
}

async function schreibWert(schluessel: string, text: string): Promise<void> {
  const db = await oeffne();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ENTWURF_STORE, 'readwrite');
      const store = tx.objectStore(ENTWURF_STORE);
      if (text.length === 0) store.delete(schluessel);
      else store.put({ text }, schluessel);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error(TEXTE.entwurfSchreiben));
      tx.onabort = () => reject(tx.error ?? new Error(TEXTE.entwurfSchreiben));
    });
  } finally {
    db.close();
  }
}

function liesEntwurfOffen(): Promise<string> {
  return liesWert(ENTWURF_ID);
}

export function putEntwurfOffen(text: string): Promise<void> {
  return schreibWert(ENTWURF_ID, text);
}

export async function liesQueueOffen(): Promise<WarteschlangeEintrag[]> {
  const db = await oeffne();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(WARTESCHLANGE_STORE, 'readonly');
      const lesen = tx.objectStore(WARTESCHLANGE_STORE).getAll();
      lesen.onsuccess = () => resolve(lesen.result as WarteschlangeEintrag[]);
      lesen.onerror = () => reject(lesen.error ?? new Error(TEXTE.reiheLesen));
    });
  } finally {
    db.close();
  }
}

export async function putQueueOffen(eintrag: WarteschlangeEintrag): Promise<void> {
  const db = await oeffne();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(WARTESCHLANGE_STORE, 'readwrite');
      tx.objectStore(WARTESCHLANGE_STORE).put(eintrag);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error(TEXTE.speichernNotiz));
      tx.onabort = () => reject(tx.error ?? new Error(TEXTE.speichernNotiz));
    });
  } finally {
    db.close();
  }
}

export async function entferneQueueOffen(clientId: string): Promise<void> {
  const db = await oeffne();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(WARTESCHLANGE_STORE, 'readwrite');
      tx.objectStore(WARTESCHLANGE_STORE).delete(clientId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error(TEXTE.reiheSchreiben));
      tx.onabort = () => reject(tx.error ?? new Error(TEXTE.reiheSchreiben));
    });
  } finally {
    db.close();
  }
}

export function liesEntwurf(): Promise<string> {
  return exklusiv(liesEntwurfOffen);
}

export function schreibEntwurf(text: string): Promise<void> {
  return exklusiv(() => putEntwurfOffen(text));
}

export function liesNotizEntwurf(id: number): Promise<string> {
  return exklusiv(() => liesWert(notizEntwurfId(id)));
}

export function schreibNotizEntwurf(id: number, text: string): Promise<void> {
  return exklusiv(() => schreibWert(notizEntwurfId(id), text));
}
