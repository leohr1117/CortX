import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Root } from 'react-dom/client';
import { packeDokument } from '../../../../shared/features/format/dokument.ts';
import { lade } from '../../../../shared/features/format/laden.ts';
import { stelleImModell } from '../../../../shared/features/format/modellpunkt.ts';
import { speichere } from '../../../../shared/features/format/speichern.ts';
import { ModellEditor } from './ModellEditor.tsx';
import { setzeKomposition } from './leisteSitz.ts';
import { entfernePruefDom, richtePruefDom } from './modellPruef.ts';

let wurzel: (container: Element) => Root;

beforeAll(async () => {
  richtePruefDom();
  wurzel = (await import('react-dom/client')).createRoot;
});

afterAll(() => {
  entfernePruefDom();
});

type Modus = 'notiz' | 'erfassen';

interface Props {
  text: string;
  modus: Modus;
  dokument?: unknown;
}

interface Sitz {
  view: EditorView;
  root: Root;
  host: HTMLElement;
  zeichne: (props: Props) => Promise<void>;
}

const MODI: readonly Modus[] = ['notiz', 'erfassen'];

async function oeffne(anfang: Props): Promise<Sitz> {
  const ref: { current: EditorView | null } = { current: null };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = wurzel(host);
  const zeichne = async (props: Props) => {
    await act(async () => {
      root.render(createElement(ModellEditor, {
        text: props.text,
        onText: () => undefined,
        modus: props.modus,
        dokument: props.dokument,
        ref,
      }) as ReactNode);
    });
  };
  await zeichne(anfang);
  const view = ref.current;
  if (!view) throw new Error('missing editor');
  return { view, root, host, zeichne };
}

async function zu(sitz: Sitz) {
  await act(async () => {
    sitz.root.unmount();
  });
  sitz.host.remove();
}

function stelle(view: EditorView, index: number): number {
  const text = speichere(view.state.doc);
  const pos = stelleImModell(view.state.doc, text, index);
  if (pos === null) throw new Error(`no position ${index} in ${JSON.stringify(text)}`);
  return pos;
}

function setzeIndex(view: EditorView, index: number): void {
  const pos = stelle(view, index);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

function markiere(view: EditorView, von: number, bis: number): void {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, stelle(view, von), stelle(view, bis))));
}

function findeText(knoten: Node, wort: string): Text | null {
  if (knoten.nodeType === 3 && (knoten.textContent ?? '').includes(wort)) return knoten as Text;
  for (let i = 0; i < knoten.childNodes.length; i += 1) {
    const fund = findeText(knoten.childNodes[i]!, wort);
    if (fund) return fund;
  }
  return null;
}

function bereichAuf(view: EditorView, wort: string) {
  const knoten = findeText(view.dom, wort);
  if (!knoten) throw new Error(`missing ${wort}`);
  const start = (knoten.textContent ?? '').indexOf(wort);
  return () => [{
    startContainer: knoten,
    startOffset: start,
    endContainer: knoten,
    endOffset: start + wort.length,
  }];
}

function sende(view: EditorView, felder: Record<string, unknown>): boolean {
  const ziel = {
    type: 'beforeinput',
    cancelable: true,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    data: null as string | null,
    inputType: '',
    defaultPrevented: false,
    cancelBubble: false,
    getTargetRanges(): unknown[] { return []; },
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.cancelBubble = true; },
    ...felder,
  };
  view.dom.dispatchEvent(ziel as unknown as Event);
  return ziel.defaultPrevented === true;
}

async function beide(text: string, pruefe: (view: EditorView) => void): Promise<void> {
  for (const modus of MODI) {
    const sitz = await oeffne({ text, modus });
    try {
      pruefe(sitz.view);
    } finally {
      await zu(sitz);
    }
  }
}

