import { closeHistory } from 'prosemirror-history';
import { Fragment, Slice, type Node } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { lade } from '../../../../shared/features/format/laden.ts';

function ohneQuelle(node: Node): Node {
  return node.type.createChecked({ ...node.attrs, quelle: '' }, node.content, node.marks);
}

function sliceAusText(text: string, parent: Node): Slice {
  const doc = lade(text);
  const kinder: Node[] = [];
  doc.forEach((knoten) => kinder.push(ohneQuelle(knoten)));
  if (kinder.length === 0) return Slice.empty;
  const inhalt = Fragment.from(kinder);
  const einzig = kinder.length === 1 ? kinder[0] : null;
  if (einzig?.type.name === 'absatz' && parent.isTextblock) return Slice.maxOpen(inhalt);
  return new Slice(inhalt, 0, 0);
}

function textOhneZeichen(slice: Slice): string {
  return slice.content.textBetween(0, slice.content.size, '\n');
}

interface Ablage {
  getData: (art: string) => string;
  setData?: (art: string, wert: string) => void;
  clearData?: () => void;
}

function ablageVon(event: Event): Ablage | null {
  const daten = (event as ClipboardEvent).clipboardData;
  if (!daten || typeof daten.getData !== 'function') return null;
  return daten;
}

function textVon(daten: Ablage): string | null {
  const text = daten.getData('text/plain') || daten.getData('Text');
  return text ? text : null;
}

function imCode(view: EditorView): boolean {
  return view.state.selection.$from.parent.type.spec.code === true;
}

function wortlaut(view: EditorView, text: string): void {
  const zeichen = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const tr = closeHistory(view.state.tr.replaceSelectionWith(view.state.schema.text(zeichen), false).scrollIntoView());
  view.dispatch(tr.setMeta('paste', true).setMeta('uiEvent', 'paste'));
}

function fuegeEin(view: EditorView, event: Event): boolean {
  const daten = ablageVon(event);
  if (!daten) return false;
  const text = textVon(daten);
  if (!text) return false;
  if (imCode(view)) {
    wortlaut(view, text);
    return true;
  }
  const slice = sliceAusText(text, view.state.selection.$from.parent);
  if (slice.size === 0) return false;
  const tr = closeHistory(view.state.tr.replaceSelection(slice).scrollIntoView());
  view.dispatch(tr.setMeta('paste', true).setMeta('uiEvent', 'paste'));
  return true;
}

function schreibe(view: EditorView, event: Event, ausschneiden: boolean): boolean {
  if (view.state.selection.empty) return false;
  const daten = ablageVon(event);
  if (!daten?.setData) return false;
  const text = textOhneZeichen(view.state.selection.content());
  event.preventDefault();
  daten.clearData?.();
  daten.setData('text/plain', text);
  if (!ausschneiden) return true;
  const tr = closeHistory(view.state.tr.deleteSelection().scrollIntoView());
  view.dispatch(tr.setMeta('uiEvent', 'cut'));
  return true;
}

export function modellAblage(): Plugin {
  return new Plugin({
    props: {
      clipboardTextParser(text, $context) {
        return sliceAusText(text, $context.parent);
      },
      handlePaste(view, event) {
        return fuegeEin(view, event);
      },
      handleDOMEvents: {
        copy(view, event) {
          return schreibe(view, event, false);
        },
        cut(view, event) {
          return schreibe(view, event, true);
        },
      },
    },
  });
}
