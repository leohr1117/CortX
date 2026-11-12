import { closeHistory } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Node } from 'prosemirror-model';
import { NodeSelection, Plugin, Selection, TextSelection, type Command, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { TRENNLINIE, istTrennZeile } from '../../../../shared/features/format/trennlinie.ts';

interface Eingabe extends Event {
  inputType?: string;
  isComposing?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

function leerDavor(doc: Node, index: number): boolean {
  if (index === 0) return true;
  const davor = doc.child(index - 1);
  return davor.type.name === 'leerzeile' || (davor.isTextblock && davor.content.size === 0);
}

export const linieAusStrichen: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.depth !== 1) return false;
  const zeile = $from.parent;
  if (zeile.type.name !== 'absatz' || $from.parentOffset !== zeile.content.size) return false;
  if (!istTrennZeile(zeile.textContent)) return false;
  const index = $from.index(0);
  if (!leerDavor(state.doc, index)) return false;
  if (!dispatch) return true;
  const typen = state.schema.nodes;
  const von = $from.before(1);
  const bis = $from.after(1);
  const tr = state.tr.replaceWith(von, bis, [typen[TRENNLINIE]!.create(), typen.absatz!.create()]);
  tr.setSelection(TextSelection.create(tr.doc, von + 2));
  dispatch(closeHistory(tr).scrollIntoView());
  return true;
};

function istLinie(knoten: Node | null | undefined): boolean {
  return knoten?.type.name === TRENNLINIE;
}

function istLeer(knoten: Node): boolean {
  return knoten.type.name === 'leerzeile';
}

function startVon(doc: Node, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
  return pos;
}

function jenseits(doc: Node, index: number, vor: boolean): Selection | null {
  const schritt = vor ? 1 : -1;
  let i = index + schritt;
  while (i >= 0 && i < doc.childCount && istLeer(doc.child(i))) i += schritt;
  if (i < 0 || i >= doc.childCount || !istLinie(doc.child(i))) return null;
  return jenseitsAb(doc, i, vor);
}

function ziel(state: EditorState, vor: boolean): Selection | null {
  const auswahl = state.selection;
  const doc = state.doc;
  if (auswahl instanceof NodeSelection && auswahl.$from.depth === 0) {
    const index = auswahl.$from.index(0);
    if (istLinie(auswahl.node)) return jenseitsAb(doc, index, vor);
    if (istLeer(auswahl.node)) return jenseits(doc, index, vor);
    return null;
  }
  if (!auswahl.empty || auswahl.$from.depth !== 1) return null;
  return jenseits(doc, auswahl.$from.index(0), vor);
}

function jenseitsAb(doc: Node, index: number, vor: boolean): Selection | null {
  const schritt = vor ? 1 : -1;
  let i = index + schritt;
  while (i >= 0 && i < doc.childCount && (istLinie(doc.child(i)) || istLeer(doc.child(i)))) i += schritt;
  if (i < 0 || i >= doc.childCount || !doc.child(i).isTextblock) return null;
  const pos = startVon(doc, i);
  return TextSelection.create(doc, vor ? pos + 1 : pos + 1 + doc.child(i).content.size);
}

function pfeil(vor: boolean, zeilenweise: boolean): Command {
  return (state, dispatch, view) => {
    const auswahl = state.selection;
    if (!(auswahl instanceof NodeSelection)) {
      if (!auswahl.empty) return false;
      const $pos = auswahl.$from;
      if (zeilenweise) {
        if (view && !view.endOfTextblock(vor ? 'down' : 'up')) return false;
      } else if (vor ? $pos.parentOffset !== $pos.parent.content.size : $pos.parentOffset !== 0) {
        return false;
      }
    }
    const neu = ziel(state, vor);
    if (!neu) return false;
    dispatch?.(state.tr.setSelection(neu).scrollIntoView());
    return true;
  };
}

const linieWeg: Command = (state, dispatch) => {
  const auswahl = state.selection;
  if (!(auswahl instanceof NodeSelection) || !istLinie(auswahl.node)) return false;
  if (!dispatch) return true;
  const tr = state.tr.delete(auswahl.from, auswahl.to);
  const $pos = tr.doc.resolve(Math.min(auswahl.from, tr.doc.content.size));
  tr.setSelection(Selection.near($pos, -1));
  dispatch(tr.scrollIntoView());
  return true;
};

function loeschPerEingabe(view: EditorView, event: Event): boolean {
  const art = (event as Eingabe).inputType;
  if (art !== 'deleteContentBackward' && art !== 'deleteContentForward') return false;
  if (!linieWeg(view.state, view.dispatch)) return false;
  event.preventDefault();
  return true;
}

function enterPerEingabe(view: EditorView, event: Event): boolean {
  const eingabe = event as Eingabe;
  if (eingabe.inputType !== 'insertParagraph') return false;
  if (eingabe.isComposing === true || view.composing || eingabe.shiftKey === true) return false;
  if (eingabe.ctrlKey === true || eingabe.metaKey === true || eingabe.altKey === true) return false;
  if (!linieAusStrichen(view.state, view.dispatch)) return false;
  event.preventDefault();
  return true;
}

export function trennlinienPlugins(): Plugin[] {
  return [
    keymap({
      Enter: linieAusStrichen,
      Backspace: linieWeg,
      Delete: linieWeg,
      ArrowDown: pfeil(true, true),
      ArrowUp: pfeil(false, true),
      ArrowRight: pfeil(true, false),
      ArrowLeft: pfeil(false, false),
    }),
    new Plugin({
      props: {
        handleDOMEvents: {
          beforeinput: (view, event) => enterPerEingabe(view, event) || loeschPerEingabe(view, event),
        },
      },
    }),
  ];
}
