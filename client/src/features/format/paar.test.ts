import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import type { Root } from 'react-dom/client';
import { speichere } from '../../../../shared/features/format/speichern.ts';
import { ModellEditor } from './ModellEditor.tsx';
import { entfernePruefDom, richtePruefDom } from './modellPruef.ts';
import { klartextVon } from './modellHaken.ts';

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

interface Griff {
  dispatch: (spec: {
    changes?: { from: number; to: number; insert: string };
    selection?: { anchor: number; head?: number };
  }) => void;
  readonly state: { doc: { length: number; toString: () => string } };
}

async function oeffne(text: string, modus: 'erfassen' | 'notiz'): Promise<Sitz> {
  const ref: { current: EditorView | null } = { current: null };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = wurzel(host);
  await act(async () => {
    root.render(createElement(ModellEditor, { text, onText: () => undefined, modus, ref }) as ReactNode);
  });
  const view = ref.current;
  if (!view) throw new Error('missing editor');
  return { view, root, host };
}

async function zu(sitz: Sitz): Promise<void> {
  await act(async () => {
    sitz.root.unmount();
  });
  sitz.host.remove();
}

function griff(view: EditorView): Griff {
  const cm = (view.dom as HTMLElement & { cm?: Griff }).cm;
  if (!cm) throw new Error('missing grip');
  return cm;
}

function marken(view: EditorView): string[] {
  const namen = new Set<string>();
  view.state.doc.descendants((knoten) => {
    for (const mark of knoten.marks) namen.add(mark.type.name);
  });
  return [...namen];
}

function mitKlasse(knoten: globalThis.Node, name: string): string[] {
  const aus: string[] = [];
  const lauf = (aktuell: globalThis.Node) => {
    if (aktuell.nodeType !== 1) return;
    const el = aktuell as HTMLElement;
    if (el.classList.contains(name)) aus.push(el.textContent ?? '');
    for (const kind of [...el.childNodes]) lauf(kind);
  };
  lauf(knoten);
  return aus;
}

async function sende(view: EditorView, art: 'taste' | 'eingabe'): Promise<void> {
  await act(async () => {
    view.focus();
    const ereignis = {
      type: art === 'taste' ? 'keydown' : 'beforeinput',
      key: 'Backspace',
      code: 'Backspace',
      keyCode: 8,
      inputType: 'deleteContentBackward',
      data: null,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      isComposing: false,
      defaultPrevented: false,
      cancelBubble: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.cancelBubble = true; },
    };
    view.dom.dispatchEvent(ereignis as unknown as Event);
  });
}

const FELDER = ['erfassen', 'notiz'] as const;

describe('format lives in the model on both fields', () => {
  it('imports markdown and exports it without storing marker characters', async () => {
    for (const modus of FELDER) {
      const sitz = await oeffne('*test*', modus);
      try {
        const cm = griff(sitz.view);
        expect(cm.state.doc.toString(), modus).toBe('*test*');
        expect(speichere(sitz.view.state.doc), modus).toBe('*test*');
        expect(klartextVon(sitz.view.state.doc), modus).toBe('test');
        expect(sitz.view.dom.textContent, modus).toBe('test');
        expect(marken(sitz.view), modus).toEqual(['kursiv']);
        expect(mitKlasse(sitz.view.dom, 'cm-kursiv'), modus).toContain('test');
        cm.dispatch({
          changes: { from: 0, to: cm.state.doc.length, insert: '**x**' },
          selection: { anchor: '**x**'.length },
        });
        expect(cm.state.doc.toString(), modus).toBe('**x**');
        expect(klartextVon(sitz.view.state.doc), modus).toBe('x');
        expect(sitz.view.dom.textContent, modus).toBe('x');
        expect(marken(sitz.view), modus).toEqual(['fett']);
        expect(mitKlasse(sitz.view.dom, 'cm-fett'), modus).toContain('x');
      } finally {
        await zu(sitz);
      }
    }
  });

  it('backspace on the capture field deletes a letter and keeps the mark', async () => {
    for (const art of ['taste', 'eingabe'] as const) {
      const sitz = await oeffne('*test*', 'erfassen');
      try {
        await sende(sitz.view, art);
        expect(klartextVon(sitz.view.state.doc), art).toBe('tes');
        expect(speichere(sitz.view.state.doc), art).toBe('*tes*');
        expect(sitz.view.dom.textContent, art).toBe('tes');
        expect(marken(sitz.view), art).toEqual(['kursiv']);
      } finally {
        await zu(sitz);
      }
    }
  });
});
