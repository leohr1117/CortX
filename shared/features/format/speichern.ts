import { type Mark, type Node } from 'prosemirror-model';
import { ART } from './baum.ts';
import { FLUCHTZEICHEN } from './inline.ts';
import { lade } from './laden.ts';
import { formatVon, inlineFormate, type FormatId } from './register.ts';

interface Stueck {
  text: string;
  marks: readonly Mark[];
}

interface Versuch {
  voll: boolean;
  ausweichen: boolean;
}

const VERSUCHE: readonly Versuch[] = [
  { voll: false, ausweichen: false }, { voll: false, ausweichen: true },
  { voll: true, ausweichen: false }, { voll: true, ausweichen: true },
];

function opakId(): string {
  return inlineFormate()[0]?.id ?? '';
}

function rohtext(doc: Node): string | null {
  let aus = '';
  let ganz = true;
  doc.forEach((knoten) => {
    const quelle = knoten.attrs.quelle;
    if (typeof quelle !== 'string') ganz = false;
    else aus += quelle;
  });
  return ganz ? aus : null;
}

function attrsGleich(links: Record<string, unknown>, rechts: Record<string, unknown>): boolean {
  const namen = new Set([...Object.keys(links), ...Object.keys(rechts)]);
  for (const name of namen) {
    if (name === 'quelle') continue;
    if (links[name] !== rechts[name]) return false;
  }
  return true;
}

function marksGleich(links: readonly Mark[], rechts: readonly Mark[]): boolean {
  if (links.length !== rechts.length) return false;
  const sortiert = (marks: readonly Mark[]) => [...marks].sort((a, b) => a.type.name.localeCompare(b.type.name) || String(a.attrs.ziel ?? '').localeCompare(String(b.attrs.ziel ?? '')));
  const a = sortiert(links);
  const b = sortiert(rechts);
  return a.every((mark, index) => mark.eq(b[index]!));
}

function knotenGleich(links: Node, rechts: Node): boolean {
  if (links.type !== rechts.type || links.childCount !== rechts.childCount) return false;
  if (!attrsGleich(links.attrs as Record<string, unknown>, rechts.attrs as Record<string, unknown>)) return false;
  if (links.isText || rechts.isText) return links.text === rechts.text && marksGleich(links.marks, rechts.marks);
  for (let i = 0; i < links.childCount; i += 1) {
    if (!knotenGleich(links.child(i), rechts.child(i))) return false;
  }
  return true;
}

function gleicheQuelle(links: Node, rechts: Node): boolean {
  if (links.childCount !== rechts.childCount) return false;
  for (let i = 0; i < links.childCount; i += 1) {
    const a = links.child(i);
    const b = rechts.child(i);
    if (String(a.attrs.quelle ?? '') !== String(b.attrs.quelle ?? '')) return false;
    if (!knotenGleich(a, b)) return false;
  }
  return true;
}

function ladeStill(text: string): Node | null {
  try {
    return lade(text);
  } catch {
    return null;
  }
}

function ohneEnde(quelle: string): string {
  const ohne = quelle.endsWith('\n') ? quelle.slice(0, -1) : quelle;
  return ohne.endsWith('\r') ? ohne.slice(0, -1) : ohne;
}

function kinderVon(doc: Node): Node[] {
  return Array.from({ length: doc.childCount }, (_, index) => doc.child(index));
}

function allein(knoten: Node): boolean {
  const quelle = String(knoten.attrs.quelle ?? '');
  if (quelle === '') return false;
  const doc = ladeStill(quelle);
  return doc !== null && doc.childCount === 1 && doc.child(0).eq(knoten);
}

function markerListe(id: string): string[] {
  const format = formatVon(id as FormatId);
  const paare = format.syntax?.paare;
  if (!paare || paare.length === 0) {
    const zeichen = format.zeichen[0] ?? '';
    return zeichen === '' ? [] : [zeichen];
  }
  const knopf = paare.filter((eintrag) => eintrag.knopf).map((eintrag) => eintrag.marker);
  const rest = paare.filter((eintrag) => !eintrag.knopf).map((eintrag) => eintrag.marker);
  return [...knopf, ...rest];
}

