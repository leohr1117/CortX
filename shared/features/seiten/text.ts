import { TEXTE } from '../../kern/texte.ts';
import { exportiere, importiere } from '../format/md.ts';
import { abschnitteAusKnoten, haengeKnoten, neueSeiteKnoten, titelAusKnoten } from './knoten.ts';

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

export function seitentitel(text: string): string {
  return titelAusKnoten(importiere(text));
}

export function abschnittNamen(text: string): string[] {
  return abschnitteAusKnoten(importiere(text));
}

export function zaehleAbschnitte(text: string): number {
  return abschnitteAusKnoten(importiere(text)).length;
}

export function neueSeite(titel: string | null, abschnitt: string | null, body: string, ersatz = ''): string {
  return exportiere(neueSeiteKnoten(titel, abschnitt, importiere(body.trim()), ersatz));
}

export function haengeBlock(seite: string, block: string, abschnitt: string | null): string {
  return exportiere(haengeKnoten(importiere(seite), importiere(block.trim()), abschnitt));
}

export function pfadText(topic: string, titel: string): string {
  if (titel.length === 0) return topic;
  return `${topic}${TEXTE.pfeil}${titel}`;
}
