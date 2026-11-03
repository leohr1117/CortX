import { TextSelection } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import type { Beleg } from '../../../../shared/features/format/baum.ts';
import { leseDokument } from '../../../../shared/features/format/lesen.ts';

function syntaxMaske(text: string, belege: readonly Beleg[]): boolean[] {
  const syntax = new Array<boolean>(text.length).fill(false);
  const lauf = (liste: readonly Beleg[]) => {
    for (const beleg of liste) {
      for (const [von, bis] of beleg.marker) {
        const ende = Math.min(bis, text.length);
        for (let i = Math.max(0, von); i < ende; i += 1) syntax[i] = true;
      }
      if (beleg.innen) lauf(beleg.innen);
      if (beleg.folgeBis === undefined || beleg.bisZeile === undefined) continue;
      const tiefe = Math.max(0, beleg.von - beleg.ganzVon);
      let i = beleg.bisZeile;
      while (i < beleg.folgeBis && i < text.length) {
        for (let k = 0; k < tiefe && i + k < text.length; k += 1) syntax[i + k] = true;
        const nl = text.indexOf('\n', i);
        if (nl < 0 || nl + 1 >= beleg.folgeBis) break;
        i = nl + 1;
      }
    }
  };
  lauf(belege);
  return syntax;
}

function textStellen(doc: Node): number[] {
  const aus: number[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (let i = 0; i < node.text.length; i += 1) aus.push(pos + i);
  });
  return aus;
}

export function inhaltZeichen(text: string): string {
  const syntax = syntaxMaske(text, leseDokument(text).belege);
  let aus = '';
  for (let i = 0; i < text.length; i += 1) {
    const z = text[i] ?? '';
    if (syntax[i] || z === '\n' || z === '\r') continue;
    aus += z;
  }
  return aus;
}

export function grenzen(doc: Node, text: string): number[] {
  const syntax = syntaxMaske(text, leseDokument(text).belege);
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

export function offsetFuer(doc: Node, text: string, pos: number): number {
  const grenze = grenzen(doc, text);
  let fund = 0;
  for (let i = 0; i < grenze.length; i += 1) {
    if (grenze[i] === pos) fund = i;
  }
  return fund;
}