function waehleMarker(id: string, inhalt: string, aus: string, aktion: string, ausweichen: boolean): string {
  const liste = markerListe(id).filter((eintrag) => eintrag.length > 0);
  const sicher = liste.filter((eintrag) => !inhalt.includes(eintrag));
  const reihe = sicher.length > 0 ? sicher : liste;
  let basis = reihe[0] ?? '';
  if (ausweichen && reihe.length > 1) basis = reihe[1] ?? basis;
  if (aktion === 'auf') return basis;
  const schwanz = aus.at(-1) ?? '';
  if (schwanz !== '' && basis.startsWith(schwanz)) {
    const andere = reihe.find((eintrag) => eintrag !== basis && !eintrag.startsWith(schwanz));
    if (andere) return andere;
  }
  return basis;
}

function sortiere(marks: readonly Mark[]): Mark[] {
  const rang = new Map<string, number>(inlineFormate().map((format) => [format.id, format.reihenfolge]));
  return [...marks].sort((a, b) => (rang.get(b.type.name) ?? 0) - (rang.get(a.type.name) ?? 0));
}

function zeichenVon(knoten: Node): Array<{ z: string; marks: readonly Mark[] }> {
  const aus: Array<{ z: string; marks: readonly Mark[] }> = [];
  knoten.forEach((kind) => {
    if (!kind.isText || !kind.text) return;
    for (const z of kind.text) aus.push({ z, marks: kind.marks });
  });
  return aus;
}

function randNachAussen(zeichen: Array<{ z: string; marks: readonly Mark[] }>): Array<{ z: string; marks: readonly Mark[] }> {
  const aus = zeichen.map((eintrag) => ({ z: eintrag.z, marks: [...eintrag.marks] }));
  const gesehen: Mark[] = [];
  for (const eintrag of aus) {
    for (const mark of eintrag.marks) {
      if (!gesehen.some((bekannt) => bekannt.eq(mark))) gesehen.push(mark);
    }
  }
  for (const mark of gesehen) {
    let index = 0;
    while (index < aus.length) {
      if (!aus[index]!.marks.some((eintrag) => eintrag.eq(mark))) {
        index += 1;
        continue;
      }
      let ende = index;
      while (ende < aus.length && aus[ende]!.marks.some((eintrag) => eintrag.eq(mark))) ende += 1;
      let links = index;
      while (links < ende && /\s/u.test(aus[links]!.z)) {
        aus[links]!.marks = aus[links]!.marks.filter((eintrag) => !eintrag.eq(mark));
        links += 1;
      }
      let rechts = ende - 1;
      while (rechts >= links && /\s/u.test(aus[rechts]!.z)) {
        aus[rechts]!.marks = aus[rechts]!.marks.filter((eintrag) => !eintrag.eq(mark));
        rechts -= 1;
      }
      index = ende;
    }
  }
  return aus;
}

function gruppiere(zeichen: Array<{ z: string; marks: readonly Mark[] }>): Stueck[] {
  const aus: Stueck[] = [];
  for (const eintrag of zeichen) {
    const letzte = aus[aus.length - 1];
    if (letzte && marksGleich(letzte.marks, eintrag.marks)) {
      letzte.text += eintrag.z;
      continue;
    }
    aus.push({ text: eintrag.z, marks: eintrag.marks });
  }
  return aus;
}

function codeZaun(inhalt: string, zeichen: string): string {
  let lauf = 0;
  let max = 0;
  for (const z of inhalt) {
    lauf = z === zeichen ? lauf + 1 : 0;
    if (lauf > max) max = lauf;
  }
  return zeichen.repeat(Math.max(1, max + 1));
}

function oeffne(mark: Mark, inhalt: string, ausweichen: boolean, gewaehlt: Map<string, string>, aus: string, aktion: string): string {
  const format = inlineFormate().find((eintrag) => eintrag.id === mark.type.name);
  if (!format) return '';
  if (format.marken) return format.zeichen[0] ?? '';
  if (format.id === opakId()) {
    const zeichen = waehleMarker(format.id, '', aus, aktion, ausweichen) || '`';
    let zaun = codeZaun(inhalt, zeichen);
    const schwanz = aus.at(-1) ?? '';
    if (aktion !== 'auf' && schwanz === zeichen) zaun += zeichen;
    gewaehlt.set(mark.type.name, zaun);
    return zaun;
  }
  const marker = waehleMarker(format.id, inhalt, aus, aktion, ausweichen);
  gewaehlt.set(mark.type.name, marker);
  return marker;
}

