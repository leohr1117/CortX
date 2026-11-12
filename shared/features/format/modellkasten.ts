import { closeHistory } from 'prosemirror-history';
import type { EditorState } from 'prosemirror-state';
import { ART } from './baum.ts';
import { formatVon } from './register.ts';
import { hakenVon } from './zeile.ts';

export function schalteAbgehakt(zustand: EditorState, pos: number): EditorState {
  const knoten = zustand.doc.nodeAt(pos);
  if (!knoten || knoten.type.name !== 'punkt' || knoten.attrs.art !== ART.haken) return zustand;
  const tr = zustand.tr.setNodeMarkup(pos, undefined, {
    ...knoten.attrs,
    abgehakt: knoten.attrs.abgehakt !== true,
  });
  if (!tr.docChanged) return zustand;
  return zustand.apply(closeHistory(tr));
}

export function kastenInQuelle(quelle: string): string {
  const haken = hakenVon(quelle);
  if (!haken) return quelle;
  if (quelle.startsWith('[x]')) return `[]${quelle.slice(3)}`;
  if (quelle.startsWith('[]')) return `[x]${quelle.slice(2)}`;
  const innen = quelle.indexOf('[') + 1;
  return quelle.slice(0, innen) + (haken.abgehakt ? ' ' : 'x') + quelle.slice(innen + 1);
}

Object.defineProperty(formatVon(ART.haken), 'kasten', {
  enumerable: true,
  configurable: true,
  get() {
    return { modell: schalteAbgehakt };
  },
});
