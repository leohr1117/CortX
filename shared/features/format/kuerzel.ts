import type { TextWahl } from './ueberschrift.ts';
import { leseDokument } from './lesen.ts';

export function liegtInCode(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return false;
  return leseDokument(text).belege.some(
    (beleg) => (beleg.art === 'code' || beleg.art === 'codeblock') && index >= beleg.ganzVon && index < beleg.ganzBis,
  );
}

export function wandleKuerzel(text: string, cursor: number): TextWahl | null {
  const pos = Number.isFinite(cursor) ? Math.max(0, Math.min(Math.floor(cursor), text.length)) : 0;
  if (pos === 0 || liegtInCode(text, pos - 1)) return null;
  const von = text.lastIndexOf('\n', pos - 1) + 1;
  const davor = text.slice(von, pos);
  if (davor === '[ ]') {
    const stelle = von + 3;
    return { text: text.slice(0, von) + '[] ' + text.slice(pos), start: stelle, ende: stelle };
  }
  const fund = /(^|[\s(\[])([^\s*]+)(\*\*)$/.exec(davor);
  const wort = fund?.[2];
  if (!wort || wort.includes('#')) return null;
  const wortVon = pos - wort.length - 2;
  if (wortVon < von || text.slice(wortVon, pos) !== `${wort}**`) return null;
  const stelle = wortVon + wort.length + 4;
  return { text: text.slice(0, wortVon) + `**${wort}**` + text.slice(pos), start: stelle, ende: stelle };
}
