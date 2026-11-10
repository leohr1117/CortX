import type { Node } from 'prosemirror-model';
import { ART, EBENE } from '../format/baum.ts';
import { exportiere } from '../format/md.ts';
import { modell } from '../format/modell.ts';
import { hakenVon } from '../format/zeile.ts';
import { PFAD_PRAEFIX, liesPfadName } from './register.ts';
import { schluessel } from './text.ts';

export interface ZielTeil {
  pfad: string | null;
  doc: Node;
}

interface ZielSchnitt {
  pfad: string;
  schnitt: number;
}

function kinder(doc: Node): Node[] {
  const aus: Node[] = [];
  for (let index = 0; index < doc.childCount; index += 1) aus.push(doc.child(index));
  return aus;
}

function nackt(knoten: Node): Node {
  if (String(knoten.attrs.quelle ?? '') === '') return knoten;
  const attrs = { ...(knoten.attrs ?? {}), quelle: '' };
  if (knoten.isLeaf) return knoten.type.createChecked(attrs);
  return knoten.type.createChecked(attrs, knoten.content);
}

function docAus(liste: readonly Node[], behalteQuelle = false): Node {
  return modell.node('doc', null, behalteQuelle ? [...liste] : liste.map(nackt));
}

function leerzeile(): Node {
  return modell.nodes.leerzeile!.createChecked();
}

function absatz(text: string): Node {
  if (text.length === 0) return modell.nodes.absatz!.createChecked();
  return modell.nodes.absatz!.createChecked(null, modell.text(text));
}

function kopf(name: string): Node {
  const inhalt = name.length === 0 ? null : modell.text(name);
  return modell.nodes.ueberschrift!.createChecked({ stufe: EBENE.abschnitt, zeichen: '#' }, inhalt);
}

function textDokument(text: string): Node {
  if (text.length === 0) return modell.node('doc', null, []);
  return modell.node('doc', null, [absatz(text)]);
}

export function istLeer(doc: Node): boolean {
  return exportiere(doc).trim().length === 0;
}

function randZeileLeer(knoten: Node): boolean {
  if (knoten.type.name === 'leerzeile') return true;
  if (knoten.type.name !== 'absatz') return false;
  return knoten.textContent.length === 0;
}

function zeilenEndeVon(quelle: string): { kern: string; ende: string } {
  if (quelle.endsWith('\r\n')) return { kern: quelle.slice(0, -2), ende: '\r\n' };
  if (quelle.endsWith('\n')) return { kern: quelle.slice(0, -1), ende: '\n' };
  if (quelle.endsWith('\r')) return { kern: quelle.slice(0, -1), ende: '\r' };
  return { kern: quelle, ende: '' };
}

function mitQuelle(knoten: Node, quelle: string): Node {
  const attrs = { ...knoten.attrs, quelle };
  if (knoten.isLeaf) return knoten.type.createChecked(attrs);
  return knoten.type.createChecked(attrs, knoten.content, knoten.marks);
}

function ohneZeilenende(knoten: Node): Node {
  const quelle = String(knoten.attrs.quelle ?? '');
  const { kern, ende } = zeilenEndeVon(quelle);
  if (ende === '') return knoten;
  return mitQuelle(knoten, kern);
}

export function ohneRandzeilen(doc: Node): Node {
  const alle = kinder(doc);
  let anfang = 0;
  let ende = alle.length;
  while (anfang < ende && randZeileLeer(alle[anfang]!)) anfang += 1;
  while (ende > anfang && randZeileLeer(alle[ende - 1]!)) ende -= 1;
  if (anfang === ende) return anfang === 0 ? doc : modell.node('doc', null, []);
  const letzter = ohneZeilenende(alle[ende - 1]!);
  if (anfang === 0 && ende === alle.length && letzter === alle[ende - 1]) return doc;
  const liste = alle.slice(anfang, ende - 1);
  liste.push(letzter);
  return modell.node('doc', null, liste);
}

function hakenKurz(knoten: Node): Node {
  if (knoten.type.name !== 'punkt' || String(knoten.attrs.art ?? '') !== ART.haken) return knoten;
  const quelle = String(knoten.attrs.quelle ?? '');
  const { kern, ende } = zeilenEndeVon(quelle);
  const fund = hakenVon(kern);
  if (!fund) return knoten;
  const abgehakt = knoten.attrs.abgehakt === true;
  if (fund.abgehakt === abgehakt) return knoten;
  const marker = abgehakt ? '[x]' : '[]';
  const luecke = fund.rest.length > 0 ? ' ' : '';
  const neu = `${marker}${luecke}${fund.rest}${ende}`;
  if (neu === quelle) return knoten;
  return mitQuelle(knoten, neu);
}

export function mitHakenKurz(doc: Node): Node {
  const alle = kinder(doc);
  let anders = false;
  const neu = alle.map((knoten) => {
    const ersetzt = hakenKurz(knoten);
    if (ersetzt !== knoten) anders = true;
    return ersetzt;
  });
  if (!anders) return doc;
  return modell.node('doc', null, neu);
}

function randLeer(knoten: Node): boolean {
  if (knoten.type.name === 'codeblock') return false;
  return knoten.textContent.trim().length === 0;
}

