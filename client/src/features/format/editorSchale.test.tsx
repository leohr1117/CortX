import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteSelection } from 'prosemirror-commands';
import { AllSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Root } from 'react-dom/client';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import { speichere } from '../../../../shared/features/format/speichern.ts';
import { ModellEditor } from './ModellEditor.tsx';
import { entfernePruefDom, richtePruefDom } from './modellPruef.ts';
import type { EditorModus } from './editorSchale.ts';

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

async function oeffne(
  text: string,
  extra: { modus?: EditorModus; onAblegen?: () => void; platzhalter?: string } = {},
): Promise<Sitz> {
  const ref: { current: EditorView | null } = { current: null };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = wurzel(host);
  await act(async () => {
    root.render(createElement(ModellEditor, {
      text,
      onText: () => undefined,
      onAblegen: extra.onAblegen,
      modus: extra.modus,
      platzhalter: extra.platzhalter,
      ref,
    }) as ReactNode);
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

function mitKlasse(knoten: Node, name: string): HTMLElement[] {
  const aus: HTMLElement[] = [];
  if (knoten.nodeType === 1 && (knoten as HTMLElement).classList.contains(name)) aus.push(knoten as HTMLElement);
  knoten.childNodes.forEach((kind) => aus.push(...mitKlasse(kind, name)));
  return aus;
}

function enterMitStrg(view: EditorView) {
  const ereignis = {
    type: 'keydown',
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    ctrlKey: true,
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
  return ereignis;
}

describe('shared editor shell', () => {
  it('shows the placeholder in an empty note and hides it once there is text', async () => {
    const leer = await oeffne('');
    try {
      const hinweis = mitKlasse(leer.view.dom, 'cm-placeholder');
      expect(hinweis).toHaveLength(1);
      expect(hinweis[0]?.textContent).toBe(TEXTE.platzhalter);
      expect(hinweis[0]?.getAttribute('aria-hidden')).toBe('true');
      const rahmen = leer.view.dom.parentElement ?? leer.view.dom.parentNode;
      expect((rahmen as HTMLElement).classList.contains('schreib')).toBe(true);
      expect((rahmen as HTMLElement).classList.contains('modell-host')).toBe(true);
      expect(mitKlasse(leer.host, 'erfassen')).toHaveLength(0);
    } finally {
      await zu(leer);
    }
    const voll = await oeffne('Hallo');
    try {
      expect(mitKlasse(voll.view.dom, 'cm-placeholder')).toHaveLength(0);
      expect(speichere(voll.view.state.doc)).toBe('Hallo');
    } finally {
      await zu(voll);
    }
  });

  it('keeps the note frame after the text is cleared', async () => {
    const sitz = await oeffne('Seite');
    try {
      sitz.view.dispatch(sitz.view.state.tr.setSelection(new AllSelection(sitz.view.state.doc)));
      deleteSelection(sitz.view.state, sitz.view.dispatch);
      expect(speichere(sitz.view.state.doc)).toBe('');
      expect(mitKlasse(sitz.view.dom, 'cm-placeholder')).toHaveLength(1);
    } finally {
      await zu(sitz);
    }
  });

  it('uses the capture frame and files on Ctrl+Enter only in that mode', async () => {
    const abgelegt: number[] = [];
    const erfassen = await oeffne('Milch', { modus: 'erfassen', onAblegen: () => abgelegt.push(1) });
    try {
      expect(mitKlasse(erfassen.host, 'erfassen')).toHaveLength(1);
      const host = erfassen.view.dom.parentElement ?? erfassen.view.dom.parentNode;
      expect((host as HTMLElement).classList.contains('cm-editor')).toBe(true);
      expect(erfassen.view.dom.classList.contains('cm-content')).toBe(true);
      const taste = enterMitStrg(erfassen.view);
      expect(taste.defaultPrevented).toBe(true);
      expect(abgelegt).toEqual([1]);
      expect(speichere(erfassen.view.state.doc)).toBe('Milch');
    } finally {
      await zu(erfassen);
    }
    const notizAbgelegt: number[] = [];
    const notiz = await oeffne('Milch', { modus: 'notiz', onAblegen: () => notizAbgelegt.push(1) });
    try {
      enterMitStrg(notiz.view);
      expect(notizAbgelegt).toEqual([]);
      expect(speichere(notiz.view.state.doc)).toBe('Milch');
    } finally {
      await zu(notiz);
    }
  });
});
