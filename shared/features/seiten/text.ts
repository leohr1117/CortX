import { TEXTE } from '../../kern/texte.ts';
import { ART, EBENE, type LeseBlock, type LeseTeil } from '../format/baum.ts';
import { leseDokument } from '../format/lesen.ts';
import { kopfZeichen, zeilenStuecke } from '../format/zeile.ts';

export function ersteZeile(text: string): string {
  const ende = text.indexOf('\n');
  const roh = ende < 0 ? text : text.slice(0, ende);
  return roh.endsWith('\r') ? roh.slice(0, -1) : roh;
}

export function tokenForm(name: string): string {
  return name.trim().replace(/\s+/gu, '-');
}

export function schluessel(name: string): string {
  return tokenForm(name).toLocaleLowerCase();
}

function plain(teile: readonly LeseTeil[]): string {
  let aus = '';
  for (const teil of teile) {
    if (teil.art === ART.link) aus += plain(teil.teile);
    else if ('text' in teil) aus += teil.text;
    else aus += plain(teil.teile);
  }
  return aus;
}

function zeilenText(block: LeseBlock): string {
  if (block.art === ART.codeblock) return block.text;
  if (block.art === ART.ueberschrift || block.art === ART.wichtig) return plain(block.teile);
  if (block.art === ART.liste) return plain(block.punkte[0] ?? []);
  if (block.art === ART.haken) return plain(block.punkte[0]?.teile ?? []);
  return plain(block.zeilen[0] ?? []);
}

export function seitentitel(text: string): string {
  for (const stueck of zeilenStuecke(text)) {
    if (stueck.zeile.trim().length === 0) continue;
    const block = leseDokument(stueck.zeile).bloecke[0];
    if (!block) continue;
    return zeilenText(block).trim();
  }
  return '';
}

export interface AbschnittStelle {
  titel: string;
  inhaltBis: number;
}

export function abschnittStellen(text: string): AbschnittStelle[] {
  const dok = leseDokument(text);
  const koepfe: AbschnittStelle[] = [];
  let sucheAb = 0;
  for (const block of dok.bloecke) {
    if (block.art !== ART.ueberschrift || block.stufe !== EBENE.abschnitt) continue;
    const beleg = dok.belege.slice(sucheAb).find(
      (eintrag) => eintrag.art === ART.ueberschrift && eintrag.stufe === EBENE.abschnitt,
    );
    if (!beleg) continue;
    sucheAb = dok.belege.indexOf(beleg) + 1;
    koepfe.push({ titel: plain(block.teile).trim(), inhaltBis: beleg.ganzVon });
  }
  return koepfe.map((kopf, index) => ({
    titel: kopf.titel,
    inhaltBis: koepfe[index + 1]?.inhaltBis ?? text.length,
  }));
}

export function abschnittNamen(text: string): string[] {
  return abschnittStellen(text).map((stelle) => stelle.titel);
}

export function zaehleAbschnitte(text: string): number {
  return abschnittStellen(text).length;
}

function verbinde(links: string, rechts: string): string {
  const a = links.replace(/\s+$/u, '');
  const b = rechts.replace(/^\s+/u, '');
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  return `${a}\n\n${b}`;
}

export function neueSeite(titel: string | null, abschnitt: string | null, body: string, ersatz = ''): string {
  const rest = body.trim();
  if (!titel) return rest.length === 0 ? ersatz.trim() : rest;
  if (abschnitt) {
    const kopf = `${kopfZeichen(EBENE.abschnitt)}${abschnitt}`;
    const block = rest.length === 0 ? kopf : `${kopf}\n\n${rest}`;
    return verbinde(titel, block);
  }
  if (rest.length === 0) return titel;
  return verbinde(titel, rest);
}

export function haengeBlock(seite: string, block: string, abschnitt: string | null): string {
  const stueck = block.trim();
  if (!abschnitt) {
    if (stueck.length === 0) return seite;
    return verbinde(seite, stueck);
  }
  const stellen = abschnittStellen(seite);
  const treffer = stellen.find((stelle) => schluessel(stelle.titel) === schluessel(abschnitt));
  if (!treffer) {
    const zeile = `${kopfZeichen(EBENE.abschnitt)}${abschnitt}`;
    const kopf = stueck.length === 0 ? zeile : `${zeile}\n\n${stueck}`;
    return verbinde(seite, kopf);
  }
  if (stueck.length === 0) return seite;
  const davor = seite.slice(0, treffer.inhaltBis);
  const danach = seite.slice(treffer.inhaltBis);
  const mitte = verbinde(davor, stueck);
  if (danach.trim().length === 0) return mitte;
  return verbinde(mitte, danach);
}

export function pfadText(topic: string, titel: string): string {
  if (titel.length === 0) return topic;
  return `${topic}${TEXTE.pfeil}${titel}`;
}