function schliesse(mark: Mark, gewaehlt: Map<string, string>): string {
  const format = inlineFormate().find((eintrag) => eintrag.id === mark.type.name);
  if (!format) return '';
  if (format.marken) {
    const key = Object.keys(format.marken)[0] ?? '';
    return `${format.zeichen[1] ?? ''}${String(mark.attrs[key] ?? '')}${format.zeichen[2] ?? ''}`;
  }
  return gewaehlt.get(mark.type.name) ?? waehleMarker(format.id, '', '', 'auf', false);
}

function maskiere(text: string, voll: boolean): string {
  let aus = '';
  for (const z of text) {
    if (z === '\\' || (voll && FLUCHTZEICHEN.has(z))) aus += `\\${z}`;
    else aus += z;
  }
  return aus;
}

function schreibeInline(knoten: Node, voll: boolean, ausweichen: boolean): string {
  const stuecke = gruppiere(randNachAussen(zeichenVon(knoten)));
  const gewaehlt = new Map<string, string>();
  let offen: Mark[] = [];
  let aus = '';
  let aktion = 'text';
  for (let index = 0; index < stuecke.length; index += 1) {
    const stueck = stuecke[index]!;
    const ziel = sortiere(stueck.marks);
    for (let k = offen.length - 1; k >= 0; k -= 1) {
      aus += schliesse(offen[k]!, gewaehlt);
      aktion = 'zu';
    }
    for (let k = 0; k < ziel.length; k += 1) {
      const mark = ziel[k]!;
      aus += oeffne(mark, stueck.text, ausweichen, gewaehlt, aus, aktion);
      aktion = 'auf';
    }
    offen = ziel;
    const opak = stueck.marks.some((mark) => mark.type.name === opakId());
    aus += opak ? stueck.text : maskiere(stueck.text, voll);
    if (stueck.text.length > 0) aktion = 'text';
  }
  for (let k = offen.length - 1; k >= 0; k -= 1) aus += schliesse(offen[k]!, gewaehlt);
  return aus;
}

function prefixMit(id: FormatId, index: number): string {
  const format = formatVon(id);
  if (index === 0 && format.syntax?.einsetzen) return format.syntax.einsetzen;
  const zeichen = format.zeichen[index] ?? format.zeichen[0] ?? '';
  return zeichen.endsWith(' ') ? zeichen : `${zeichen} `;
}

function kopfPrefix(knoten: Node): string {
  const format = formatVon(ART.ueberschrift);
  const basis = format.zeichen[0] ?? '=';
  const hash = format.zeichen[1] ?? '#';
  if (String(knoten.attrs.zeichen ?? basis) === basis) return format.syntax?.einsetzen ?? `${basis} `;
  const stufe = Number(knoten.attrs.stufe ?? 1);
  const n = Math.min(6, Math.max(1, Number.isFinite(stufe) ? Math.floor(stufe) : 1));
  return `${hash.repeat(n === 0 ? 1 : n)} `;
}

function istFortsetzung(knoten: Node): boolean {
  return knoten.type.name === 'punkt' && ohneEnde(String(knoten.attrs.quelle ?? '')).startsWith(' ');
}

function punktPrefix(knoten: Node): string {
  if (istFortsetzung(knoten)) return /^ +/.exec(ohneEnde(String(knoten.attrs.quelle ?? '')))?.[0] ?? '';
  const art = String(knoten.attrs.art ?? ART.liste);
  if (art === ART.haken) return prefixMit(ART.haken, knoten.attrs.abgehakt === true ? 1 : 0);
  if (art === ART.nummer) return prefixMit(ART.nummer, 0);
  return prefixMit(ART.liste, 0);
}

function wichtigPrefix(): string {
  const format = formatVon(ART.wichtig);
  return format.syntax?.zeile ?? format.zeichen[1] ?? '';
}

function codeGruppe(kinder: readonly Node[], index: number): { start: number; ende: number } {
  let start = index;
  let ende = index;
  while (start > 0 && kinder[start - 1]?.type.name === 'codeblock') start -= 1;
  while (ende + 1 < kinder.length && kinder[ende + 1]?.type.name === 'codeblock') ende += 1;
  return { start, ende };
}

function istZaunKern(kern: string, zaun: string): boolean {
  if (kern === '' || zaun === '' || !kern.startsWith(zaun)) return false;
  return !kern.slice(zaun.length).includes(zaun[0] ?? '');
}

