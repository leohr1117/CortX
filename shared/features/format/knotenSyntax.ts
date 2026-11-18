import { type Mark, type Node } from 'prosemirror-model';
import { ART } from './baum.ts';
import { FLUCHTZEICHEN } from './inline.ts';
import { prefixNummer } from './nummer.ts';
import { formatVon, inlineFormate, type FormatId } from './register.ts';
import { TRENNLINIE, TRENNLINIE_ZEICHEN, trennFlucht } from './trennlinie.ts';
import { LISTEN_EINFUEGEN, hakenVon, kopfZeichen, listenLaenge } from './zeile.ts';

export interface SchreibStueck {
  text: string;
  syntax: boolean[];
}

interface Versuch {
  voll: boolean;
  ausweichen: boolean;
}

interface Spanne {
  mark: Mark;
  von: number;
  bis: number;
}

const VERSUCHE: readonly Versuch[] = [
  { voll: false, ausweichen: false }, { voll: false, ausweichen: true },
  { voll: true, ausweichen: false }, { voll: true, ausweichen: true },
];

function opakId(): string {
  return inlineFormate()[0]?.id ?? '';
}

function ohneEnde(quelle: string): string {
  const ohne = quelle.endsWith('\n') ? quelle.slice(0, -1) : quelle;
  return ohne.endsWith('\r') ? ohne.slice(0, -1) : ohne;
}

function an(ziel: SchreibStueck, text: string, syntax: boolean): void {
  ziel.text += text;
  for (let i = 0; i < text.length; i += 1) ziel.syntax.push(syntax);
}

function ausZeichen(text: string, syntax: boolean): SchreibStueck {
  const stueck: SchreibStueck = { text: '', syntax: [] };
  an(stueck, text, syntax);
  return stueck;
}

function plus(links: SchreibStueck, rechts: SchreibStueck): SchreibStueck {
  return { text: links.text + rechts.text, syntax: [...links.syntax, ...rechts.syntax] };
}

function mitBruch(kern: SchreibStueck, bruch: string): SchreibStueck {
  return bruch === '' ? kern : plus(kern, ausZeichen(bruch, false));
}

function marksGleich(links: readonly Mark[], rechts: readonly Mark[]): boolean {
  if (links.length !== rechts.length) return false;
  const sortiert = (marks: readonly Mark[]) => [...marks].sort((a, b) => a.type.name.localeCompare(b.type.name) || String(a.attrs.ziel ?? '').localeCompare(String(b.attrs.ziel ?? '')));
  const a = sortiert(links);
  const b = sortiert(rechts);
  return a.every((mark, index) => mark.eq(b[index]!));
}

function markerListe(id: FormatId): string[] {
  const format = formatVon(id);
  const paare = format.syntax?.paare;
  if (!paare || paare.length === 0) {
    const zeichen = format.zeichen[0] ?? '';
    return zeichen === '' ? [] : [zeichen];
  }
  const knopf = paare.filter((eintrag) => eintrag.knopf).map((eintrag) => eintrag.marker);
  const rest = paare.filter((eintrag) => !eintrag.knopf).map((eintrag) => eintrag.marker);
  return [...knopf, ...rest];
}

