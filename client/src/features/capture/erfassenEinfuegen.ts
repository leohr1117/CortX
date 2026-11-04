import { Slice } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { setzeErfassenText } from './erfassenBefehl.ts';
import { rohOffset, textAusDokument } from './erfassenDokument.ts';

function textVon(event: ClipboardEvent): string | null {
  const daten = event.clipboardData;
  if (!daten || typeof daten.getData !== 'function') return null;
  const text = daten.getData('text/plain') || daten.getData('Text');
  return text ? text : null;
}

function fuegeRohtext(view: EditorView, text: string): void {
  const roh = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const alt = textAusDokument(view.state.doc);
  const anchor = rohOffset(view.state.doc, alt, view.state.selection.anchor);
  const head = rohOffset(view.state.doc, alt, view.state.selection.head);
  const von = Math.min(anchor, head);
  const bis = Math.max(anchor, head);
  const neu = alt.slice(0, von) + roh + alt.slice(bis);
  const caret = von + roh.length;
  setzeErfassenText(view, neu, caret, caret);
}

export function erfassenEinfuegen(): Plugin {
  return new Plugin({
    props: {
      clipboardTextParser() {
        return Slice.empty;
      },
      handlePaste(view, event) {
        const text = textVon(event);
        if (!text) return false;
        event.preventDefault();
        fuegeRohtext(view, text);
        return true;
      },
    },
  });
}
