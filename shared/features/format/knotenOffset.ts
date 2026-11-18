import type { Node } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { schreibStuecke, type SchreibStueck } from './knotenSyntax.ts';
import { mitTrennAbstand } from './trennlinie.ts';

export interface MarkdownOffset {
  syntax: boolean[];
  grenze: number[];
}

function maskeAusInhalt(kern: string, inhalt: string): boolean[] | null {
  const n = kern.length;
  const m = inhalt.length;
  const can = new Array<boolean>((n + 1) * (m + 1)).fill(false);
  const bei = (i: number, k: number) => i * (m + 1) + k;
  can[bei(n, m)] = true;
  for (let i = n; i >= 0; i -= 1) {
    for (let k = m; k >= 0; k -= 1) {
      if (i === n && k === m) continue;
      const skip = i < n && can[bei(i + 1, k)] === true;
      const nehmen = i < n && k < m && kern[i] === inhalt[k] && can[bei(i + 1, k + 1)] === true;
      can[bei(i, k)] = skip || nehmen;
    }
  }
  if (can[bei(0, 0)] !== true) return null;
  const syntax: boolean[] = [];
  let i = 0;
  let k = 0;
  while (i < n || k < m) {
    if (i < n && k < m && kern[i] === inhalt[k] && can[bei(i + 1, k + 1)] === true) {
      syntax.push(false);
      i += 1;
      k += 1;
      continue;
    }
    if (i < n && can[bei(i + 1, k)] === true) {
      syntax.push(true);
      i += 1;
      continue;
    }
    return null;
  }
  return syntax;
}

function quelleMaske(knoten: Node, stueck: string): SchreibStueck | null {
  const bruch = stueck.endsWith('\r\n') ? '\r\n' : stueck.endsWith('\n') ? '\n' : stueck.endsWith('\r') ? '\r' : '';
  const kern = bruch === '' ? stueck : stueck.slice(0, -bruch.length);
  const syntax = maskeAusInhalt(kern, knoten.textContent);
  if (!syntax) return null;
  return { text: stueck, syntax: [...syntax, ...new Array<boolean>(bruch.length).fill(false)] };
}

function suchListe(knoten: Node, index: number, kinder: readonly Node[]): SchreibStueck[] {
  const { bevorzugt, alle } = schreibStuecke(knoten, index, kinder);
  const aus: SchreibStueck[] = [];
  const gesehen = new Set<string>();
  const nimm = (kandidat: SchreibStueck) => {
    if (kandidat.syntax.length !== kandidat.text.length || gesehen.has(kandidat.text)) return;
    gesehen.add(kandidat.text);
    aus.push(kandidat);
  };
  for (const kandidat of bevorzugt) nimm(kandidat);
  for (const kandidat of alle) nimm(kandidat);
  const roh = String(knoten.attrs.quelle ?? '');
  if (roh === '') return aus;
  const maske = quelleMaske(knoten, roh);
  if (maske) nimm(maske);
  if (index < kinder.length - 1 && !roh.endsWith('\n') && !roh.endsWith('\r')) {
    const erweitert = quelleMaske(knoten, `${roh}\n`);
    if (erweitert) nimm(erweitert);
  }
  return aus;
}

function syntaxSuche(doc: Node, text: string): boolean[] | null {
  const kinder = Array.from({ length: doc.childCount }, (_, index) => doc.child(index));
  const listen = kinder.map((knoten, index) => suchListe(knoten, index, kinder));
  const memo = new Map<string, boolean[] | null>();
  const gehe = (index: number, offset: number): boolean[] | null => {
    const key = `${index}:${offset}`;
    if (memo.has(key)) return memo.get(key) ?? null;
    if (index === kinder.length) {
      const fertig = offset === text.length ? [] : null;
      memo.set(key, fertig);
      return fertig;
    }
    const rest = text.slice(offset);
    for (const kandidat of listen[index] ?? []) {
      if (!rest.startsWith(kandidat.text)) continue;
      const weiter = gehe(index + 1, offset + kandidat.text.length);
      if (!weiter) continue;
      const syntax = [...kandidat.syntax, ...weiter];
      memo.set(key, syntax);
      return syntax;
    }
    memo.set(key, null);
    return null;
  };
  return gehe(0, 0);
}

function syntaxVomBaum(doc: Node, text: string): boolean[] {
  const direkt = syntaxSuche(doc, text);
  if (direkt && direkt.length === text.length) return direkt;
  const geordnet = mitTrennAbstand(doc);
  if (geordnet !== doc) {
    const neu = syntaxSuche(geordnet, text);
    if (neu && neu.length === text.length) return neu;
  }
  return new Array<boolean>(text.length).fill(false);
}

function textStellen(doc: Node): number[] {
  const aus: number[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (let i = 0; i < node.text.length; i += 1) aus.push(pos + i);
  });
  return aus;
}

function grenzenVon(doc: Node, text: string, syntax: readonly boolean[]): number[] {
  const stellen = textStellen(doc);
  const inhalt: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const z = text[i] ?? '';
    if (syntax[i] || z === '\n' || z === '\r') continue;
    inhalt.push(i);
  }
  const start = TextSelection.atStart(doc).from;
  const ende = TextSelection.atEnd(doc).from;
  const grenze = new Array<number>(text.length + 1);
  const paare = Math.min(inhalt.length, stellen.length);
  for (let k = 0; k < paare; k += 1) grenze[inhalt[k]!] = stellen[k]!;
  const erste = inhalt[0] ?? text.length;
  for (let i = 0; i <= erste && i <= text.length; i += 1) {
    if (grenze[i] === undefined) grenze[i] = start;
  }
  for (let k = 0; k < paare; k += 1) {
    const von = inhalt[k]!;
    const bis = inhalt[k + 1] ?? text.length;
    const nach = stellen[k]! + 1;
    const weiter = stellen[k + 1];
    let bruch = false;
    for (let i = von + 1; i <= bis && i <= text.length; i += 1) {
      if (grenze[i] !== undefined && i !== text.length) break;
      const z = i < text.length ? (text[i] ?? '') : '';
      grenze[i] = bruch && weiter !== undefined ? weiter : nach;
      if (z === '\n' || z === '\r') bruch = true;
    }
  }
  for (let i = 0; i <= text.length; i += 1) {
    if (grenze[i] === undefined) grenze[i] = ende;
  }
  grenze[text.length] = ende;
  return grenze;
}

export function knotenZuMarkdownOffset(doc: Node, text: string): MarkdownOffset {
  const syntax = syntaxVomBaum(doc, text);
  return { syntax, grenze: grenzenVon(doc, text, syntax) };
}
