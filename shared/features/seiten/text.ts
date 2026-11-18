import type { Mark, Node } from 'prosemirror-model';
import { TEXTE } from '../../kern/texte.ts';
import { EBENE } from '../format/baum.ts';
import { knotenZuMarkdownOffset } from '../format/knotenOffset.ts';
import { schreibStuecke } from '../format/knotenSyntax.ts';
import { lade } from '../format/laden.ts';
import { mitTrennAbstand } from '../format/trennlinie.ts';
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

function kinder(doc: Node): Node[] {
  return Array.from({ length: doc.childCount }, (_, index) => doc.child(index));
}

function sichtbar(text: string, syntax: readonly boolean[]): string {
  let aus = '';
  for (let i = 0; i < text.length; i += 1) {
    const z = text[i] ?? '';
    if (syntax[i] || z === '\n' || z === '\r') continue;
    aus += z;
  }
  return aus;
}

function inhaltLaenge(doc: Node): number {
  let n = 0;
  doc.descendants((node) => {
    if (node.isText && node.text) n += node.text.length;
  });
  return n;
}

function traegt(doc: Node, text: string): boolean {
  const syntax = knotenZuMarkdownOffset(doc, text).syntax;
  if (syntax.length !== text.length) return false;
  let n = 0;
  for (let i = 0; i < text.length; i += 1) {
    const z = text[i] ?? '';
    if (!syntax[i] && z !== '\n' && z !== '\r') n += 1;
  }
  return n === inhaltLaenge(doc) && sichtbar(text, syntax) === doc.textContent;
}

function blockTexte(doc: Node, text: string): string[] {
  const abbildung = knotenZuMarkdownOffset(doc, text);
  const aus: string[] = [];
  doc.forEach((knoten, pos) => {
    const von = pos + 1;
    const bis = pos + knoten.nodeSize;
    let stueck = '';
    for (let i = 0; i < text.length; i += 1) {
      const z = text[i] ?? '';
      if (abbildung.syntax[i] || z === '\n' || z === '\r') continue;
      const stelle = abbildung.grenze[i];
      if (stelle === undefined || stelle < von || stelle >= bis) continue;
      stueck += z;
    }
    aus.push(stueck);
  });
  return aus;
}

function titelSichtbar(doc: Node, text: string): string | null {
  if (!traegt(doc, text)) return null;
  const texte = blockTexte(doc, text);
  for (let index = 0; index < doc.childCount; index += 1) {
    const kind = doc.child(index);
    if (kind.type.name === 'leerzeile') continue;
    const zeile = (texte[index] ?? '').trim();
    if (zeile.length === 0) continue;
    return zeile;
  }
  return '';
}

function abschnitteSichtbar(doc: Node, text: string): string[] | null {
  if (!traegt(doc, text)) return null;
  const texte = blockTexte(doc, text);
  const namen: string[] = [];
  for (let index = 0; index < doc.childCount; index += 1) {
    const kind = doc.child(index);
    if (kind.type.name !== 'ueberschrift' || Number(kind.attrs.stufe) !== EBENE.abschnitt) continue;
    namen.push((texte[index] ?? '').trim());
  }
  return namen;
}

export function seitentitel(text: string): string {
  const doc = lade(text);
  return titelSichtbar(doc, text) ?? titelAusKnoten(doc);
}

export function abschnittNamen(text: string): string[] {
  const doc = lade(text);
  return abschnitteSichtbar(doc, text) ?? abschnitteAusKnoten(doc);
}

export function zaehleAbschnitte(text: string): number {
  return abschnittNamen(text).length;
}

function attrsGleich(links: Node, rechts: Node): boolean {
  const a = links.attrs as Record<string, unknown>;
  const b = rechts.attrs as Record<string, unknown>;
  const namen = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const name of namen) {
    if (name === 'quelle' || name === 'flucht') continue;
    if (a[name] !== b[name]) return false;
  }
  return true;
}