function codeKern(knoten: Node, index: number, kinder: readonly Node[]): string {
  if (knoten.textContent.length > 0) return knoten.textContent;
  const kern = ohneEnde(String(knoten.attrs.quelle ?? ''));
  const zaun = String(knoten.attrs.zaun ?? formatVon(ART.codeblock).zeichen[0] ?? '');
  if (istZaunKern(kern, zaun)) return kern;
  const gruppe = codeGruppe(kinder, index);
  if (kern === '' && (index === gruppe.start || index === gruppe.ende)) return zaun;
  return '';
}

function kernVon(knoten: Node, index: number, kinder: readonly Node[], voll: boolean, ausweichen: boolean): string {
  const name = knoten.type.name;
  if (name === 'leerzeile') return '';
  if (name === 'codeblock') return codeKern(knoten, index, kinder);
  const inline = schreibeInline(knoten, voll, ausweichen);
  if (name === 'wichtigZeile') return `${wichtigPrefix()}${inline}`;
  if (name === 'ueberschrift') return `${kopfPrefix(knoten)}${inline}`;
  if (name === 'punkt') return `${punktPrefix(knoten)}${inline}`;
  return inline;
}

function umbruchVon(knoten: Node, index: number, kinder: readonly Node[]): string {
  const quelle = String(knoten.attrs.quelle ?? '');
  if (quelle.endsWith('\r\n')) return '\r\n';
  if (quelle.endsWith('\n')) return '\n';
  const letzte = index === kinder.length - 1;
  if (!letzte || knoten.type.name === 'leerzeile') return '\n';
  if (knoten.type.name === 'codeblock' && knoten.textContent === '' && codeKern(knoten, index, kinder) === '') return '\n';
  return '';
}

function passtCode(knoten: Node, text: string): boolean {
  const zaun = String(knoten.attrs.zaun ?? '');
  const kern = ohneEnde(text);
  if (kern === zaun || istZaunKern(kern, zaun)) return true;
  const probe = `${zaun}\n${kern}\n${zaun}`;
  const doc = ladeStill(probe);
  return doc !== null && doc.childCount === 3 && knotenGleich(doc.child(1), knoten);
}

function passtZeile(knoten: Node, text: string): boolean {
  if (knoten.type.name === 'codeblock') return passtCode(knoten, text);
  if (istFortsetzung(knoten)) return true;
  const doc = ladeStill(text);
  return doc !== null && doc.childCount === 1 && knotenGleich(doc.child(0), knoten);
}

function schreibeZeile(knoten: Node, index: number, kinder: readonly Node[]): string {
  const bruch = umbruchVon(knoten, index, kinder);
  const gebaut = VERSUCHE.map((versuch) => kernVon(knoten, index, kinder, versuch.voll, versuch.ausweichen) + bruch);
  if (istFortsetzung(knoten)) return gebaut[0] ?? bruch;
  for (const text of gebaut) {
    if (passtZeile(knoten, text)) return text;
  }
  return gebaut[2] ?? gebaut[0] ?? bruch;
}

function basisVon(kinder: readonly Node[]): Node[] | null {
  const doc = ladeStill(kinder.map((knoten) => String(knoten.attrs.quelle ?? '')).join(''));
  return doc ? kinderVon(doc) : null;
}

function setze(doc: Node): string {
  const kinder = kinderVon(doc);
  const basis = basisVon(kinder);
  let j = 0;
  let aus = '';
  for (let i = 0; i < kinder.length; i += 1) {
    const knoten = kinder[i]!;
    if (basis && j < basis.length && knoten.eq(basis[j]!)) {
      aus += String(knoten.attrs.quelle ?? '');
      j += 1;
      continue;
    }
    if (basis && j + 1 < basis.length && knoten.eq(basis[j + 1]!)) {
      j += 1;
      i -= 1;
      continue;
    }
    if (allein(knoten)) {
      aus += String(knoten.attrs.quelle ?? '');
      continue;
    }
    const eingefuegt = Boolean(basis && j < basis.length && i + 1 < kinder.length && kinder[i + 1]!.eq(basis[j]!));
    aus += schreibeZeile(knoten, i, kinder);
    if (!eingefuegt && basis && j < basis.length) j += 1;
  }
  return aus;
}

export function speichere(doc: Node): string {
  const roh = rohtext(doc);
  const erneut = roh === null ? null : ladeStill(roh);
  return roh !== null && erneut && gleicheQuelle(erneut, doc) ? roh : setze(doc);
}
