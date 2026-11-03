import type { VersionsAenderung, VersionsAntwort } from '../../../../shared/features/version/index.ts';
import { anfrageFehl } from '../../../../shared/kern/texte.ts';
import { meldeAblauf } from '../zugang/Sitzung.tsx';

async function liesJson(antwort: Response): Promise<VersionsAntwort> {
  if (!antwort.ok) {
    meldeAblauf(antwort.status);
    throw new Error(anfrageFehl(antwort.status));
  }
  return (await antwort.json()) as VersionsAntwort;
}

export function ladeStand(): Promise<VersionsAntwort> {
  return fetch('/api/version', { cache: 'no-store' }).then(liesJson);
}

export function merkeStand(teil: VersionsAenderung): Promise<VersionsAntwort> {
  return fetch('/api/version', {
    method: 'PATCH',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(teil),
  }).then(liesJson);
}