function ohneEnde(liste: readonly Node[]): Node[] {
  let ende = liste.length;
  while (ende > 0 && randLeer(liste[ende - 1]!)) ende -= 1;
  return liste.slice(0, ende);
}

function istStufe2(knoten: Node): boolean {
  return knoten.type.name === 'ueberschrift' && Number(knoten.attrs.stufe) === EBENE.abschnitt;
}

function gleicherAbschnitt(knoten: Node, name: string): boolean {
  return istStufe2(knoten) && schluessel(knoten.textContent) === schluessel(name);
}

export function titelAusKnoten(doc: Node): string {
  for (let index = 0; index < doc.childCount; index += 1) {
    const kind = doc.child(index);
    if (kind.type.name === 'leerzeile') continue;
    const text = kind.textContent.trim();
    if (text.length === 0) continue;
    return text;
  }
  return '';
}

export function abschnitteAusKnoten(doc: Node): string[] {
  const namen: string[] = [];
  for (let index = 0; index < doc.childCount; index += 1) {
    const kind = doc.child(index);
    if (!istStufe2(kind)) continue;
    namen.push(kind.textContent.trim());
  }
  return namen;
}

function zielVon(knoten: Node): ZielSchnitt | null {
  if (knoten.type.name === 'codeblock') return null;
  const text = knoten.textContent;
  if (!text.startsWith(PFAD_PRAEFIX)) return null;
  const name = liesPfadName(text.slice(PFAD_PRAEFIX.length));
  if (!name) return null;
  const danach = text.slice(PFAD_PRAEFIX.length + name.length);
  if (danach.length > 0 && !/^\s/u.test(danach)) return null;
  const luecke = /^\s+/u.exec(danach);
  return { pfad: name, schnitt: PFAD_PRAEFIX.length + name.length + (luecke?.[0].length ?? 0) };
}

function restVon(knoten: Node, schnitt: number): Node | null {
  if (schnitt <= 0 || schnitt >= knoten.content.size) return null;
  const rest = nackt(knoten.cut(schnitt));
  if (rest.textContent.length === 0) return null;
  return rest;
}

export function teileDokument(doc: Node): ZielTeil[] {
  const alle = kinder(doc);
  const stellen: number[] = [];
  for (let index = 0; index < alle.length; index += 1) {
    if (zielVon(alle[index]!)) stellen.push(index);
  }
  if (stellen.length === 0) return [{ pfad: null, doc }];
  const teile: ZielTeil[] = [];
  const erste = stellen[0]!;
  if (erste > 0) {
    const davor = modell.node('doc', null, alle.slice(0, erste));
    if (!istLeer(davor)) teile.push({ pfad: null, doc: davor });
  }
  for (let cursor = 0; cursor < stellen.length; cursor += 1) {
    const index = stellen[cursor]!;
    const bis = stellen[cursor + 1] ?? alle.length;
    const ziel = zielVon(alle[index]!)!;
    const inhalt: Node[] = [];
    const rest = restVon(alle[index]!, ziel.schnitt);
    if (rest) inhalt.push(rest);
    for (let folge = index + 1; folge < bis; folge += 1) inhalt.push(alle[folge]!);
    teile.push({ pfad: ziel.pfad, doc: modell.node('doc', null, inhalt) });
  }
  return teile;
}

export function neueSeiteKnoten(
  titel: string | null,
  abschnitt: string | null,
  body: Node,
  ersatz = '',
  behalteQuelle = false,
): Node {
  if (!titel) {
    if (istLeer(body)) return textDokument(ersatz.trim());
    return body;
  }
  const liste: Node[] = [absatz(titel)];
  if (abschnitt) {
    liste.push(leerzeile(), kopf(abschnitt));
    if (!istLeer(body)) liste.push(leerzeile(), ...kinder(body));
  } else if (!istLeer(body)) liste.push(leerzeile(), ...kinder(body));
  return docAus(liste, behalteQuelle);
}

export function haengeKnoten(seite: Node, block: Node, abschnitt: string | null, behalteQuelle = false): Node {
  const alle = kinder(seite);
  if (!abschnitt) {
    if (istLeer(block)) return seite;
    return docAus([...ohneEnde(alle), leerzeile(), ...kinder(block)], behalteQuelle);
  }
  const index = alle.findIndex((knoten) => gleicherAbschnitt(knoten, abschnitt));
  if (index < 0) {
    const neu = [...ohneEnde(alle), leerzeile(), kopf(abschnitt)];
    if (!istLeer(block)) neu.push(leerzeile(), ...kinder(block));
    return docAus(neu, behalteQuelle);
  }
  if (istLeer(block)) return seite;
  let bis = alle.length;
  for (let cursor = index + 1; cursor < alle.length; cursor += 1) {
    if (istStufe2(alle[cursor]!)) {
      bis = cursor;
      break;
    }
  }
  const danach = alle.slice(bis);
  const mitte = [...alle.slice(0, index + 1), ...ohneEnde(alle.slice(index + 1, bis)), leerzeile(), ...kinder(block)];
  if (danach.length > 0) mitte.push(leerzeile());
  return docAus([...mitte, ...danach], behalteQuelle);
}
