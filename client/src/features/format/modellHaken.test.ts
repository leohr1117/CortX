import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import type { Root } from 'react-dom/client';
import type { Thema } from '../../../../shared/kern/modell.ts';
import { modell } from '../../../../shared/features/format/modell.ts';
import { ErfassenFeld } from '../capture/ErfassenFeld.tsx';
import { ModellEditor } from './ModellEditor.tsx';
import { entfernePruefDom, richtePruefDom } from './modellPruef.ts';
import { klartextVon, type ModellLeser } from './modellHaken.ts';

vi.mock('../offline/index.ts', () => ({
  liesEntwurf: () => Promise.resolve(''),
  schreibEntwurf: () => Promise.resolve(),
}));

const themen: Thema[] = [{ name: 'Home', count: 1 }];

let wurzel: (container: Element) => Root;

beforeAll(async () => {
  richtePruefDom();
  const dokument = document as unknown as { getElementById: (id: string) => HTMLElement | null };
  dokument.getElementById = () => null;
  (globalThis as unknown as { ResizeObserver: new () => { observe: () => void; disconnect: () => void } }).ResizeObserver =
    class {
      observe() {}
      disconnect() {}
    };
  wurzel = (await import('react-dom/client')).createRoot;
});

afterAll(() => {
  entfernePruefDom();
});

function leser(): ModellLeser | undefined {
  return (window as Window & { __cortxModell?: ModellLeser }).__cortxModell;
}

async function ohneTest(lauf: () => Promise<void>): Promise<void> {
  const alt = process.env.CORTX_TEST;
  const fenster = window as Window & { __CORTX_TEST?: string };
  const marke = fenster.__CORTX_TEST;
  delete process.env.CORTX_TEST;
  delete fenster.__CORTX_TEST;
  try {
    await lauf();
  } finally {
    if (alt === undefined) delete process.env.CORTX_TEST;
    else process.env.CORTX_TEST = alt;
    if (marke === undefined) delete fenster.__CORTX_TEST;
    else fenster.__CORTX_TEST = marke;
  }
}

async function oeffneModell(text: string, ref?: { current: EditorView | null }): Promise<{ root: Root; host: HTMLElement }> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = wurzel(host);
  await act(async () => {
    root.render(createElement(ModellEditor, { text, onText: () => undefined, ref }) as ReactNode);
  });
  return { root, host };
}

async function oeffneFeld(text: string): Promise<{ root: Root; host: HTMLElement }> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = wurzel(host);
  await act(async () => {
    root.render(createElement(ErfassenFeld, { text, themen, onText: () => undefined }) as ReactNode);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { root, host };
}

async function zu(sitz: { root: Root; host: HTMLElement }): Promise<void> {
  await act(async () => {
    sitz.root.unmount();
  });
  sitz.host.remove();
}

describe('modell hook', () => {
  it('reads only text nodes and joins blocks', () => {
    const absatz = modell.nodes.absatz;
    const fett = modell.marks.fett;
    if (!absatz || !fett) throw new Error('missing schema');
    const doc = modell.node('doc', null, [
      absatz.create({ quelle: '**fett**', flucht: false }, modell.text('fett', [fett.create()])),
      absatz.create(null, modell.text('danach')),
    ]);
    expect(klartextVon(doc)).toBe('fett\ndanach');
    expect(doc.firstChild?.attrs.quelle).toBe('**fett**');
  });

  it('attaches a read-only hook to the note editor only while the test flag is set', async () => {
    await ohneTest(async () => {
      const aus = await oeffneModell('Hallo');
      expect(leser()).toBeUndefined();
      await zu(aus);
    });
    const ref: { current: EditorView | null } = { current: null };
    const an = await oeffneModell('Hallo', ref);
    const haken = leser();
    const view = ref.current;
    if (!haken || !view) throw new Error('missing hook');
    const vorher = JSON.stringify(view.state.doc.toJSON());
    expect(Object.keys(haken).sort()).toEqual(['json', 'klartext']);
    expect(haken.klartext()).toBe('Hallo');
    expect(haken.json()).toEqual(view.state.doc.toJSON());
    haken.json();
    haken.klartext();
    expect(JSON.stringify(view.state.doc.toJSON())).toBe(vorher);
    await zu(an);
    expect(leser()).toBeUndefined();
  });

  it('follows the window flag when the env var is absent', async () => {
    const alt = process.env.CORTX_TEST;
    const fenster = window as Window & { __CORTX_TEST?: string };
    delete process.env.CORTX_TEST;
    fenster.__CORTX_TEST = '1';
    try {
      const an = await oeffneModell('Hallo');
      expect(leser()?.klartext()).toBe('Hallo');
      await zu(an);
      expect(leser()).toBeUndefined();
    } finally {
      delete fenster.__CORTX_TEST;
      if (alt === undefined) delete process.env.CORTX_TEST;
      else process.env.CORTX_TEST = alt;
    }
  });

  it('keeps the hook of the editor that is still open', async () => {
    const erste = await oeffneModell('eins');
    const zweite = await oeffneModell('zwei');
    expect(leser()?.klartext()).toBe('zwei');
    await zu(erste);
    expect(leser()?.klartext()).toBe('zwei');
    await zu(zweite);
    expect(leser()).toBeUndefined();
  });

  it('attaches the hook to the capture field and removes it on unmount', async () => {
    await ohneTest(async () => {
      const aus = await oeffneFeld('Milch');
      expect(leser()).toBeUndefined();
      await zu(aus);
    });
    const an = await oeffneFeld('Milch');
    expect(leser()?.klartext()).toBe('Milch');
    expect(leser()?.json()).toMatchObject({ type: 'doc' });
    await zu(an);
    expect(leser()).toBeUndefined();
  });
});
