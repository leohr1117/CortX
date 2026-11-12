import type { Mark, Node } from 'prosemirror-model';
import { ART } from '../../../../shared/features/format/index.ts';

export const LESE_MARKEN = [ART.wichtig, ART.link, 'strich', ART.fett, ART.kursiv, ART.code] as const;

export type LeseStueck = { text: string } | { marke: Mark; teile: LeseStueck[] };

export interface LeseHaken {
  abgehakt: boolean;
  pos: number;
  zeilen: Node[];
}

export type KnotenBlock =
  | { art: typeof ART.ueberschrift; stufe: number; knoten: Node }
  | { art: typeof ART.wichtig; knoten: Node }
  | { art: typeof ART.liste; geordnet: boolean; schrift: string; punkte: Node[][] }
  | { art: typeof ART.haken; punkte: LeseHaken[] }
  | { art: typeof ART.codeblock; text: string }
  | { art: typeof ART.absatz; zeilen: Array<Node | null> }
  | { art: 'trennlinie' };

function ohneEnde(quelle: string): string {
  const ohne = quelle.endsWith('\n') ? quelle.slice(0, -1) : quelle;
  return ohne.endsWith('\r') ? ohne.slice(0, -1) : ohne;
}

function quelleVon(knoten: Node): string {
  return String(knoten.attrs.quelle ?? '');
}

function rang(marke: Mark): number {
  const stelle = (LESE_MARKEN as readonly string[]).indexOf(marke.type.name);
  return stelle < 0 ? LESE_MARKEN.length : stelle;
}

export function leseStuecke(knoten: Node): LeseStueck[] {
  const wurzel: LeseStueck[] = [];
  const offen: Array<{ marke: Mark; teile: LeseStueck[] }> = [];
  knoten.forEach((kind) => {
    if (!kind.isText || !kind.text) return;
    const marken = [...kind.marks].sort((a, b) => rang(a) - rang(b));
    let gleich = 0;
    while (gleich < offen.length && gleich < marken.length && offen[gleich]!.marke.eq(marken[gleich]!)) gleich += 1;
    offen.length = gleich;
    for (const marke of marken.slice(gleich)) {
      const huelle = { marke, teile: [] as LeseStueck[] };
      (offen.at(-1)?.teile ?? wurzel).push(huelle);
      offen.push(huelle);
    }
    (offen.at(-1)?.teile ?? wurzel).push({ text: kind.text });
  });
  return wurzel;
}

function istFortsetzung(knoten: Node): boolean {
  return knoten.type.name === 'punkt' && ohneEnde(quelleVon(knoten)).startsWith(' ');
}

function istZaun(knoten: Node): boolean {
  if (knoten.textContent.length > 0) return false;
  const kern = ohneEnde(quelleVon(knoten));
  const zaun = String(knoten.attrs.zaun ?? '');
  return kern !== '' && zaun !== '' && kern.startsWith(zaun[0] ?? '');
}

function codeBloecke(gruppe: readonly Node[]): { bloecke: KnotenBlock[]; offen: boolean } {
  const bloecke: KnotenBlock[] = [];
  let zeilen: string[] | null = null;
  let leerAuf = false;
  gruppe.forEach((knoten, index) => {
    const leer = knoten.textContent.length === 0 && ohneEnde(quelleVon(knoten)) === '';
    if (zeilen === null) {
      leerAuf = leer;
      zeilen = istZaun(knoten) || leer ? [] : [knoten.textContent];
      return;
    }
    const schliesst = istZaun(knoten) || (leer && leerAuf && index === gruppe.length - 1);
    if (!schliesst) {
      zeilen.push(knoten.textContent);
      return;
    }
    bloecke.push({ art: ART.codeblock, text: zeilen.join('\n') });
    zeilen = null;
  });
  if (zeilen !== null) bloecke.push({ art: ART.codeblock, text: (zeilen as string[]).join('\n') });
  return { bloecke, offen: zeilen !== null };
}

