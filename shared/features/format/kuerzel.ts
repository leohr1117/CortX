import type { TextWahl } from './ueberschrift.ts';
import { leseDokument } from './lesen.ts';
import { kuerzelEintraege } from './register.ts';

function musterWort(ende: string): RegExp {
  const zeichen = ende[0] ?? '';
  const suffix = ende.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s(\\[])([^\\s${zeichen}]+)(${suffix})$`);
}

function wortKuerzel(text: string, pos: number, von: number, davor: string, ende: string): TextWahl | null {
  const wort = musterWort(ende).exec(davor)?.[2];
  if (!wort || wort.includes('#')) return null;
  const wortVon = pos - wort.length - ende.length;
  if (wortVon < von || text.slice(wortVon, pos) !== `${wort}${ende}`) return null;
  const stelle = wortVon + wort.length + ende.length * 2;
  return {
    text: text.slice(0, wortVon) + ende + wort + ende + text.slice(pos),
    start: stelle,
    ende: stelle,
  };
}

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
  for (const eintrag of kuerzelEintraege()) {
    const regel = eintrag.kuerzel;
    if (regel?.art !== 'zeile' || davor !== regel.genau) continue;
    const stelle = von + regel.genau.length;
    return { text: text.slice(0, von) + regel.ersatz + text.slice(pos), start: stelle, ende: stelle };
  }
  for (const eintrag of kuerzelEintraege()) {
    const regel = eintrag.kuerzel;
    if (regel?.art !== 'wort') continue;
    const fund = wortKuerzel(text, pos, von, davor, regel.ende);
    if (fund) return fund;
  }
  return null;
}
