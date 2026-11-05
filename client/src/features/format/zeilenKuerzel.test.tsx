import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { undoInputRule } from 'prosemirror-inputrules';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Root } from 'react-dom/client';
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
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

interface Sitz {
  view: EditorView;
  root: Root;
  host: HTMLElement;
}

async function oeffne(text: string): Promise<Sitz> {
  const ref: { current: EditorView | null } = { current: null };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = wurzel(host);
  await act(async () => {
    root.render(createElement(ModellEditor, { text, onText: () => undefined, ref }) as ReactNode);
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

async function leer(): Promise<Sitz> {
  const sitz = await oeffne('x');
  await act(async () => {
    const doc = sitz.view.state.doc;
    sitz.view.dispatch(sitz.view.state.tr.delete(1, doc.child(0).nodeSize - 1));
  });
  return sitz;
}

function schalter(an: boolean): void {
  const speicher = new Map<string, string>();
  if (!an) speicher.set('cortex.format-shortcuts', 'off');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => speicher.get(key) ?? null,
      setItem: (key: string, wert: string) => {
        speicher.set(key, wert);
      },
    },
  });
}

async function tippe(view: EditorView, text: string): Promise<void> {
  for (const zeichen of text) {
    await act(async () => {
      const { from, to } = view.state.selection;
      const behandelt = view.someProp('handleTextInput', (fn) => fn(view, from, to, zeichen, () => view.state.tr) === true);
      if (!behandelt) view.dispatch(view.state.tr.insertText(zeichen));
    });
  }
}

function anfang(view: EditorView, index: number): void {
  const doc = view.state.doc;
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
  const knoten = doc.child(index);
  const cursor = knoten.inlineContent ? pos + 1 : pos;
  const auswahl = knoten.inlineContent ? TextSelection.create(doc, cursor) : TextSelection.near(doc.resolve(cursor));
  view.dispatch(view.state.tr.setSelection(auswahl));
}

async function taste(view: EditorView, art: 'Backspace' | 'before'): Promise<void> {
  await act(async () => {
    const ereignis = {
      type: art === 'Backspace' ? 'keydown' : 'beforeinput',
      key: 'Backspace',
      keyCode: 8,
      inputType: 'deleteContentBackward',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      defaultPrevented: false,
      cancelBubble: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.cancelBubble = true;
      },
    };
    view.dom.dispatchEvent(ereignis as unknown as Event);
  });
}

const KUERZEL = [
  { name: 'list', text: '- ', knoten: 'punkt', art: 'liste' },
  { name: 'task', text: '[] ', knoten: 'punkt', art: 'haken' },
  { name: 'number', text: '1. ', knoten: 'punkt', art: 'nummer' },
  { name: 'heading', text: '# ', knoten: 'ueberschrift', art: '' },
] as const;

describe('line shortcuts in the note editor', () => {
  it('turns each line shortcut into its block', async () => {
    schalter(true);
    for (const fall of KUERZEL) {
      const sitz = await leer();
      try {
        await tippe(sitz.view, fall.text);
        const knoten = sitz.view.state.doc.child(0);
        expect(knoten.type.name, fall.name).toBe(fall.knoten);
        if (fall.art) expect(knoten.attrs.art, fall.name).toBe(fall.art);
        if (fall.name === 'heading') {
          expect(knoten.attrs.stufe).toBe(1);
          expect(knoten.attrs.zeichen).toBe('#');
        }
        expect(speichere(sitz.view.state.doc), fall.name).toBe(fall.text);
        expect(knoten.textContent, fall.name).toBe('');
      } finally {
        await zu(sitz);
      }
    }
  });

  it('restores the typed characters when backspace follows at once', async () => {
    schalter(true);
    for (const fall of KUERZEL) {
      for (const weg of ['Backspace', 'before'] as const) {
        const sitz = await leer();
        try {
          await tippe(sitz.view, fall.text);
          expect(undoInputRule(sitz.view.state), `${fall.name} ${weg}`).toBe(true);
          await taste(sitz.view, weg);
          const knoten = sitz.view.state.doc.child(0);
          expect(knoten.type.name, `${fall.name} ${weg}`).toBe('absatz');
          expect(knoten.textContent, `${fall.name} ${weg}`).toBe(fall.text);
        } finally {
          await zu(sitz);
        }
      }
    }
  });

  it('converts a shortcut that arrived as one insert and still undoes it', async () => {
    schalter(true);
    for (const fall of KUERZEL) {
      const sitz = await oeffne('x');
      try {
        const doc = sitz.view.state.doc;
        await act(async () => {
          sitz.view.dispatch(sitz.view.state.tr.delete(1, doc.child(0).nodeSize - 1));
          sitz.view.dispatch(sitz.view.state.tr.insertText(fall.text));
        });
        expect(sitz.view.state.doc.child(0).type.name, fall.name).toBe(fall.knoten);
        expect(speichere(sitz.view.state.doc), fall.name).toBe(fall.text);
        await taste(sitz.view, 'Backspace');
        expect(sitz.view.state.doc.child(0).type.name, fall.name).toBe('absatz');
        expect(sitz.view.state.doc.child(0).textContent, fall.name).toBe(fall.text);
      } finally {
        await zu(sitz);
      }
    }
  });

  it('keeps an untouched line byte for byte', async () => {
    schalter(true);
    const sitz = await oeffne('__alpha__\nplain');
    try {
      anfang(sitz.view, 1);
      await tippe(sitz.view, '- ');
      expect(speichere(sitz.view.state.doc)).toBe('__alpha__\n- plain');
      expect(sitz.view.state.doc.child(0).attrs.quelle).toContain('__alpha__');
    } finally {
      await zu(sitz);
    }
  });

  it('leaves a shortcut inside a line, a code block, and a closed switch as text', async () => {
    schalter(true);
    const mitte = await oeffne('say');
    try {
      await tippe(mitte.view, '- ');
      expect(mitte.view.state.doc.child(0).type.name).toBe('absatz');
      expect(speichere(mitte.view.state.doc)).toBe('say- ');
    } finally {
      await zu(mitte);
    }
    const stern = await oeffne('*');
    try {
      await tippe(stern.view, ' ');
      expect(stern.view.state.doc.child(0).type.name).toBe('absatz');
      expect(stern.view.state.doc.child(0).textContent).toBe('* ');
    } finally {
      await zu(stern);
    }
    const zaun = await oeffne('```\n\n```');
    try {
      anfang(zaun.view, 1);
      await tippe(zaun.view, '- ');
      expect(speichere(zaun.view.state.doc)).toBe('```\n- \n```');
      expect(zaun.view.state.doc.child(1).type.name).toBe('codeblock');
    } finally {
      await zu(zaun);
    }
    schalter(false);
    const aus = await oeffne('-');
    try {
      await tippe(aus.view, ' ');
      expect(aus.view.state.doc.child(0).type.name).toBe('absatz');
      expect(aus.view.state.doc.child(0).textContent).toBe('- ');
    } finally {
      await zu(aus);
    }
  });

  it('does not undo the block after another character', async () => {
    schalter(true);
    const sitz = await leer();
    try {
      await tippe(sitz.view, '- a');
      expect(undoInputRule(sitz.view.state)).toBe(false);
      await taste(sitz.view, 'Backspace');
      expect(sitz.view.state.doc.child(0).type.name).toBe('punkt');
      expect(sitz.view.state.doc.child(0).textContent).toBe('a');
    } finally {
      await zu(sitz);
    }
  });
});