function endetMitUmbruch(doc: Node): boolean {
  const letzte = doc.lastChild;
  if (!letzte) return false;
  return quelleVon(letzte).endsWith('\n') || letzte.type.name === 'leerzeile';
}

function punktArt(knoten: Node): string {
  return String(knoten.attrs.art ?? ART.liste);
}

export function leseKnoten(doc: Node): KnotenBlock[] {
  const kinder: Array<{ knoten: Node; pos: number }> = [];
  doc.forEach((knoten, pos) => kinder.push({ knoten, pos }));
  const bloecke: KnotenBlock[] = [];
  let offenerCode = false;
  let i = 0;
  while (i < kinder.length) {
    const { knoten, pos } = kinder[i]!;
    const name = knoten.type.name;
    offenerCode = false;
    if (name === 'codeblock') {
      const gruppe: Node[] = [];
      while (i < kinder.length && kinder[i]!.knoten.type.name === 'codeblock') gruppe.push(kinder[i++]!.knoten);
      const code = codeBloecke(gruppe);
      bloecke.push(...code.bloecke);
      offenerCode = code.offen;
      continue;
    }
    if (name === 'ueberschrift') {
      bloecke.push({ art: ART.ueberschrift, stufe: Number(knoten.attrs.stufe ?? 0), knoten });
      i += 1;
      continue;
    }
    if (name === 'trennlinie') {
      bloecke.push({ art: 'trennlinie' });
      i += 1;
      continue;
    }
    if (name === 'wichtigZeile') {
      bloecke.push({ art: ART.wichtig, knoten });
      i += 1;
      continue;
    }
    if (name === 'punkt' && punktArt(knoten) === ART.haken) {
      const punkte: LeseHaken[] = [{ abgehakt: knoten.attrs.abgehakt === true, pos, zeilen: [knoten] }];
      i += 1;
      while (i < kinder.length && kinder[i]!.knoten.type.name === 'punkt' && punktArt(kinder[i]!.knoten) === ART.haken) {
        const naechster = kinder[i]!;
        if (istFortsetzung(naechster.knoten)) punkte.at(-1)!.zeilen.push(naechster.knoten);
        else punkte.push({ abgehakt: naechster.knoten.attrs.abgehakt === true, pos: naechster.pos, zeilen: [naechster.knoten] });
        i += 1;
      }
      bloecke.push({ art: ART.haken, punkte });
      continue;
    }
    if (name === 'punkt') {
      const art = punktArt(knoten);
      const geordnet = art === ART.nummer;
      const schrift = geordnet ? String(knoten.attrs.nummerArt ?? '') : '';
      const punkte: Node[][] = [[knoten]];
      i += 1;
      while (i < kinder.length) {
        const naechster = kinder[i]!.knoten;
        if (naechster.type.name !== 'punkt' || punktArt(naechster) !== art) break;
        if (geordnet && String(naechster.attrs.nummerArt ?? '') !== schrift) break;
        if (!geordnet && istFortsetzung(naechster)) punkte.at(-1)!.push(naechster);
        else punkte.push([naechster]);
        i += 1;
      }
      bloecke.push({ art: ART.liste, geordnet, schrift, punkte });
      continue;
    }
    const zeilen: Array<Node | null> = [];
    while (i < kinder.length && ['absatz', 'leerzeile'].includes(kinder[i]!.knoten.type.name)) {
      const zeile = kinder[i++]!.knoten;
      zeilen.push(zeile.type.name === 'leerzeile' ? null : zeile);
    }
    if (zeilen.length === 0) i += 1;
    else bloecke.push({ art: ART.absatz, zeilen });
  }
  if (!offenerCode && endetMitUmbruch(doc)) {
    const letzter = bloecke.at(-1);
    if (letzter?.art === ART.absatz) letzter.zeilen.push(null);
    else bloecke.push({ art: ART.absatz, zeilen: [null] });
  }
  return bloecke;
}
