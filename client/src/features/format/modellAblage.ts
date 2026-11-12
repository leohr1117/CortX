import { closeHistory, isHistoryTransaction } from 'prosemirror-history';
import { DOMParser, DOMSerializer, Fragment, Slice, type Mark, type Node } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { importiere } from '../../../../shared/features/format/md.ts';
import { modell } from '../../../../shared/features/format/modell.ts';

interface RandBild {
  text: string;
  offset: number;
  marks: readonly Mark[];
}

const anfangRandKey = new PluginKey<RandBild | null>('anfangRand');

function randBildVon(state: EditorState): RandBild | null {
  const $pos = state.selection.$from;
  const danach = $pos.nodeAfter;
  if (!state.selection.empty || $pos.textOffset || !$pos.parent.isTextblock || !danach?.isText) return null;
  if (state.storedMarks && state.storedMarks.length > 0) return null;
  const davor = $pos.nodeBefore?.marks ?? [];
  const erlaubt = davor.filter((mark) => mark.isInSet(danach.marks));
  const marks = danach.marks.filter((mark) => mark.type.spec.inclusive !== false && !mark.isInSet(erlaubt));
  if (marks.length === 0 || $pos.parentOffset >= $pos.parent.textContent.length) return null;
  return { text: $pos.parent.textContent, offset: $pos.parentOffset, marks };
}

function randPasst(text: string, bild: RandBild): boolean {
  const kopf = bild.text.slice(0, bild.offset);
  const schwanz = bild.text.slice(bild.offset);
  return text.length > bild.text.length && text.startsWith(kopf) && text.endsWith(schwanz);
}

function randGesperrt(tr: Transaction): boolean {
  if (isHistoryTransaction(tr) || tr.getMeta('programm') === true) return true;
  const ereignis = tr.getMeta('uiEvent');
  return tr.getMeta('paste') === true || ereignis === 'paste' || ereignis === 'drop';
}

function nimmAnfangRand(state: EditorState, bild: RandBild): Transaction | null {
  const $pos = state.selection.$from;
  if (!state.selection.empty || !$pos.parent.isTextblock) return null;
  const text = $pos.parent.textContent;
  if (!randPasst(text, bild)) return null;
  const bis = text.length - (bild.text.length - bild.offset);
  if (bis <= bild.offset) return null;
  const von = $pos.start() + bild.offset;
  const ende = $pos.start() + bis;
  if (von < 0 || ende > state.doc.content.size || ende <= von) return null;
  let tr: Transaction | null = null;
  for (const mark of bild.marks) {
    if (!state.doc.rangeHasMark(von, ende, mark.type)) continue;
    tr = (tr ?? state.tr).removeMark(von, ende, mark);
  }
  return tr;
}

const parser = DOMParser.fromSchema(modell);
const serializer = DOMSerializer.fromSchema(modell);

function ohneQuelle(node: Node): Node {
  return node.type.createChecked({ ...node.attrs, quelle: '' }, node.content, node.marks);
}

