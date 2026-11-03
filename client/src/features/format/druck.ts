import { formatVon, type FormatBefehl } from '../../../../shared/features/format/index.ts';

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
    fett: aktiv('fett', text, start, ende),
    kursiv: aktiv('kursiv', text, start, ende),
    strich: aktiv('strich', text, start, ende),
    code: aktiv('code', text, start, ende),
    link: aktiv('link', text, start, ende),
    ueberschrift: aktiv('ueberschrift', text, start, ende),
    liste: aktiv('liste', text, start, ende),
    haken: aktiv('haken', text, start, ende),
    wichtig: aktiv('wichtig', text, start, ende),
  };
}