describe('keyboard suggestions replace the current word', () => {
  it('replaces the target range on the typed word', async () => {
    await beide('einkau', (view) => {
      setzeIndex(view, 0);
      expect(sende(view, {
        inputType: 'insertReplacementText',
        data: 'Einkauf',
        getTargetRanges: bereichAuf(view, 'einkau'),
      })).toBe(true);
      expect(speichere(view.state.doc)).toBe('Einkauf');
    });
  });

  it('replaces a selection when the target range is empty', async () => {
    await beide('einkau', (view) => {
      markiere(view, 0, 'einkau'.length);
      expect(sende(view, { inputType: 'insertReplacementText', data: 'Einkauf', getTargetRanges: () => [] })).toBe(true);
      expect(speichere(view.state.doc)).toBe('Einkauf');
    });
  });

  it('replaces the same selection inside a sentence', async () => {
    await beide('Bitte einkau', (view) => {
      const start = 'Bitte einkau'.indexOf('einkau');
      markiere(view, start, start + 'einkau'.length);
      expect(sende(view, { inputType: 'insertReplacementText', data: 'Einkauf', getTargetRanges: () => [] })).toBe(true);
      expect(speichere(view.state.doc)).toBe('Bitte Einkauf');
    });
  });

  it('replaces the word before the cursor when the target range is empty', async () => {
    await beide('Bitte einkau', (view) => {
      setzeIndex(view, 'Bitte einkau'.length);
      expect(sende(view, { inputType: 'insertReplacementText', data: 'Einkauf', getTargetRanges: () => [] })).toBe(true);
      expect(speichere(view.state.doc)).toBe('Bitte Einkauf');
    });
  });

  it('keeps the space after the word before the cursor', async () => {
    await beide('Bitte einkau ', (view) => {
      setzeIndex(view, 'Bitte einkau'.length);
      expect(sende(view, { inputType: 'insertReplacementText', data: 'Einkauf', getTargetRanges: () => [] })).toBe(true);
      expect(speichere(view.state.doc)).toBe('Bitte Einkauf ');
    });
  });

  it('keeps a trailing space when the word itself is replaced', async () => {
    await beide('einkau ', (view) => {
      setzeIndex(view, 'einkau'.length);
      expect(sende(view, { inputType: 'insertReplacementText', data: 'Einkauf', getTargetRanges: () => [] })).toBe(true);
      expect(speichere(view.state.doc)).toBe('Einkauf ');
    });
  });

  it('does not prevent a plain character or replace the word', async () => {
    await beide('einkau', (view) => {
      setzeIndex(view, 'einkau'.length);
      expect(sende(view, { inputType: 'insertText', data: 'x', getTargetRanges: () => [] })).toBe(false);
      expect(speichere(view.state.doc)).toBe('einkau');
    });
  });

  it('leaves a cancelable composition event alone', async () => {
    await beide('einkau', (view) => {
      setzeIndex(view, 'einkau'.length);
      expect(sende(view, { inputType: 'insertCompositionText', data: 'Einkauf', cancelable: true })).toBe(false);
      expect(speichere(view.state.doc)).toBe('einkau');
    });
  });

  it('leaves a composition event alone while a composition is active', async () => {
    await beide('einkau', (view) => {
      setzeIndex(view, 'einkau'.length);
      setzeKomposition(view, true);
      expect(sende(view, {
        inputType: 'insertCompositionText',
        data: 'Einkauf',
        cancelable: true,
        isComposing: true,
      })).toBe(false);
      expect(speichere(view.state.doc)).toBe('einkau');
    });
  });

  it('does not rebuild the note when text changes during a composition', async () => {
    const sitz = await oeffne({ text: 'einkau', modus: 'notiz' });
    try {
      setzeIndex(sitz.view, 1);
      const anker = sitz.view.state.selection.anchor;
      const kopf = sitz.view.state.selection.head;
      setzeKomposition(sitz.view, true);
      await sitz.zeichne({ text: 'andere', modus: 'notiz' });
      expect(speichere(sitz.view.state.doc)).toBe('einkau');
      expect(sitz.view.state.selection.anchor).toBe(anker);
      expect(sitz.view.state.selection.head).toBe(kopf);
    } finally {
      await zu(sitz);
    }
  });

  it('does not rebuild capture when text changes during a composition', async () => {
    const sitz = await oeffne({ text: 'einkau', modus: 'erfassen' });
    try {
      setzeIndex(sitz.view, 1);
      const anker = sitz.view.state.selection.anchor;
      const kopf = sitz.view.state.selection.head;
      setzeKomposition(sitz.view, true);
      await sitz.zeichne({ text: 'andere', modus: 'erfassen' });
      expect(speichere(sitz.view.state.doc)).toBe('einkau');
      expect(sitz.view.state.selection.anchor).toBe(anker);
      expect(sitz.view.state.selection.head).toBe(kopf);
    } finally {
      await zu(sitz);
    }
  });

  it('does not rebuild the note when the document changes during a composition', async () => {
    const sitz = await oeffne({ text: 'einkau', modus: 'notiz' });
    try {
      setzeIndex(sitz.view, 1);
      const anker = sitz.view.state.selection.anchor;
      const kopf = sitz.view.state.selection.head;
      setzeKomposition(sitz.view, true);
      await sitz.zeichne({ text: 'einkau', modus: 'notiz', dokument: packeDokument(lade('andere')) });
      expect(speichere(sitz.view.state.doc)).toBe('einkau');
      expect(sitz.view.state.selection.anchor).toBe(anker);
      expect(sitz.view.state.selection.head).toBe(kopf);
    } finally {
      await zu(sitz);
    }
  });

  it('does not rebuild capture when the document changes during a composition', async () => {
    const sitz = await oeffne({ text: 'einkau', modus: 'erfassen' });
    try {
      setzeIndex(sitz.view, 1);
      const anker = sitz.view.state.selection.anchor;
      const kopf = sitz.view.state.selection.head;
      setzeKomposition(sitz.view, true);
      await sitz.zeichne({ text: 'einkau', modus: 'erfassen', dokument: packeDokument(lade('andere')) });
      expect(speichere(sitz.view.state.doc)).toBe('einkau');
      expect(sitz.view.state.selection.anchor).toBe(anker);
      expect(sitz.view.state.selection.head).toBe(kopf);
    } finally {
      await zu(sitz);
    }
  });
});
