import { type Mark, type Node } from 'prosemirror-model';
import { ART, type Beleg, type BelegArt, type LeseBlock, type LeseTeil } from './baum.ts';
import { leseDokument } from './lesen.ts';
import { modell } from './modell.ts';
import { formatVon, type FormatId } from './register.ts';

interface Ziel {
  marke?: string;
  knoten?: string;
  punkt?: string;
  format?: FormatId;
  zielAttr?: true;
}

const ZIELE: Record<BelegArt, Ziel> = {
  [ART.fett]: { marke: ART.fett },
  [ART.kursiv]: { marke: ART.kursiv },
  [ART.streich]: { marke: 'strich' },
  [ART.wichtig]: { marke: ART.wichtig, knoten: 'wichtigZeile' },
  [ART.code]: { marke: ART.code },
  [ART.link]: { marke: ART.link, zielAttr: true },
  [ART.codeblock]: { knoten: 'codeblock', format: ART.codeblock },
  [ART.liste]: { knoten: 'punkt', punkt: ART.liste, format: ART.liste },
  [ART.nummer]: { knoten: 'punkt', punkt: ART.nummer, format: ART.nummer },
  [ART.haken]: { knoten: 'punkt', punkt: ART.haken, format: ART.haken },
  [ART.ueberschrift]: { knoten: 'ueberschrift', format: ART.ueberschrift },
};

interface Zeile {
  von: number;
  quelle: string;
}

interface FlachZeile {
  art: 'zeile';
  teile: readonly LeseTeil[];
  fort: boolean;
}

interface FlachCode {
  art: 'code';
}

type Flach = FlachZeile | FlachCode;

function zeilenVon(text: string): Zeile[] {
  if (text.length === 0) return [];
  const aus: Zeile[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '\n') continue;
    aus.push({ von: start, quelle: text.slice(start, i + 1) });
    start = i + 1;
  }
  if (start < text.length) aus.push({ von: start, quelle: text.slice(start) });
  return aus;
}

function kern(quelle: string): string {
  const ohne = quelle.endsWith('\n') ? quelle.slice(0, -1) : quelle;
  return ohne.endsWith('\r') ? ohne.slice(0, -1) : ohne;
}

function zeichenAus(format: FormatId, beleg: Beleg, text: string): string {
  const zeichen = formatVon(format).zeichen;
  const marker = beleg.marker.map(([von, bis]) => text.slice(von, bis)).join('').replaceAll(' ', '');
  const treffer = zeichen.filter((eintrag) => marker.includes(eintrag)).sort((a, b) => b.length - a.length);
  const gewaehlt = treffer[0] ?? zeichen[0];
  if (!gewaehlt) throw new Error('missing character');
  return gewaehlt;
}

function istZeilenBeleg(beleg: Beleg): boolean {
  const ziel = ZIELE[beleg.art];
  if (!ziel.knoten || beleg.art === ART.codeblock) return false;
  if (ziel.marke && beleg.bisZeile === undefined) return false;
  return true;
}

function zeilenBeleg(belege: readonly Beleg[], von: number): Beleg | null {
  return belege.find((beleg) => beleg.ganzVon === von && istZeilenBeleg(beleg)) ?? null;
}

function fortsetzung(belege: readonly Beleg[], zeile: Zeile): Beleg | null {
  return (
    belege.find((beleg) => {
      if (!istZeilenBeleg(beleg) || beleg.folgeBis === undefined || beleg.bisZeile === undefined) return false;
      return zeile.von >= beleg.bisZeile && zeile.von < beleg.folgeBis;
    }) ?? null
  );
}

function attribute(ziel: Ziel, beleg: Beleg, quelle: string, text: string): Record<string, unknown> {
  const attrs: Record<string, unknown> = { quelle };
  if (ziel.punkt) attrs.art = ziel.punkt;
  if (ziel.knoten === 'punkt') {
    attrs.abgehakt = beleg.abgehakt === true;
    attrs.einzug = 0;
  }
  if (ziel.knoten === 'ueberschrift') attrs.stufe = beleg.stufe ?? 0;
  if (ziel.format && (ziel.knoten === 'ueberschrift' || ziel.knoten === 'punkt')) {
    attrs.zeichen = zeichenAus(ziel.format, beleg, text);
  }
  if (ziel.knoten === 'codeblock' && ziel.format) attrs.zaun = zeichenAus(ziel.format, beleg, text);
  return attrs;
}

function markeFuer(art: BelegArt, teil: LeseTeil): Mark | null {
  const ziel = ZIELE[art];
  if (!ziel.marke) return null;
  const typ = modell.marks[ziel.marke];
  if (!typ) throw new Error('missing mark');
  if (ziel.zielAttr) {
    const linkZiel = 'ziel' in teil && typeof teil.ziel === 'string' ? teil.ziel : '';
    return typ.create({ ziel: linkZiel });
  }
  return typ.create();
}

function inhaltAus(teile: readonly LeseTeil[], um: readonly Mark[] = []): Node[] {
  const aus: Node[] = [];
  for (const teil of teile) {
    if (teil.art === ART.text) {
      if (teil.text.length > 0) aus.push(modell.text(teil.text, um));
      continue;
    }
    const mark = markeFuer(teil.art, teil);
    const naechste = mark ? [...um, mark] : um;
    if ('teile' in teil && teil.teile) {
      aus.push(...inhaltAus(teil.teile, naechste));
      continue;
    }
    if ('text' in teil && teil.text.length > 0) aus.push(modell.text(teil.text, naechste));
  }
  return aus;
}