function waehleMarker(id: FormatId, inhalt: string, aus: string, aktion: string, ausweichen: boolean): string {
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

function zeichenVon(knoten: Node): Array<{ z: string; marks: readonly Mark[] }> {
  const aus: Array<{ z: string; marks: readonly Mark[] }> = [];
  knoten.forEach((kind) => {
    if (!kind.isText || !kind.text) return;
    for (const z of kind.text) aus.push({ z, marks: kind.marks });
  });
  return aus;
}

function randNachAussen(zeichen: Array<{ z: string; marks: readonly Mark[] }>): Array<{ z: string; marks: Mark[] }> {
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

function gruppiere(zeichen: Array<{ z: string; marks: readonly Mark[] }>): Array<{ text: string; marks: readonly Mark[] }> {
  const aus: Array<{ text: string; marks: readonly Mark[] }> = [];
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

function spannen(stuecke: readonly { marks: readonly Mark[] }[]): Spanne[] {
  const aus: Spanne[] = [];
  for (let index = 0; index < stuecke.length; index += 1) {
    for (const mark of stuecke[index]!.marks) {
      const letzte = aus.find((eintrag) => eintrag.bis === index && eintrag.mark.eq(mark));
      if (letzte) letzte.bis = index + 1;
      else aus.push({ mark, von: index, bis: index + 1 });
    }
  }
  return aus;
}

function ordne(marks: readonly Mark[], index: number, liste: readonly Spanne[]): Mark[] {
  const rang = new Map<string, number>(inlineFormate().map((format) => [format.id, format.reihenfolge]));
  const fund = (mark: Mark) => liste.find((eintrag) => eintrag.mark.eq(mark) && eintrag.von <= index && index < eintrag.bis);
  return [...marks].sort((a, b) => {
    const links = fund(a);
    const rechts = fund(b);
    const weite = (rechts?.bis ?? 0) - (rechts?.von ?? 0) - ((links?.bis ?? 0) - (links?.von ?? 0));
    if (weite !== 0) return weite;
    if ((links?.von ?? 0) !== (rechts?.von ?? 0)) return (links?.von ?? 0) - (rechts?.von ?? 0);
    return (rang.get(b.type.name) ?? 0) - (rang.get(a.type.name) ?? 0);
  });
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

function maskiereAn(text: string, voll: boolean, bau: SchreibStueck): void {
  for (const z of text) {
    if (z === '\\' || (voll && FLUCHTZEICHEN.has(z))) an(bau, '\\', true);
    an(bau, z, false);
  }
}

function schreibeInline(knoten: Node, voll: boolean, ausweichen: boolean, flach = false): SchreibStueck {
  const stuecke = gruppiere(randNachAussen(zeichenVon(knoten)));
  const liste = flach ? [] : spannen(stuecke);
  const gewaehlt = new Map<string, string>();
  let offen: Mark[] = [];
  const bau: SchreibStueck = { text: '', syntax: [] };
  let aktion = 'text';
  for (let index = 0; index < stuecke.length; index += 1) {
    const stueck = stuecke[index]!;
    const ziel = ordne(stueck.marks, index, liste);
    let gleich = 0;
    if (!flach) {
      while (gleich < offen.length && gleich < ziel.length && offen[gleich]!.eq(ziel[gleich]!)) gleich += 1;
    }
    for (let k = offen.length - 1; k >= gleich; k -= 1) {
      an(bau, schliesse(offen[k]!, gewaehlt), true);
      aktion = 'zu';
    }
    for (let k = gleich; k < ziel.length; k += 1) {
      an(bau, oeffne(ziel[k]!, stueck.text, ausweichen, gewaehlt, bau.text, aktion), true);
      aktion = 'auf';
    }
    offen = ziel;
    if (stueck.marks.some((mark) => mark.type.name === opakId())) an(bau, stueck.text, false);
    else maskiereAn(stueck.text, voll, bau);
    if (stueck.text.length > 0) aktion = 'text';
  }
  for (let k = offen.length - 1; k >= 0; k -= 1) an(bau, schliesse(offen[k]!, gewaehlt), true);
  return bau;
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
  if (String(knoten.attrs.zeichen ?? basis) === basis) return format.syntax?.einsetzen ?? `${basis} `;
  const stufe = Number(knoten.attrs.stufe ?? 1);
  const n = Math.min(6, Math.max(1, Number.isFinite(stufe) ? Math.floor(stufe) : 1));
  return `${(format.zeichen[1] ?? '#').repeat(n === 0 ? 1 : n)} `;
}

function istFortsetzung(knoten: Node): boolean {
  return knoten.type.name === 'punkt' && ohneEnde(String(knoten.attrs.quelle ?? '')).startsWith(' ');
}

function markerAusQuelle(knoten: Node): string | null {
  const kern = ohneEnde(String(knoten.attrs.quelle ?? ''));
  if (kern.length === 0 || kern.startsWith(' ')) return null;
  const haken = hakenVon(kern);
  if (haken) {
    if (haken.abgehakt !== (knoten.attrs.abgehakt === true)) return null;
    return kern.slice(0, haken.laenge);
  }
  const laenge = listenLaenge(kern);
  return laenge > 0 ? kern.slice(0, laenge) : null;
}

function punktPrefix(knoten: Node): string {
  if (istFortsetzung(knoten)) return /^ +/.exec(ohneEnde(String(knoten.attrs.quelle ?? '')))?.[0] ?? '';
  const marker = markerAusQuelle(knoten);
  if (marker) return marker;
  const art = String(knoten.attrs.art ?? ART.liste);
  if (art === ART.haken) return prefixMit(ART.haken, knoten.attrs.abgehakt === true ? 1 : 0);
  if (art === ART.nummer) return prefixNummer(String(knoten.attrs.nummerArt ?? ''), knoten.attrs.nummer) ?? prefixMit(ART.nummer, 0);
  return prefixMit(ART.liste, 0);
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

function codeKern(knoten: Node, index: number, kinder: readonly Node[]): SchreibStueck {
  if (knoten.textContent.length > 0) return ausZeichen(knoten.textContent, false);
  const kern = ohneEnde(String(knoten.attrs.quelle ?? ''));
  const zaun = String(knoten.attrs.zaun ?? formatVon(ART.codeblock).zeichen[0] ?? '');
  if (istZaunKern(kern, zaun)) return ausZeichen(kern, true);
  const gruppe = codeGruppe(kinder, index);
  if (kern === '' && (index === gruppe.start || index === gruppe.ende)) return ausZeichen(zaun, true);
  return ausZeichen('', false);
}

function kernVon(knoten: Node, index: number, kinder: readonly Node[], voll: boolean, ausweichen: boolean, flach = false): SchreibStueck {
  const name = knoten.type.name;
  if (name === 'leerzeile') return ausZeichen('', false);
  if (name === TRENNLINIE) return ausZeichen(TRENNLINIE_ZEICHEN, true);
  if (name === 'codeblock') return codeKern(knoten, index, kinder);
  const inline = schreibeInline(knoten, voll, ausweichen, flach);
  if (name === 'wichtigZeile') return plus(ausZeichen(formatVon(ART.wichtig).syntax?.zeile ?? formatVon(ART.wichtig).zeichen[1] ?? '', true), inline);
  if (name === 'ueberschrift') return plus(ausZeichen(kopfPrefix(knoten), true), inline);
  if (name === 'punkt') return plus(ausZeichen(punktPrefix(knoten), true), inline);
  return inline;
}

function umbruchVon(knoten: Node, index: number, kinder: readonly Node[]): string {
  const quelle = String(knoten.attrs.quelle ?? '');
  if (quelle.endsWith('\r\n')) return '\r\n';
  if (quelle.endsWith('\n')) return '\n';
  if (index !== kinder.length - 1 || knoten.type.name === 'leerzeile') return '\n';
  if (knoten.type.name === 'codeblock' && knoten.textContent === '' && codeKern(knoten, index, kinder).text === '') return '\n';
  return '';
}

function trennMaske(inhalt: string): SchreibStueck | null {
  const aus = trennFlucht(inhalt);
  if (aus === null) return null;
  const stueck: SchreibStueck = { text: '', syntax: [] };
  let k = 0;
  for (let i = 0; i < aus.length; i += 1) {
    const inhaltZeichen = k < inhalt.length && aus[i] === inhalt[k];
    an(stueck, aus[i] ?? '', !inhaltZeichen);
    if (inhaltZeichen) k += 1;
  }
  return k === inhalt.length ? stueck : null;
}

function mitFlucht(kern: SchreibStueck): SchreibStueck {
  if (!kern.text.startsWith(LISTEN_EINFUEGEN) && !kern.text.startsWith(kopfZeichen(1))) return kern;
  return plus(ausZeichen('\\', true), kern);
}

export function schreibStuecke(knoten: Node, index: number, kinder: readonly Node[]): { bevorzugt: SchreibStueck[]; alle: SchreibStueck[] } {
  const bruch = umbruchVon(knoten, index, kinder);
  const versuche = (flach: boolean) => VERSUCHE.map((versuch) => mitBruch(kernVon(knoten, index, kinder, versuch.voll, versuch.ausweichen, flach), bruch));
  const baum = versuche(false);
  const gebaut = versuche(true);
  const linien = knoten.type.name === 'absatz' && knoten.childCount === 1 && knoten.firstChild!.marks.length === 0 ? trennMaske(knoten.textContent) : null;
  if (linien) gebaut.unshift(mitBruch(linien, bruch));
  if (knoten.attrs.flucht === true && knoten.type.name === 'absatz') {
    gebaut.push(mitBruch(mitFlucht(kernVon(knoten, index, kinder, true, false, true)), bruch));
  }
  const reihe = linien === null ? baum : [mitBruch(linien, bruch), ...baum];
  const alle = [...reihe, ...gebaut];
  return { bevorzugt: istFortsetzung(knoten) ? gebaut.slice(0, 1) : alle, alle };
}
