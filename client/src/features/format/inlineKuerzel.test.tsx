import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { undoInputRule } from 'prosemirror-inputrules';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Root } from 'react-dom/client';
import { lade } from '../../../../shared/features/format/laden.ts';
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

function markNamen(view: EditorView): string[] {
  const namen = new Set<string>();
  view.state.doc.child(0).descendants((knoten) => {
    for (const mark of knoten.marks) namen.add(mark.type.name);
  });
  return [...namen];
}

const KUERZEL = [
  { name: 'bold', text: '**x**', marke: 'fett', quelle: '**x**' },
  { name: 'italic', text: '*x*', marke: 'kursiv', quelle: '*x*' },
  { name: 'strike', text: '~~x~~', marke: 'strich', quelle: '~~x~~' },
  { name: 'important', text: '!!x!!', marke: 'wichtig', quelle: '!!x!!' },
  { name: 'code', text: '`x`', marke: 'code', quelle: '`x`' },
] as const;

describe('inline shortcuts in the note editor', () => {
  it('turns each inline shortcut into its mark', async () => {
    schalter(true);
    for (const fall of KUERZEL) {
      const sitz = await leer();
      try {
        await tippe(sitz.view, fall.text);
        expect(sitz.view.state.doc.child(0).textContent, fall.name).toBe('x');
        expect(markNamen(sitz.view), fall.name).toEqual([fall.marke]);
        expect(speichere(sitz.view.state.doc), fall.name).toBe(fall.quelle);
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
          expect(sitz.view.state.doc.child(0).textContent, `${fall.name} ${weg}`).toBe(fall.text);
          expect(markNamen(sitz.view), `${fall.name} ${weg}`).toEqual([]);
          const roh = speichere(sitz.view.state.doc);
          const wieder = lade(roh);
          expect(wieder.child(0).textContent, `${fall.name} ${weg}`).toBe(fall.text);
          expect(wieder.child(0).type.name, `${fall.name} ${weg}`).toBe('absatz');
        } finally {
          await zu(sitz);
        }
      }
    }
  });

  it('keeps an untouched line byte for byte', async () => {
    schalter(true);
    const sitz = await oeffne('__alpha__\nplain');
    try {
      anfang(sitz.view, 1);
      await tippe(sitz.view, '**x**');
      expect(speichere(sitz.view.state.doc)).toBe('__alpha__\n**x**plain');
      expect(sitz.view.state.doc.child(0).attrs.quelle).toContain('__alpha__');
    } finally {
      await zu(sitz);
    }
  });

  it('leaves the characters literal when the switch is off and stores them escaped', async () => {
    schalter(false);
    const fett = await leer();
    try {
      await tippe(fett.view, '**x**');
      expect(fett.view.state.doc.child(0).textContent).toBe('**x**');
      expect(markNamen(fett.view)).toEqual([]);
      const roh = speichere(fett.view.state.doc);
      expect(roh).toBe('\\*\\*x\\*\\*');
      expect(lade(roh).textContent).toBe('**x**');
      expect(lade(roh).child(0).type.name).toBe('absatz');
    } finally {
      await zu(fett);
    }
    const liste = await leer();
    try {
      await tippe(liste.view, '- ');
      expect(liste.view.state.doc.child(0).type.name).toBe('absatz');
      expect(liste.view.state.doc.child(0).textContent).toBe('- ');
      expect(speichere(liste.view.state.doc)).toBe('\\- ');
      expect(lade('\\- ').child(0).type.name).toBe('absatz');
    } finally {
      await zu(liste);
    }
    const kopf = await leer();
    try {
      await tippe(kopf.view, '# ');
      expect(kopf.view.state.doc.child(0).type.name).toBe('absatz');
      expect(kopf.view.state.doc.child(0).textContent).toBe('# ');
      expect(speichere(kopf.view.state.doc)).toBe('\\# ');
      expect(lade('\\# ').textContent).toBe('# ');
    } finally {
      await zu(kopf);
    }
  });

  it('does not convert a shortcut inside a code block', async () => {
    schalter(true);
    const sitz = await oeffne('```\n\n```');
    try {
      anfang(sitz.view, 1);
      await tippe(sitz.view, '**x**');
      expect(speichere(sitz.view.state.doc)).toBe('```\n**x**\n```');
      expect(sitz.view.state.doc.child(1).type.name).toBe('codeblock');
    } finally {
      await zu(sitz);
    }
    const suffix = await oeffne('```\n\n```');
    try {
      anfang(suffix.view, 1);
      await tippe(suffix.view, 'hello**');
      expect(speichere(suffix.view.state.doc)).toBe('```\nhello**\n```');
      expect(suffix.view.state.doc.child(1).type.name).toBe('codeblock');
    } finally {
      await zu(suffix);
    }
  });

  it('does not rewrite a word shortcut inside a code span', async () => {
    schalter(true);
    const span = await oeffne('`hello`');
    try {
      let pos = -1;
      span.view.state.doc.descendants((node, offset) => {
        if (!node.isText || !node.marks.some((mark) => mark.type.name === 'code')) return;
        pos = offset + node.nodeSize;
        return false;
      });
      if (pos < 0) throw new Error('no code');
      await act(async () => {
        span.view.dispatch(span.view.state.tr.setSelection(TextSelection.create(span.view.state.doc, pos)));
      });
      await tippe(span.view, '**');
      expect(speichere(span.view.state.doc)).toBe('`hello**`');
    } finally {
      await zu(span);
    }
  });

  it('still wraps a word when two stars are typed after it', async () => {
    schalter(true);
    const sitz = await leer();
    try {
      await tippe(sitz.view, 'hello**');
      expect(speichere(sitz.view.state.doc)).toBe('**hello**');
      expect(sitz.view.state.doc.child(0).textContent).toBe('hello');
      expect(markNamen(sitz.view)).toEqual(['fett']);
    } finally {
      await zu(sitz);
    }
  });
});
