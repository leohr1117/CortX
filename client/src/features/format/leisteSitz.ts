import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Mark } from 'prosemirror-model';
import type { Root } from 'react-dom/client';
import { Leiste } from './Leiste.tsx';
import { ModellEditor } from './ModellEditor.tsx';
import { entfernePruefDom, richtePruefDom } from './modellPruef.ts';
let wurzel: (container: Element) => Root;

export async function richteLeistenPruef(): Promise<void> {
  richtePruefDom();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
    addListener() {},
    removeListener() {},
  })) as typeof window.matchMedia;
  wurzel = (await import('react-dom/client')).createRoot;
}

export function entferneLeistenPruef(): void {
  entfernePruefDom();
}

export interface Sitz {
  view: EditorView;
  root: Root;
  host: HTMLElement;
  zeige: (stand: number) => Promise<void>;
}

export async function oeffne(
  text: string,
  onText: (wert: string) => void,
  extra?: { onLink?: () => void; onZiel?: () => void },
): Promise<Sitz> {
  const ref: { current: EditorView | null } = { current: null };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = wurzel(host);
  const zeichne = (stand: number) => createElement(
    'div',
    null,
    createElement(ModellEditor, { text, onText, onLink: extra?.onLink, ref }),
    createElement(Leiste, { view: ref.current, stand, modell: true, onZiel: extra?.onZiel }),
  );
  const zeige = async (stand: number) => {
    await act(async () => {
      root.render(zeichne(stand) as ReactNode);
    });
  };
  await act(async () => {
    root.render(zeichne(0) as ReactNode);
  });
  const view = ref.current;
  if (!view) throw new Error('missing editor');
  view.coordsAtPos = () => ({ left: 40, right: 48, top: 80, bottom: 96 });
  const doc = view.state.doc;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(
    doc,
    TextSelection.atStart(doc).from,
    TextSelection.atEnd(doc).to,
  )));
  await act(async () => {
    root.render(zeichne(1) as ReactNode);
  });
  return { view, root, host, zeige };
}

export async function zu(sitz: Sitz) {
  await act(async () => {
    sitz.root.unmount();
  });
  sitz.host.remove();
}

export function knopf(host: HTMLElement, label: string): HTMLElement {
  const fund: HTMLElement[] = [];
  const lauf = (knoten: Node) => {
    if (knoten.nodeType === 1 && (knoten as HTMLElement).getAttribute('aria-label') === label) {
      fund.push(knoten as HTMLElement);
    }
    knoten.childNodes.forEach(lauf);
  };
  lauf(host);
  const el = fund[0];
  if (!el) throw new Error(`missing ${label}`);
  return el;
}

export function gepresst(host: HTMLElement, label: string): string | null {
  return knopf(host, label).getAttribute('aria-pressed');
}

export function taste(
  view: EditorView,
  key: string,
  keyCode: number,
  shift = false,
  extra?: {
    alt?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    code?: string;
    ziel?: EventTarget;
    isComposing?: boolean;
    which?: number;
  },
): boolean {
  const ereignis = {
    type: 'keydown',
    key,
    code: extra?.code ?? `Key${key.toUpperCase()}`,
    keyCode,
    which: extra?.which,
    ctrlKey: extra?.ctrl ?? true,
    metaKey: extra?.meta ?? false,
    altKey: extra?.alt ?? false,
    shiftKey: shift,
    isComposing: extra?.isComposing === true,
    defaultPrevented: false,
    cancelBubble: false,
    preventDefault() { ereignis.defaultPrevented = true; },
    stopPropagation() { ereignis.cancelBubble = true; },
  };
  (extra?.ziel ?? view.dom).dispatchEvent(ereignis as unknown as Event);
  return ereignis.defaultPrevented;
}

export function wichtigTaste(
  view: EditorView,
  extra?: { alt?: boolean; ctrl?: boolean; meta?: boolean; ziel?: EventTarget; isComposing?: boolean },
): boolean {
  return taste(view, '!', 49, true, {
    code: 'Digit1',
    alt: extra?.alt,
    ctrl: extra?.ctrl,
    meta: extra?.meta,
    ziel: extra?.ziel,
    isComposing: extra?.isComposing,
  });
}

export function setzeKomposition(view: EditorView, an: boolean): void {
  (view as unknown as { input: { composing: boolean } }).input.composing = an;
}

export async function druecke(host: HTMLElement, label: string) {
  const el = knopf(host, label);
  const ereignis = {
    type: 'click',
    bubbles: true,
    cancelable: true,
    button: 0,
    target: el,
    currentTarget: null as EventTarget | null,
    cancelBubble: false,
    defaultPrevented: false,
    timeStamp: 1,
    preventDefault() { ereignis.defaultPrevented = true; },
    stopPropagation() { ereignis.cancelBubble = true; },
    getModifierState() { return false; },
  };
  await act(async () => {
    el.dispatchEvent(ereignis as unknown as Event);
  });
}

export function markenVon(view: EditorView, text: string): string[] {
  let marks: readonly Mark[] = [];
  view.state.doc.descendants((node) => {
    if (node.isText && node.text === text) marks = node.marks;
  });
  return marks.map((mark) => mark.type.name);
}

export function fundPos(view: EditorView, wort: string): number {
  let pos = -1;
  view.state.doc.descendants((node, start) => {
    if (pos >= 0 || !node.isText || !node.text) return;
    const index = node.text.indexOf(wort);
    if (index >= 0) pos = start + index;
  });
  if (pos < 0) throw new Error(`missing ${wort}`);
  return pos;
}

export async function waehleWoerter(sitz: Sitz, vonWort: string, bisWort: string, stand: number): Promise<void> {
  const doc = sitz.view.state.doc;
  const von = fundPos(sitz.view, vonWort);
  const bis = fundPos(sitz.view, bisWort) + bisWort.length;
  await act(async () => {
    sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(doc, von, bis)));
  });
  await sitz.zeige(stand);
}

export function arten(view: EditorView): string[] {
  const aus: string[] = [];
  view.state.doc.forEach((node) => {
    aus.push(node.type.name === 'punkt' ? String(node.attrs.art) : node.type.name);
  });
  return aus;
}
