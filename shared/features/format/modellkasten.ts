import { closeHistory } from 'prosemirror-history';
import type { EditorState } from 'prosemirror-state';
import { ART } from './baum.ts';
import { schalteKasten } from './kasten.ts';
import { formatVon } from './register.ts';

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

Object.defineProperty(formatVon(ART.haken), 'kasten', {
  enumerable: true,
  configurable: true,
  get() {
    return { text: schalteKasten, modell: schalteAbgehakt };
  },
});
