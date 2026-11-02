import type { TextWahl } from './ueberschrift.ts';
import { schalteUeberschrift } from './ueberschrift.ts';
import { cursorInSchale, hatInlineWichtig, inlineAn, klemme, schalteInline } from './register.ts';
import { WICHTIG_ZEILE, hakenVon, listenLaenge, nummerLaenge, ohneWagen } from './zeile.ts';

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
  return schalteInline(text, start, ende, 'fett');
}

export function schalteKursiv(text: string, start: number, ende: number): TextWahl {
  return schalteInline(text, start, ende, 'kursiv');
}

export function schalteStrich(text: string, start: number, ende: number): TextWahl {
  return schalteInline(text, start, ende, 'streich');
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
  if (!text.slice(wahl.start, wahl.ende).includes('\n')) return schalteInline(text, wahl.start, wahl.ende, 'code');
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

function zeileKern(text: string, index: number): string {
  const { von, bis } = zeileUm(text, index);
  return ohneWagen(text.slice(von, bis));
}

function zeilenWichtig(text: string, start: number, ende: number): TextWahl {
  return schaltePraefix(
    text,
    start,
    ende,
    WICHTIG_ZEILE,
    (zeile) => zeile.startsWith(WICHTIG_ZEILE),
    (zeile) => (zeile.startsWith(WICHTIG_ZEILE) ? WICHTIG_ZEILE.length : 0),
  );
}

export function schalteWichtig(text: string, start: number, ende: number): TextWahl {
  const wahl = klemme(text, start, ende);
  const inhalt = text.slice(wahl.start, wahl.ende);
  const einzeilig = !inhalt.includes('\n');
  const kern = zeileKern(text, wahl.start);
  const zeilenForm = kern.startsWith(WICHTIG_ZEILE);
  if (einzeilig && hatInlineWichtig(text, wahl.start, wahl.ende)) {
    return schalteInline(text, wahl.start, wahl.ende, 'wichtig');
  }
  if (zeilenForm) return zeilenWichtig(text, wahl.start, wahl.ende);
  if (einzeilig && inlineAn(text, wahl.start, wahl.ende).wichtig) {
    return schalteInline(text, wahl.start, wahl.ende, 'wichtig');
  }
  if (einzeilig && (inhalt.length > 0 || cursorInSchale(text, wahl.start))) {
    return schalteInline(text, wahl.start, wahl.ende, 'wichtig');
  }
  return zeilenWichtig(text, wahl.start, wahl.ende);
}

export function schalteKopf(text: string, start: number, ende: number): TextWahl {
  return schalteUeberschrift(text, start, ende);
}
