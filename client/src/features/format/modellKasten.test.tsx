import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { undoDepth } from 'prosemirror-history';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Root } from 'react-dom/client';
import { ART } from '../../../../shared/features/format/baum.ts';
import { speichere } from '../../../../shared/features/format/speichern.ts';
import { ModellEditor } from './ModellEditor.tsx';
import { entfernePruefDom, richtePruefDom } from './modellPruef.ts';

let wurzel: (container: Element) => Root;

beforeAll(async () => {
  richtePruefDom();
  wurzel = (await import('react-dom/client')).createRoot;
});

afterAll(() => {
  entfernePruefDom();
});

interface Sitz {
  view: EditorView;
  root: Root;
  host: HTMLElement;
}

async function oeffne(text: string, onText: (wert: string) => void = () => undefined): Promise<Sitz> {
  const ref: { current: EditorView | null } = { current: null };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = wurzel(host);
  await act(async () => {
    root.render(createElement(ModellEditor, { text, onText, ref }) as ReactNode);
  });
  const view = ref.current;
  if (!view) throw new Error('missing editor');
  return { view, root, host };
}

async function zu(sitz: Sitz) {
  await act(async () => {
    sitz.root.unmount();
  });
  sitz.host.remove();
}

function kaesten(wurzelKnoten: Node): HTMLElement[] {
  const aus: HTMLElement[] = [];
  const lauf = (knoten: Node) => {
    if (knoten.nodeType === 1 && (knoten as HTMLElement).classList.contains('cm-haken')) aus.push(knoten as HTMLElement);
    knoten.childNodes.forEach(lauf);
  };
  lauf(wurzelKnoten);
  return aus;
}

function feuer(el: HTMLElement, type: string) {
  const ereignis = {
    type,
    bubbles: true,
    cancelable: true,
    cancelBubble: false,
    defaultPrevented: false,
    target: null as Node | null,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.cancelBubble = true; },
  };
  el.dispatchEvent(ereignis as unknown as Event);
  return ereignis;
}

function taste(view: EditorView) {
  const ereignis = {
    type: 'keydown',
    key: 'z',
    code: 'KeyZ',
    keyCode: 90,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    cancelBubble: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.cancelBubble = true; },
  };
  view.dom.dispatchEvent(ereignis as unknown as Event);
  return ereignis.defaultPrevented;
}

function haekchen(view: EditorView): boolean[] {
  const aus: boolean[] = [];
  view.state.doc.forEach((node) => {
    if (node.type.name === 'punkt' && node.attrs.art === ART.haken) aus.push(node.attrs.abgehakt === true);
  });
  return aus;
}

describe('checkbox in the model editor', () => {
  it('toggles on click, keeps the caret, and undoes as its own step', async () => {
    const text = '[] a\n[x] b';
    const meldungen: string[] = [];
    const sitz = await oeffne(text, (wert) => meldungen.push(wert));
    try {
      const fokus = document.activeElement;
      sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(sitz.view.state.doc, 1)));
      const vorher = sitz.view.state.selection.anchor;
      const kasten = kaesten(sitz.view.dom);
      expect(kasten).toHaveLength(2);
      expect(kasten[0]?.classList.contains('zu')).toBe(false);
      expect(kasten[1]?.classList.contains('zu')).toBe(true);
      const druck = feuer(kasten[0]!, 'mousedown');
      expect(druck.defaultPrevented).toBe(true);
      expect(haekchen(sitz.view)).toEqual([false, true]);
      expect(document.activeElement).toBe(fokus);
      feuer(kasten[0]!, 'pointerdown');
      feuer(kasten[0]!, 'touchstart');
      expect(haekchen(sitz.view)).toEqual([false, true]);
      feuer(kasten[0]!, 'click');
      expect(haekchen(sitz.view)).toEqual([true, true]);
      expect(kasten[0]?.classList.contains('zu')).toBe(true);
      expect(sitz.view.state.selection.anchor).toBe(vorher);
      expect(document.activeElement).toBe(fokus);
      expect(undoDepth(sitz.view.state)).toBe(1);
      expect(speichere(sitz.view.state.doc).split('\n')[1]).toBe('[x] b');
      expect(meldungen).toHaveLength(1);
      expect(taste(sitz.view)).toBe(true);
      expect(haekchen(sitz.view)).toEqual([false, true]);
      expect(kasten[0]?.classList.contains('zu')).toBe(false);
      expect(speichere(sitz.view.state.doc)).toBe(text);
      expect(sitz.view.state.selection.anchor).toBe(vorher);
      expect(undoDepth(sitz.view.state)).toBe(0);
    } finally {
      await zu(sitz);
    }
  });

  it('toggles once per tap and a second toggle restores the original text', async () => {
    const text = '- [ ] a\nkeep';
    const sitz = await oeffne(text);
    try {
      const kasten = kaesten(sitz.view.dom);
      expect(kasten).toHaveLength(1);
      feuer(kasten[0]!, 'touchend');
      feuer(kasten[0]!, 'click');
      expect(haekchen(sitz.view)).toEqual([true]);
      expect(undoDepth(sitz.view.state)).toBe(1);
      expect(speichere(sitz.view.state.doc).endsWith('keep')).toBe(true);
      feuer(kasten[0]!, 'click');
      expect(haekchen(sitz.view)).toEqual([false]);
      expect(speichere(sitz.view.state.doc)).toBe(text);
    } finally {
      await zu(sitz);
    }
  });
});
