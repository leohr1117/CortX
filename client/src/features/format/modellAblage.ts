import { closeHistory } from 'prosemirror-history';
import { DOMParser, DOMSerializer, Fragment, Slice, type Node } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { lade } from '../../../../shared/features/format/laden.ts';
import { modell } from '../../../../shared/features/format/modell.ts';

const parser = DOMParser.fromSchema(modell);
const serializer = DOMSerializer.fromSchema(modell);

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

function htmlVon(daten: Ablage): string | null {
  const html = daten.getData('text/html');
  return html ? html : null;
}

function imCode(view: EditorView): boolean {
  return view.state.selection.$from.parent.type.spec.code === true;
}

function wortlaut(view: EditorView, text: string): void {
  const zeichen = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const tr = closeHistory(view.state.tr.replaceSelectionWith(view.state.schema.text(zeichen), false).scrollIntoView());
  view.dispatch(tr.setMeta('paste', true).setMeta('uiEvent', 'paste'));
}

function fragmentHtml(html: string): string {
  const start = html.indexOf('<!--StartFragment-->');
  const ende = html.indexOf('<!--EndFragment-->');
  if (start >= 0 && ende > start) return html.slice(start + '<!--StartFragment-->'.length, ende);
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return body?.[1] ?? html;
}

function sliceAusHtml(html: string, parent: Node, $context: EditorView['state']['selection']['$from']): Slice {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return Slice.empty;
  const wrap = document.createElement('div');
  wrap.innerHTML = fragmentHtml(html);
  const slice = parser.parseSlice(wrap, { context: $context, preserveWhitespace: false });
  if (slice.size === 0) return Slice.empty;
  const kinder: Node[] = [];
  slice.content.forEach((knoten) => kinder.push(knoten.isBlock ? ohneQuelle(knoten) : knoten));
  const inhalt = Fragment.from(kinder);
  const einzig = kinder.length === 1 ? kinder[0] : null;
  if (einzig?.type.name === 'absatz' && parent.isTextblock) return Slice.maxOpen(inhalt);
  return new Slice(inhalt, slice.openStart, slice.openEnd);
}

function istLi(knoten: globalThis.Node): knoten is HTMLElement {
  return knoten.nodeType === 1 && (knoten as HTMLElement).tagName === 'LI';
}

function bindeListen(wurzel: HTMLElement): void {
  const dok = wurzel.ownerDocument;
  if (!dok) return;
  const kinder = [...wurzel.childNodes];
  let i = 0;
  while (i < kinder.length) {
    const knoten = kinder[i];
    if (!knoten || !istLi(knoten)) {
      i += 1;
      continue;
    }
    const ol = knoten.getAttribute('data-list') === 'ol';
    const liste = dok.createElement(ol ? 'ol' : 'ul');
    wurzel.insertBefore(liste, knoten);
    while (i < kinder.length) {
      const naechster = kinder[i];
      if (!naechster || !istLi(naechster)) break;
      if ((naechster.getAttribute('data-list') === 'ol') !== ol) break;
      liste.appendChild(naechster);
      i += 1;
    }
  }
}

function htmlAus(slice: Slice): string {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return '';
  const wrap = document.createElement('div');
  wrap.appendChild(serializer.serializeFragment(slice.content));
  bindeListen(wrap);
  return wrap.innerHTML;
}

function setzeSlice(view: EditorView, slice: Slice): boolean {
  if (slice.size === 0) return false;
  const tr = closeHistory(view.state.tr.replaceSelection(slice).scrollIntoView());
  view.dispatch(tr.setMeta('paste', true).setMeta('uiEvent', 'paste'));
  return true;
}

function fuegeEin(view: EditorView, event: Event): boolean {
  const daten = ablageVon(event);
  if (!daten) return false;
  if (imCode(view)) {
    const text = textVon(daten);
    if (!text) return false;
    wortlaut(view, text);
    return true;
  }
  const parent = view.state.selection.$from.parent;
  const html = htmlVon(daten);
  if (html) {
    const slice = sliceAusHtml(html, parent, view.state.selection.$from);
    if (setzeSlice(view, slice)) return true;
  }
  const text = textVon(daten);
  if (!text) return false;
  return setzeSlice(view, sliceAusText(text, parent));
}

function schreibe(view: EditorView, event: Event, ausschneiden: boolean): boolean {
  if (view.state.selection.empty) return false;
  const daten = ablageVon(event);
  if (!daten?.setData) return false;
  const slice = view.state.selection.content();
  event.preventDefault();
  daten.clearData?.();
  daten.setData('text/plain', textOhneZeichen(slice));
  daten.setData('text/html', htmlAus(slice));
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
      clipboardTextSerializer(slice) {
        return textOhneZeichen(slice);
      },
      clipboardParser: parser,
      clipboardSerializer: serializer,
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