function sliceAusText(text: string, parent: Node): Slice {
  const doc = importiere(text);
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

function reichtum(schnitt: Slice): { marks: number; struktur: number; roh: number } {
  let marks = 0;
  let struktur = 0;
  let roh = 0;
  schnitt.content.descendants((node) => {
    marks += node.marks.length;
    if (node.type.name === 'ueberschrift' || node.type.name === 'punkt') struktur += 1;
    const text = node.isText ? (node.text ?? '') : '';
    if (text && /(?:\*\*|__|~~|`|\]\()/.test(text)) roh += 1;
    if (node.isTextblock && /^(?:#{1,6} |\d+\. |[-*+] )/.test(node.textContent)) roh += 1;
  });
  return { marks, struktur, roh };
}

const BLOCK_TAGS = /^(?:P|DIV|LI|H[1-6]|PRE|BLOCKQUOTE|TR|UL|OL|TABLE|SECTION|ARTICLE|HEADER|FOOTER)$/;

function textAusDom(knoten: globalThis.Node, aus: string[]): void {
  if (knoten.nodeType === 3) {
    aus.push((knoten.textContent ?? '').replace(/\s*\n\s*/g, ' '));
    return;
  }
  if (knoten.nodeType !== 1) return;
  const element = knoten as HTMLElement;
  const tag = element.tagName;
  if (tag === 'BR') {
    aus.push('\n');
    return;
  }
  if (tag === 'HR') {
    aus.push('\n\n---\n\n');
    return;
  }
  if (tag === 'PRE') {
    aus.push('\n', element.textContent ?? '', '\n');
    return;
  }
  const block = BLOCK_TAGS.test(tag);
  if (block) aus.push('\n');
  element.childNodes.forEach((kind) => textAusDom(kind, aus));
  if (block) aus.push('\n');
}

export function textAusHtml(html: string): string {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return '';
  const wrap = document.createElement('div');
  wrap.innerHTML = fragmentHtml(html);
  const aus: string[] = [];
  wrap.childNodes.forEach((kind) => textAusDom(kind, aus));
  return aus.join('').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
}

function waehleSchnitt(ausText: Slice | null, ausHtml: Slice | null): Slice | null {
  if (!ausHtml) return ausText;
  if (!ausText) return ausHtml;
  const text = reichtum(ausText);
  const html = reichtum(ausHtml);
  if (text.marks + text.struktur > html.marks + html.struktur) return ausText;
  if (html.roh > text.roh && text.marks + text.struktur >= html.marks + html.struktur) return ausText;
  return ausHtml;
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
  const text = textVon(daten) ?? (html ? textAusHtml(html) || null : null);
  const ausHtml = html ? sliceAusHtml(html, parent, view.state.selection.$from) : null;
  const ausText = text ? sliceAusText(text, parent) : null;
  const schnitt = waehleSchnitt(ausText, ausHtml);
  if (!schnitt) return false;
  return setzeSlice(view, schnitt);
}

interface Eingabe extends Event {
  inputType?: string;
  data?: string | null;
  isComposing?: boolean;
  dataTransfer?: DataTransfer | null;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

function einheitlich(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function eingabeText(eingabe: Eingabe): string | null {
  if (typeof eingabe.data === 'string') return eingabe.data;
  const daten = eingabe.dataTransfer;
  if (daten && typeof daten.getData === 'function') return daten.getData('text/plain') || null;
  return null;
}

export function istTastaturAblage(text: string | null): text is string {
  if (!text) return false;
  const zeichen = einheitlich(text);
  return zeichen.includes('\n') && zeichen.replaceAll('\n', '').length > 0;
}

function fuegeTextEin(view: EditorView, text: string): boolean {
  if (imCode(view)) {
    wortlaut(view, text);
    return true;
  }
  return setzeSlice(view, sliceAusText(einheitlich(text), view.state.selection.$from.parent));
}

function abfangen(view: EditorView, event: Event): boolean {
  const eingabe = event as Eingabe;
  if (event.defaultPrevented || !event.cancelable) return false;
  if (eingabe.inputType !== 'insertText' && eingabe.inputType !== 'insertFromPaste') return false;
  if (eingabe.isComposing === true) return false;
  if (eingabe.ctrlKey === true || eingabe.metaKey === true || eingabe.altKey === true) return false;
  const text = eingabeText(eingabe);
  if (!istTastaturAblage(text)) return false;
  event.preventDefault();
  return fuegeTextEin(view, text) || true;
}

interface Offen {
  text: string;
  zeit: number;
}

const NACHLAUF_MS = 1_500;

interface Zeichenfolge {
  text: string;
  stellen: number[];
}

function zeichenVon(doc: Node): Zeichenfolge {
  const teile: string[] = [];
  const stellen: number[] = [];
  doc.descendants((knoten, pos) => {
    if (!knoten.isText) return true;
    const text = knoten.text ?? '';
    teile.push(text);
    for (let i = 0; i < text.length; i += 1) stellen.push(pos + i);
    return false;
  });
  return { text: teile.join(''), stellen };
}

function nurText(doc: Node, von: number, bis: number): boolean {
  let ok = true;
  doc.nodesBetween(von, bis, (knoten) => {
    if (knoten.isInline && !knoten.isText) ok = false;
    return ok;
  });
  return ok;
}

function endetAm(doc: Node, bis: number, kopf: number): boolean {
  if (kopf === bis) return true;
  if (kopf < bis || kopf - bis > 2) return false;
  return doc.resolve(bis).parentOffset === doc.resolve(bis).parent.content.size && doc.textBetween(bis, kopf, '\n') === '';
}

function nachziehen(view: EditorView, offen: Offen): boolean {
  const state = view.state;
  const ziel = einheitlich(offen.text);
  const kern = ziel.replaceAll('\n', '');
  if (kern.length === 0) return false;
  const folge = zeichenVon(state.doc);
  const kopf = state.selection.to;
  let suche = folge.text.lastIndexOf(kern);
  while (suche >= 0) {
    const von = folge.stellen[suche]!;
    const bis = folge.stellen[suche + kern.length - 1]! + 1;
    if (endetAm(state.doc, bis, kopf) && nurText(state.doc, von, bis)) {
      const auswahl = state.tr.setSelection(TextSelection.create(state.doc, von, bis));
      const slice = sliceAusText(ziel, auswahl.selection.$from.parent);
      if (slice.size === 0) return false;
      const tr = auswahl.replaceSelection(slice).scrollIntoView();
      view.dispatch(tr.setMeta('paste', true).setMeta('uiEvent', 'paste'));
      return true;
    }
    suche = suche === 0 ? -1 : folge.text.lastIndexOf(kern, suche - 1);
  }
  return false;
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

export function tastaturAblage(): Plugin {
  let offen: Offen | null = null;
  let geplant = false;
  const pruefe = (view: EditorView) => {
    geplant = false;
    const jetzt = offen;
    if (!jetzt || view.isDestroyed) return;
    if (Date.now() - jetzt.zeit > NACHLAUF_MS || imCode(view)) {
      offen = null;
      return;
    }
    if (nachziehen(view, jetzt)) offen = null;
  };
  const plane = (view: EditorView) => {
    if (geplant || !offen) return;
    geplant = true;
    setTimeout(() => pruefe(view), 0);
  };
  return new Plugin({
    view: () => ({
      update(view) {
        if (offen) plane(view);
      },
    }),
    props: {
      handleDOMEvents: {
        beforeinput(view, event) {
          if (abfangen(view, event)) {
            offen = null;
            return true;
          }
          const eingabe = event as Eingabe;
          const art = eingabe.inputType ?? '';
          if (art !== 'insertCompositionText' && art !== 'insertText' && art !== 'insertFromPaste') return false;
          const text = eingabeText(eingabe);
          if (!istTastaturAblage(text) || event.defaultPrevented) return false;
          offen = { text, zeit: Date.now() };
          return false;
        },
        compositionend(view) {
          plane(view);
          return false;
        },
        input(view) {
          plane(view);
          return false;
        },
      },
    },
  });
}

export function modellAblage(): Plugin {
  return new Plugin<RandBild | null>({
    key: anfangRandKey,
    state: {
      init(_config, state) {
        return randBildVon(state);
      },
      apply(tr, wert, _alt, neu) {
        if (randGesperrt(tr)) return wert;
        if (!tr.docChanged) return tr.selectionSet || tr.storedMarksSet ? randBildVon(neu) : wert;
        const $pos = neu.selection.$from;
        if (wert && neu.selection.empty && $pos.parent.isTextblock && randPasst($pos.parent.textContent, wert)) return wert;
        return randBildVon(neu);
      },
    },
    appendTransaction(transactions, alt, neu) {
      if (transactions.some((tr) => randGesperrt(tr))) return null;
      const bild = anfangRandKey.getState(alt);
      if (!bild) return null;
      return nimmAnfangRand(neu, bild);
    },
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
