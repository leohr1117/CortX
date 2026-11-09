import { Plugin } from 'prosemirror-state';
import { formatImCodeblockGesperrt } from '../../../../shared/features/format/modellbefehl.ts';
import { leistenEintraege } from '../../../../shared/features/format/index.ts';
import { setzeZustand } from './modellLauf.ts';

export const WICHTIG_TASTE = 'Mod-!';

export interface TastenBild {
  key?: string;
  code?: string;
  keyCode?: number;
  which?: number;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
}

export function macBefehl(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iP(hone|[oa]d)/.test(navigator.platform);
}

function zifferEins(taste: TastenBild): boolean {
  return taste.code === 'Digit1' || taste.keyCode === 49 || taste.which === 49;
}

export function istWichtigKuerzel(taste: TastenBild): boolean {
  if (taste.isComposing === true || taste.shiftKey !== true || taste.altKey === true) return false;
  const ctrl = taste.ctrlKey === true;
  const meta = taste.metaKey === true;
  if (ctrl === meta) return false;
  if (macBefehl() ? !meta : !ctrl) return false;
  return (taste.key === '!' || taste.key === '1') && zifferEins(taste);
}

export function wichtigTastenPlugin(onLink: () => void): Plugin {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        const komposition = view.composing
          || (view as unknown as { input?: { composing?: boolean } }).input?.composing === true;
        if (komposition) return false;
        const ziel = event.target;
        if (ziel instanceof Node && ziel !== view.dom && !view.dom.contains(ziel)) return false;
        if (!istWichtigKuerzel(event)) return false;
        const eintrag = leistenEintraege().find((item) => item.knopf.taste === WICHTIG_TASTE);
        const schalt = eintrag?.modell;
        if (!eintrag || !schalt) return false;
        if (formatImCodeblockGesperrt(eintrag.id, view.state)) return true;
        if (eintrag.knopf.ziel) {
          onLink();
          return true;
        }
        const naechster = schalt.run(view.state);
        if (naechster !== view.state) setzeZustand(view, naechster);
        return true;
      },
    },
  });
}
