import type { TextWahl } from './ueberschrift.ts';
import { schalteUeberschrift } from './ueberschrift.ts';
import { hakenVon, listenLaenge, nummerLaenge, ohneWagen } from './zeile.ts';

function klemme(text: string, start: number, ende: number): { start: number; ende: number } {
  const links = Number.isFinite(start) ? Math.floor(start) : 0;
  const rechts = Number.isFinite(ende) ? Math.floor(ende) : links;
  const von = Math.max(0, Math.min(links, text.length));
  const bis = Math.max(0, Math.min(rechts, text.length));
  return von <= bis ? { start: von, ende: bis } : { start: bis, ende: von };
}

function istAussen(text: string, start: number, ende: number, marker: string): boolean {
  if (start < marker.length || ende + marker.length > text.length) return false;
  if (text.slice(start - marker.length, start) !== marker) return false;
  if (text.slice(ende, ende + marker.length) !== marker) return false;
  if (marker.length === 1 && (marker === '*' || marker === '_' || marker === '`')) {
    if (text[start - marker.length - 1] === marker) return false;
    if (text[ende + marker.length] === marker) return false;
  }
  return true;
}

export function umwickle(text: string, start: number, ende: number, marker: string): TextWahl {
  const wahl = klemme(text, start, ende);
  if (istAussen(text, wahl.start, wahl.ende, marker)) {
    const neu =
      text.slice(0, wahl.start - marker.length) +
      text.slice(wahl.start, wahl.ende) +
      text.slice(wahl.ende + marker.length);
    return {
      text: neu,
      start: wahl.start - marker.length,
      ende: wahl.ende - marker.length,
    };
  }
  const innen = text.slice(wahl.start, wahl.ende);
  if (innen.length >= marker.length * 2 + 1 && innen.startsWith(marker) && innen.endsWith(marker)) {
    const kern = innen.slice(marker.length, innen.length - marker.length);
    return {
      text: text.slice(0, wahl.start) + kern + text.slice(wahl.ende),
      start: wahl.start,
      ende: wahl.start + kern.length,
    };
  }
  return {
    text: text.slice(0, wahl.start) + marker + innen + marker + text.slice(wahl.ende),
    start: wahl.start + marker.length,
    ende: wahl.start + marker.length + innen.length,
  };
}

function zeileUm(text: string, index: number): { von: number; bis: number } {
  const von = text.lastIndexOf('\n', index - 1) + 1;
  const danach = text.indexOf('\n', index);
  return { von, bis: danach < 0 ? text.length : danach };
}

function schiebe(index: number, von: number, delta: number): number {
  if (index < von) return index;
  return Math.max(von, index + delta);
}

function schaltePraefix(
  text: string,
  start: number,
  ende: number,
  marker: string,
  istAn: (zeile: string) => boolean,
  laengeWeg: (zeile: string) => number,
): TextWahl {
  const wahl = klemme(text, start, ende);
  const { von, bis } = zeileUm(text, wahl.start);
  const roh = text.slice(von, bis);
  const wagen = roh.endsWith('\r') ? '\r' : '';
  const kern = ohneWagen(roh);
  const an = istAn(kern);
  const delta = an ? -laengeWeg(kern) : marker.length;
  const neuKern = an ? kern.slice(laengeWeg(kern)) : marker + kern;
  return {
    text: text.slice(0, von) + neuKern + wagen + text.slice(bis),
    start: schiebe(wahl.start, von, delta),
    ende: schiebe(wahl.ende, von, delta),
  };
}

function listenWeg(zeile: string): number {
  const liste = listenLaenge(zeile);
  if (liste > 0) return liste;
  return nummerLaenge(zeile);
}

export function schalteFett(text: string, start: number, ende: number): TextWahl {
  return umwickle(text, start, ende, '**');
}

export function schalteKursiv(text: string, start: number, ende: number): TextWahl {
  return umwickle(text, start, ende, '*');
}

export function schalteStrich(text: string, start: number, ende: number): TextWahl {
  return umwickle(text, start, ende, '~~');
}

export function schalteListe(text: string, start: number, ende: number): TextWahl {
  return schaltePraefix(text, start, ende, '- ', (zeile) => listenWeg(zeile) > 0, listenWeg);
}

export function schalteHaken(text: string, start: number, ende: number): TextWahl {
  return schaltePraefix(
    text,
    start,
    ende,
    '[] ',
    (zeile) => hakenVon(zeile) !== null,
    (zeile) => hakenVon(zeile)?.laenge ?? 0,
  );
}

export function schalteCode(text: string, start: number, ende: number): TextWahl {
  const wahl = klemme(text, start, ende);
  if (!text.slice(wahl.start, wahl.ende).includes('\n')) return umwickle(text, wahl.start, wahl.ende, '`');
  const von = text.lastIndexOf('\n', wahl.start - 1) + 1;
  let cursor = wahl.ende;
  if (wahl.ende > wahl.start && text[wahl.ende - 1] === '\n') cursor = wahl.ende - 1;
  const nl = text.indexOf('\n', cursor);
  const bis = nl < 0 ? text.length : nl;
  const block = text.slice(von, bis);
  const zeilen = block.split('\n');
  const erste = ohneWagen(zeilen[0] ?? '');
  const letzte = ohneWagen(zeilen[zeilen.length - 1] ?? '');
  if (zeilen.length >= 3 && erste === '```' && letzte === '```') {
    const kern = zeilen.slice(1, -1).join('\n');
    return { text: text.slice(0, von) + kern + text.slice(bis), start: von, ende: von + kern.length };
  }
  const eingefuegt = `\`\`\`\n${block}\n\`\`\``;
  const innen = von + 4;
  return { text: text.slice(0, von) + eingefuegt + text.slice(bis), start: innen, ende: innen + block.length };
}

export function schalteVerknuepfung(text: string, start: number, ende: number, ziel: string): TextWahl {
  const wahl = klemme(text, start, ende);
  const label = text.slice(wahl.start, wahl.ende);
  const kern = label.length > 0 ? label : ziel;
  const stueck = `[${kern}](${ziel})`;
  return {
    text: text.slice(0, wahl.start) + stueck + text.slice(wahl.ende),
    start: wahl.start + 1,
    ende: wahl.start + 1 + kern.length,
  };
}

export function schalteKopf(text: string, start: number, ende: number): TextWahl {
  return schalteUeberschrift(text, start, ende);
}
