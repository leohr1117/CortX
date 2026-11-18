import type { Node } from 'prosemirror-model';
import { knotenZuMarkdownOffset } from './knotenOffset.ts';
import { lade } from './laden.ts';

function sichtbar(text: string, syntax: readonly boolean[]): string {
  let aus = '';
  for (let i = 0; i < text.length; i += 1) {
    const z = text[i] ?? '';
    if (syntax[i] || z === '\n' || z === '\r') continue;
    aus += z;
  }
  return aus;
}

export function inhaltZeichen(text: string): string {
  const doc = lade(text);
  return sichtbar(text, knotenZuMarkdownOffset(doc, text).syntax);
}

export function grenzen(doc: Node, text: string): number[] {
  return knotenZuMarkdownOffset(doc, text).grenze;
}

export function offsetFuer(doc: Node, text: string, pos: number): number {
  const grenze = grenzen(doc, text);
  let fund = 0;
  for (let i = 0; i < grenze.length; i += 1) {
    if (grenze[i] === pos) fund = i;
  }
  return fund;
}

export function posFuer(doc: Node, text: string, offset: number): number {
  const grenze = grenzen(doc, text);
  const safe = Math.max(0, Math.min(offset, text.length));
  const pos = grenze[safe] ?? 0;
  return Math.max(0, Math.min(pos, doc.content.size));
}
