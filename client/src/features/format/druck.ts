import { leseDokument, type Beleg } from '../../../../shared/features/format/index.ts';

export interface Druck {
  fett: boolean;
  kursiv: boolean;
  strich: boolean;
  code: boolean;
  link: boolean;
  ueberschrift: boolean;
  liste: boolean;
  haken: boolean;
}

function zeileAm(text: string, index: number): string {
  const von = text.lastIndexOf('\n', index - 1) + 1;
  const danach = text.indexOf('\n', index);
  const roh = text.slice(von, danach < 0 ? text.length : danach);
  return roh.endsWith('\r') ? roh.slice(0, -1) : roh;
}

function istListe(zeile: string): boolean {
  return zeile.startsWith('- ') || zeile.startsWith('* ') || zeile.startsWith('+ ') || /^(\d{1,9})\. /.test(zeile);
}

function istHaken(zeile: string): boolean {
  return zeile.startsWith('[]') || zeile.startsWith('[x]') || /^[-*+] \[( |x)\]/.test(zeile);
}

function innen(beleg: Beleg, start: number, ende: number): boolean {
  if (start === ende) return start >= beleg.von && start <= beleg.bis;
  return start >= beleg.von && ende <= beleg.bis;
}

export function leseDruck(text: string, start: number, ende: number): Druck {
  const kopf = Math.max(0, Math.min(start, text.length));
  const schwanz = Math.max(kopf, Math.min(ende, text.length));
  const fund = leseDokument(text).belege;
  const hat = (art: Beleg['art']) => fund.some((beleg) => beleg.art === art && innen(beleg, kopf, schwanz));
  const zeile = zeileAm(text, kopf);
  const codeblock = fund.some(
    (beleg) => beleg.art === 'codeblock' && kopf >= beleg.ganzVon && schwanz <= beleg.ganzBis,
  );
  return {
    fett: hat('fett'),
    kursiv: hat('kursiv'),
    strich: hat('streich'),
    code: hat('code') || codeblock,
    link: hat('link'),
    ueberschrift: zeile.startsWith('= '),
    liste: istListe(zeile),
    haken: istHaken(zeile),
  };
}
