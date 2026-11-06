import type { Node } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export type EditorModus = 'erfassen' | 'notiz';

interface Taste extends Event {
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  inputType?: string;
}

export function istAblageTaste(event: Event): boolean {
  const taste = event as Taste;
  const steuer = taste.ctrlKey === true || taste.metaKey === true;
  return taste.key === 'Enter' && steuer && taste.altKey !== true && taste.isComposing !== true;
}

function ohneText(doc: Node): boolean {
  return doc.textContent.length === 0;
}

function platzhalterStelle(doc: Node): number {
  const erste = doc.firstChild;
  if (!erste) return 0;
  if (erste.isAtom || !erste.isTextblock) return 0;
  return 1;
}

export function platzhalterPlugin(lies: () => string, unsichtbar = false): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const hinweis = lies();
        if (hinweis.length === 0 || !ohneText(state.doc)) return null;
        const stelle = platzhalterStelle(state.doc);
        const widget = Decoration.widget(stelle, () => {
          const knoten = document.createElement('span');
          knoten.setAttribute('aria-hidden', 'true');
          knoten.style.pointerEvents = 'none';
          if (unsichtbar) {
            knoten.setAttribute('data-zeile', 'platz');
            knoten.style.position = 'absolute';
            knoten.style.height = '1.2em';
          } else {
            knoten.className = 'cm-placeholder';
            knoten.textContent = lies();
          }
          return knoten;
        }, { side: -1, ignoreSelection: true, key: 'platzhalter' });
        return DecorationSet.create(state.doc, [widget]);
      },
    },
  });
}

export function ablageTastePlugin(ablegen: () => void): Plugin {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (!istAblageTaste(event)) return false;
        event.preventDefault();
        if (!view.composing) ablegen();
        return true;
      },
      handleDOMEvents: {
        beforeinput(view, event) {
          const taste = event as Taste;
          if (view.composing || taste.isComposing === true) return false;
          if ((taste.ctrlKey !== true && taste.metaKey !== true) || taste.altKey === true) return false;
          if (taste.inputType !== 'insertParagraph' && taste.inputType !== 'insertLineBreak') return false;
          event.preventDefault();
          return true;
        },
      },
    },
  });
}
