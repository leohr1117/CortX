import type { Beleg } from './baum.ts';
import { inlineAn } from './befehl.ts';
import { leseDokument } from './lesen.ts';
import { hakenVon, kopfMarke, listenLaenge, nummerLaenge, ohneWagen, wichtigZeile } from './zeile.ts';

function spanne(text: string, start: number, ende: number): { kopf: number; schwanz: number } {
  const kopf = Math.max(0, Math.min(start, text.length));
  const schwanz = Math.max(kopf, Math.min(ende, text.length));
  return { kopf, schwanz };
}

function zeileAm(text: string, index: number): string {
  const von = text.lastIndexOf('\n', index - 1) + 1;
  const danach = text.indexOf('\n', index);
  const roh = text.slice(von, danach < 0 ? text.length : danach);
  return ohneWagen(roh);
}

function inhalt(beleg: Beleg, start: number, ende: number): boolean {
  if (start === ende) return start >= beleg.von && start <= beleg.bis;
  return start >= beleg.von && ende <= beleg.bis;
}

export function aktivFett(text: string, start: number, ende: number): boolean {
  const { kopf, schwanz } = spanne(text, start, ende);
  return inlineAn(text, kopf, schwanz).fett;
}

export function aktivKursiv(text: string, start: number, ende: number): boolean {
  const { kopf, schwanz } = spanne(text, start, ende);
  return inlineAn(text, kopf, schwanz).kursiv;
}

export function aktivStrich(text: string, start: number, ende: number): boolean {
  const { kopf, schwanz } = spanne(text, start, ende);
  return inlineAn(text, kopf, schwanz).streich;
}

export function aktivWichtig(text: string, start: number, ende: number): boolean {
  const { kopf, schwanz } = spanne(text, start, ende);
  return inlineAn(text, kopf, schwanz).wichtig || wichtigZeile(zeileAm(text, kopf));
}

export function aktivCode(text: string, start: number, ende: number): boolean {
  const { kopf, schwanz } = spanne(text, start, ende);
  if (inlineAn(text, kopf, schwanz).code) return true;
  return leseDokument(text).belege.some(
    (beleg) => beleg.art === 'codeblock' && kopf >= beleg.ganzVon && schwanz <= beleg.ganzBis,
  );
}

export function aktivLink(text: string, start: number, ende: number): boolean {
  const { kopf, schwanz } = spanne(text, start, ende);
  return leseDokument(text).belege.some((beleg) => beleg.art === 'link' && inhalt(beleg, kopf, schwanz));
}

export function aktivKopf(text: string, start: number, ende: number): boolean {
  return kopfMarke(zeileAm(text, spanne(text, start, ende).kopf)) !== null;
}

export function aktivListe(text: string, start: number, ende: number): boolean {
  const zeile = zeileAm(text, spanne(text, start, ende).kopf);
  return listenLaenge(zeile) > 0 || nummerLaenge(zeile) > 0;
}

export function aktivHaken(text: string, start: number, ende: number): boolean {
  return hakenVon(zeileAm(text, spanne(text, start, ende).kopf)) !== null;
}