function marksGleich(links: readonly Mark[], rechts: readonly Mark[]): boolean {
  if (links.length !== rechts.length) return false;
  const sortiert = (marks: readonly Mark[]) => [...marks].sort((x, y) => {
    const name = x.type.name.localeCompare(y.type.name);
    if (name !== 0) return name;
    return String(x.attrs.ziel ?? '').localeCompare(String(y.attrs.ziel ?? ''));
  });
  const a = sortiert(links);
  const b = sortiert(rechts);
  return a.every((mark, index) => mark.eq(b[index]!));
}

function gleich(links: Node, rechts: Node): boolean {
  if (links.type !== rechts.type || links.childCount !== rechts.childCount) return false;
  if (!attrsGleich(links, rechts)) return false;
  if (links.isText || rechts.isText) return links.text === rechts.text && marksGleich(links.marks, rechts.marks);
  for (let i = 0; i < links.childCount; i += 1) {
    if (!gleich(links.child(i)!, rechts.child(i)!)) return false;
  }
  return true;
}

function ohneEnde(quelle: string): string {
  const ohne = quelle.endsWith('\n') ? quelle.slice(0, -1) : quelle;
  return ohne.endsWith('\r') ? ohne.slice(0, -1) : ohne;
}

function ladeStill(text: string): Node | null {
  try {
    return lade(text);
  } catch {
    return null;
  }
}

function istZaunKern(kern: string, zaun: string): boolean {
  if (kern.length === 0 || zaun.length === 0 || !kern.startsWith(zaun)) return false;
  return !kern.slice(zaun.length).includes(zaun[0] ?? '');
}

function passtCode(knoten: Node, text: string): boolean {
  const zaun = String(knoten.attrs.zaun ?? '');
  const kern = ohneEnde(text);
  if (kern === zaun || istZaunKern(kern, zaun)) return true;
  const probe = `${zaun}\n${kern}\n${zaun}`;
  const doc = ladeStill(probe);
  return doc !== null && doc.childCount === 3 && gleich(doc.child(1)!, knoten);
}

function istFortsetzung(knoten: Node): boolean {
  return knoten.type.name === 'punkt' && ohneEnde(String(knoten.attrs.quelle ?? '')).startsWith(' ');
}

function passtZeile(knoten: Node, text: string): boolean {
  if (knoten.type.name === 'codeblock') return passtCode(knoten, text);
  if (istFortsetzung(knoten)) return true;
  const doc = ladeStill(text);
  return doc !== null && doc.childCount === 1 && gleich(doc.child(0)!, knoten);
}

function zeileVon(knoten: Node, index: number, liste: readonly Node[]): string {
  const stueck = schreibStuecke(knoten, index, liste);
  for (const kandidat of stueck.bevorzugt) {
    if (passtZeile(knoten, kandidat.text)) return kandidat.text;
  }
  return stueck.fallback.text;
}

function quellenText(doc: Node): string | null {
  let aus = '';
  let ganz = true;
  doc.forEach((knoten) => {
    const quelle = knoten.attrs.quelle;
    if (typeof quelle !== 'string') ganz = false;
    else aus += quelle;
  });
  return ganz ? aus : null;
}

function setze(doc: Node): string {
  const liste = kinder(doc);
  let aus = '';
  for (let i = 0; i < liste.length; i += 1) aus += zeileVon(liste[i]!, i, liste);
  return aus;
}

function schreibe(doc: Node): string {
  const roh = quellenText(doc);
  if (roh !== null && !(roh.length === 0 && doc.childCount > 0) && traegt(doc, roh)) return roh;
  return setze(mitTrennAbstand(doc));
}

export function neueSeite(titel: string | null, abschnitt: string | null, body: string, ersatz = ''): string {
  return schreibe(neueSeiteKnoten(titel, abschnitt, lade(body.trim()), ersatz));
}

export function haengeBlock(seite: string, block: string, abschnitt: string | null): string {
  return schreibe(haengeKnoten(lade(seite), lade(block.trim()), abschnitt));
}

export function pfadText(topic: string, titel: string): string {
  if (titel.length === 0) return topic;
  return `${topic}${TEXTE.pfeil}${titel}`;
}
