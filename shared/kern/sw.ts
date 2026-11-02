export const SW_CACHE_PLATZHALTER = '__CORTX_CACHE__';

export function swCache(version: string): string {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('Service worker needs a version.');
  }
  return `cortx-${version}`;
}

export function setzeSwCache(quelle: string, version: string): string {
  const name = swCache(version);
  const fertig = `const CACHE = '${name}'`;
  if (quelle.includes(fertig)) return quelle;
  const zeile = `const CACHE = '${SW_CACHE_PLATZHALTER}'`;
  if (!quelle.includes(zeile)) {
    throw new Error('Service worker is missing the version placeholder.');
  }
  return quelle.replaceAll(SW_CACHE_PLATZHALTER, name);
}
