import { ART, type Beleg } from './baum.ts';
import { inlineAn } from './befehl.ts';
import { leseDokument, zeilenTreffer } from './lesen.ts';

function spanne(text: string, start: number, ende: number): { kopf: number; schwanz: number } {
  const kopf = Math.max(0, Math.min(start, text.length));
  const schwanz = Math.max(kopf, Math.min(ende, text.length));
  return { kopf, schwanz };
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
  if (inlineAn(text, kopf, schwanz).wichtig) return true;
  return zeilenTreffer(text, kopf, (beleg) => beleg.art === ART.wichtig && beleg.marker.length === 1) !== null;
}

export function aktivCode(text: string, start: number, ende: number): boolean {
  const { kopf, schwanz } = spanne(text, start, ende);
  if (inlineAn(text, kopf, schwanz).code) return true;
  return leseDokument(text).belege.some(
    (beleg) => beleg.art === ART.codeblock && kopf >= beleg.ganzVon && schwanz <= beleg.ganzBis,
  );
}

export function aktivLink(text: string, start: number, ende: number): boolean {
  const { kopf, schwanz } = spanne(text, start, ende);
  return leseDokument(text).belege.some((beleg) => beleg.art === ART.link && inhalt(beleg, kopf, schwanz));
}

export function aktivKopf(text: string, start: number, ende: number): boolean {
  return zeilenTreffer(text, spanne(text, start, ende).kopf, (beleg) => beleg.art === ART.ueberschrift) !== null;
}

export function aktivListe(text: string, start: number, ende: number): boolean {
  return (
    zeilenTreffer(text, spanne(text, start, ende).kopf, (beleg) => {
      if (beleg.art === ART.liste || beleg.art === ART.nummer) return true;
      return beleg.art === ART.haken && (beleg.listenLaenge ?? 0) > 0;
    }) !== null
  );
}

export function aktivHaken(text: string, start: number, ende: number): boolean {
  return zeilenTreffer(text, spanne(text, start, ende).kopf, (beleg) => beleg.art === ART.haken) !== null;
}
