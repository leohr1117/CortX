import type { Node } from 'prosemirror-model';
import { lade } from './laden.ts';
import { speichere } from './speichern.ts';

export function importiere(text: string): Node {
  return lade(text);
}

export function exportiere(doc: Node): string {
  return speichere(doc);
}
