import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

const ERSATZ = 'insertReplacementText';

interface Bereich {
  startContainer: Node;
  startOffset: number;
  endContainer: Node;
  endOffset: number;
}

interface ErsatzEreignis extends Event {
  inputType?: string;
  data?: string | null;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  getTargetRanges?: () => ReadonlyArray<Bereich>;
}

interface Spanne {
  von: number;
  bis: number;
}

function gesteuert(event: ErsatzEreignis): boolean {
  return event.ctrlKey === true || event.metaKey === true || event.altKey === true;
}

function spanneAusBereich(view: EditorView, bereich: Bereich): Spanne | null {
  let von: number;
  let bis: number;
  try {
    von = view.posAtDOM(bereich.startContainer, bereich.startOffset, 1);
    bis = view.posAtDOM(bereich.endContainer, bereich.endOffset, -1);
  } catch {
    return null;
  }
  if (bis < von) {
    const tausch = von;
    von = bis;
    bis = tausch;
  }
  if (von === bis) return null;
  const max = view.state.doc.content.size;
  if (von < 0 || bis > max) return null;
  return { von, bis };
}

function spanneAusZiel(view: EditorView, event: ErsatzEreignis): Spanne | null {
  if (typeof event.getTargetRanges !== 'function') return null;
  const liste = event.getTargetRanges();
  if (!liste || liste.length === 0) return null;
  const erste = liste[0];
  if (!erste) return null;
  return spanneAusBereich(view, erste);
}

function spanneAusAuswahl(view: EditorView): Spanne | null {
  const auswahl = view.state.selection;
  if (auswahl.empty) return null;
  return { von: auswahl.from, bis: auswahl.to };
}

function wortVorCursor(view: EditorView): Spanne | null {
  const auswahl = view.state.selection;
  if (!auswahl.empty) return null;
  const $pos = auswahl.$from;
  if (!$pos.parent.isTextblock || $pos.parentOffset <= 0) return null;
  const davor = $pos.parent.textBetween(0, $pos.parentOffset);
  const treffer = /[\p{L}\p{N}]+$/u.exec(davor);
  if (!treffer || treffer[0].length === 0) return null;
  const bis = $pos.pos;
  const von = bis - treffer[0].length;
  if (von < 0) return null;
  return { von, bis };
}

function zielspanne(view: EditorView, event: ErsatzEreignis): Spanne | null {
  return spanneAusZiel(view, event) ?? spanneAusAuswahl(view) ?? wortVorCursor(view);
}

export function imeErsatz(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        beforeinput(view, event) {
          const eingabe = event as ErsatzEreignis;
          if (eingabe.inputType !== ERSATZ) return false;
          if (gesteuert(eingabe) || event.defaultPrevented) return false;
          const data = eingabe.data;
          if (typeof data !== 'string' || data.length === 0) return false;
          const spanne = zielspanne(view, eingabe);
          if (!spanne) return false;
          event.preventDefault();
          view.dispatch(view.state.tr.insertText(data, spanne.von, spanne.bis));
          return true;
        },
      },
    },
  });
}
