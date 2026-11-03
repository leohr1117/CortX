import { ART, formatVon, type FormatBefehl } from '../../../../shared/features/format/index.ts';

export interface Druck {
  fett: boolean;
  kursiv: boolean;
  strich: boolean;
  code: boolean;
  link: boolean;
  ueberschrift: boolean;
  liste: boolean;
  haken: boolean;
  wichtig: boolean;
}

function aktiv(id: FormatBefehl, text: string, start: number, ende: number): boolean {
  const pruefe = formatVon(id).isActive;
  if (!pruefe) throw new Error('unknown command');
  return pruefe(text, start, ende);
}

export function leseDruck(text: string, start: number, ende: number): Druck {
  return {
    fett: aktiv(ART.fett, text, start, ende),
    kursiv: aktiv(ART.kursiv, text, start, ende),
    strich: aktiv('strich', text, start, ende),
    code: aktiv(ART.code, text, start, ende),
    link: aktiv(ART.link, text, start, ende),
    ueberschrift: aktiv(ART.ueberschrift, text, start, ende),
    liste: aktiv(ART.liste, text, start, ende),
    haken: aktiv(ART.haken, text, start, ende),
    wichtig: aktiv(ART.wichtig, text, start, ende),
  };
}