function blockKnoten(text: string, zeile: Zeile, teile: readonly LeseTeil[], beleg: Beleg): Node {
  const ziel = ZIELE[beleg.art];
  const name = ziel.knoten;
  if (!name) throw new Error('missing block');
  const typ = modell.nodes[name];
  if (!typ) throw new Error('missing block');
  const inhalt = inhaltAus(teile);
  return typ.createChecked(attribute(ziel, beleg, zeile.quelle, text), inhalt.length > 0 ? inhalt : null);
}

function codeKnoten(text: string, zeile: Zeile, beleg: Beleg): Node {
  const ziel = ZIELE[ART.codeblock];
  const typ = modell.nodes.codeblock;
  if (!typ) throw new Error('missing block');
  const zaun = beleg.marker.some(([von]) => von === zeile.von);
  const roh = kern(zeile.quelle).replaceAll('\r', '');
  const inhalt = zaun || roh.length === 0 ? null : modell.text(roh);
  return typ.createChecked(attribute(ziel, beleg, zeile.quelle, text), inhalt);
}

function zeileKnoten(text: string, zeile: Zeile, teile: readonly LeseTeil[], belege: readonly Beleg[], fort: boolean): Node {
  const beleg = fort ? fortsetzung(belege, zeile) : zeilenBeleg(belege, zeile.von);
  if (beleg) return blockKnoten(text, zeile, teile, beleg);
  if (kern(zeile.quelle).length === 0) return modell.nodes.leerzeile!.createChecked({ quelle: zeile.quelle });
  const inhalt = inhaltAus(teile);
  return modell.nodes.absatz!.createChecked({ quelle: zeile.quelle }, inhalt.length > 0 ? inhalt : null);
}

function trenne(teile: readonly LeseTeil[]): LeseTeil[][] {
  const aus: LeseTeil[][] = [[]];
  for (const teil of teile) {
    if (teil.art !== ART.text || !teil.text.includes('\n')) {
      aus[aus.length - 1]!.push(teil);
      continue;
    }
    const stuecke = teil.text.split('\n');
    for (let i = 0; i < stuecke.length; i += 1) {
      if (i > 0) aus.push([]);
      const stueck = stuecke[i] ?? '';
      if (stueck.length > 0) aus[aus.length - 1]!.push({ art: ART.text, text: stueck });
    }
  }
  return aus;
}

function leer(teile: readonly LeseTeil[]): boolean {
  return teile.every((teil) => teil.art === ART.text && teil.text.length === 0);
}

function flach(bloecke: readonly LeseBlock[]): Flach[] {
  const aus: Flach[] = [];
  for (const block of bloecke) {
    if (block.art === ART.codeblock) {
      aus.push({ art: 'code' });
      continue;
    }
    if (block.art === ART.absatz) {
      for (const teile of block.zeilen) aus.push({ art: 'zeile', teile, fort: false });
      continue;
    }
    if (block.art === ART.ueberschrift || block.art === ART.wichtig) {
      aus.push({ art: 'zeile', teile: block.teile, fort: false });
      continue;
    }
    if (block.art === ART.liste) {
      for (const teile of block.punkte) {
        trenne(teile).forEach((teileZeile, index) => aus.push({ art: 'zeile', teile: teileZeile, fort: index > 0 }));
      }
      continue;
    }
    for (const punkt of block.punkte) {
      trenne(punkt.teile).forEach((teileZeile, index) => aus.push({ art: 'zeile', teile: teileZeile, fort: index > 0 }));
    }
  }
  return aus;
}

function codeBeleg(belege: readonly Beleg[], von: number): Beleg {
  const beleg = belege.find((eintrag) => eintrag.art === ART.codeblock && eintrag.ganzVon === von);
  if (!beleg) throw new Error('missing block');
  return beleg;
}

export function lade(text: string): Node {
  const dokument = leseDokument(text);
  const zeilen = zeilenVon(text);
  const kinder: Node[] = [];
  let index = 0;
  for (const eintrag of flach(dokument.bloecke)) {
    if (eintrag.art === 'code') {
      const start = zeilen[index];
      if (!start) throw new Error('unaligned line');
      const beleg = codeBeleg(dokument.belege, start.von);
      const vorher = index;
      while (index < zeilen.length && zeilen[index]!.von < beleg.ganzBis) {
        kinder.push(codeKnoten(text, zeilen[index]!, beleg));
        index += 1;
      }
      if (index === vorher) throw new Error('unaligned line');
      continue;
    }
    const zeile = zeilen[index];
    if (!zeile) {
      if (eintrag.fort || !leer(eintrag.teile)) throw new Error('unaligned line');
      continue;
    }
    kinder.push(zeileKnoten(text, zeile, eintrag.teile, dokument.belege, eintrag.fort));
    index += 1;
  }
  if (index !== zeilen.length) throw new Error('unaligned line');
  return modell.node('doc', null, kinder);
}
