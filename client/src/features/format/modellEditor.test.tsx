import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { redoDepth, undoDepth } from 'prosemirror-history';
import { Fragment, Slice } from 'prosemirror-model';
import { AllSelection, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Root } from 'react-dom/client';
import { modell } from '../../../../shared/features/format/modell.ts';
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

async function oeffne(text: string, onText: (wert: string) => void): Promise<Sitz> {
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

function teile(text: string): string[] {
  return text.split(/(?<=\n)/);
}

function ersetzeZeile(view: EditorView, index: number, text: string) {
  const doc = view.state.doc;
  const knoten = doc.child(index);
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
  const marks = knoten.firstChild?.marks ?? [];
  const naechster = view.state.schema.text(text, marks);
  view.dispatch(view.state.tr.replace(pos + 1, pos + knoten.nodeSize - 1, new Slice(Fragment.from(naechster), 0, 0)));
}

function taste(view: EditorView, key: string, keyCode: number) {
  const ereignis = {
    type: 'keydown',
    key,
    code: `Key${key.toUpperCase()}`,
    keyCode,
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

function hatKlasse(knoten: Node, name: string): boolean {
  if (knoten.nodeType === 1 && (knoten as HTMLElement).classList.contains(name)) return true;
  return [...knoten.childNodes].some((kind) => hatKlasse(kind, name));
}

function ablage(text = ''): {
  getData: (art: string) => string;
  setData: (art: string, wert: string) => void;
  clearData: () => void;
} {
  const werte = new Map<string, string>();
  if (text) werte.set('text/plain', text);
  return {
    getData: (art) => werte.get(art) ?? '',
    setData: (art, wert) => { werte.set(art, wert); },
    clearData: () => { werte.clear(); },
  };
}

function zwischenablage(view: EditorView, art: 'paste' | 'copy' | 'cut', daten: ReturnType<typeof ablage>) {
  const ereignis = {
    type: art,
    clipboardData: daten,
    defaultPrevented: false,
    cancelBubble: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.cancelBubble = true; },
  };
  view.dom.dispatchEvent(ereignis as unknown as Event);
  return ereignis;
}

function waehleAlles(view: EditorView) {
  view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
}

function tagNamen(knoten: Node): string[] {
  const aus: string[] = [];
  if (knoten.nodeType === 1) aus.push((knoten as HTMLElement).tagName);
  knoten.childNodes.forEach((kind) => aus.push(...tagNamen(kind)));
  return aus;
}

describe('model editor', () => {
  it('keeps a loaded note byte for byte and does not save before typing', async () => {
    const text = '__alpha__\n__beta__\n_gamma_';
    const meldungen: string[] = [];
    const sitz = await oeffne(text, (wert) => meldungen.push(wert));
    try {
      expect(sitz.view.state.schema).toBe(modell);
      expect(speichere(sitz.view.state.doc)).toBe(text);
      expect(meldungen).toEqual([]);
      expect(undoDepth(sitz.view.state)).toBe(0);
    } finally {
      await zu(sitz);
    }
    const leer: string[] = [];
    const still = await oeffne('', (wert) => leer.push(wert));
    try {
      expect(speichere(still.view.state.doc)).toBe('');
      expect(leer).toEqual([]);
    } finally {
      await zu(still);
    }
  });

  it('reloads a new note through the same path without saving', async () => {
    const meldungen: string[] = [];
    const ref: { current: EditorView | null } = { current: null };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = wurzel(host);
    await act(async () => {
      root.render(createElement(ModellEditor, { text: 'eins', onText: (wert) => meldungen.push(wert), ref }));
    });
    await act(async () => {
      root.render(createElement(ModellEditor, { text: 'zwei', onText: (wert) => meldungen.push(wert), ref }));
    });
    try {
      expect(meldungen).toEqual([]);
      expect(ref.current).not.toBeNull();
      expect(speichere(ref.current!.state.doc)).toBe('zwei');
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('shows formats without their characters', async () => {
    const zeilen = [
      '**alpha**',
      '__beta__',
      '*gamma*',
      '~~delta~~',
      '`code`',
      '!!Wort!!',
      '- punkt',
      '[] aufgabe',
      '[x] an',
      '1. eins',
      '= Titel',
      '!!!! zeile',
    ];
    const text = zeilen.join('\n');
    const meldungen: string[] = [];
    const sitz = await oeffne(text, (wert) => meldungen.push(wert));
    try {
      const sichtbar = sitz.view.dom.textContent ?? '';
      const namen = tagNamen(sitz.view.dom);
      expect(sichtbar).toBe(['alpha', 'beta', 'gamma', 'delta', 'code', 'Wort', 'punkt', 'aufgabe', 'an', 'eins', 'Titel', 'zeile'].join(''));
      expect(sichtbar).not.toMatch(/[*_~`[\]!=]/);
      expect(namen).toContain('STRONG');
      expect(namen).toContain('EM');
      expect(namen).toContain('S');
      expect(namen).toContain('CODE');
      expect(namen).toContain('MARK');
      expect(namen).toContain('H2');
      expect(hatKlasse(sitz.view.dom, 'zu')).toBe(true);
      expect(meldungen).toEqual([]);
      expect(speichere(sitz.view.state.doc)).toBe(text);
    } finally {
      await zu(sitz);
    }
  });

  it('hides a code fence and keeps the words inside', async () => {
    const text = '```\nwort\n```';
    const sitz = await oeffne(text, () => undefined);
    try {
      expect(sitz.view.dom.textContent ?? '').toBe('wort');
      expect(speichere(sitz.view.state.doc)).toBe(text);
    } finally {
      await zu(sitz);
    }
  });

  it('shows a link as text and keeps the address on the anchor', async () => {
    const text = '[Ort](https://example.com)';
    const sitz = await oeffne(text, () => undefined);
    try {
      expect(sitz.view.dom.textContent).toBe('Ort');
      const anker = tagNamen(sitz.view.dom);
      expect(anker).toContain('A');
      let href = '';
      const lauf = (knoten: Node) => {
        if (knoten.nodeType === 1 && (knoten as HTMLElement).tagName === 'A') {
          href = (knoten as HTMLElement).getAttribute('href') ?? '';
        }
        knoten.childNodes.forEach(lauf);
      };
      lauf(sitz.view.dom);
      expect(href).toBe('https://example.com');
      expect(speichere(sitz.view.state.doc)).toBe(text);
    } finally {
      await zu(sitz);
    }
  });

  it('rewrites only the edited line and undoes that step', async () => {
    const text = '__alpha__\n__beta__\ngamma';
    const meldungen: string[] = [];
    const sitz = await oeffne(text, (wert) => meldungen.push(wert));
    try {
      ersetzeZeile(sitz.view, 1, 'betaX');
      const gespeichert = speichere(sitz.view.state.doc);
      const original = teile(text);
      const neu = teile(gespeichert);
      expect(neu[0]).toBe(original[0]);
      expect(neu[2]).toBe(original[2]);
      expect(neu[1]).toBe('**betaX**\n');
      expect(meldungen).toEqual([gespeichert]);
      expect(undoDepth(sitz.view.state)).toBe(1);
      expect(taste(sitz.view, 'z', 90)).toBe(true);
      expect(speichere(sitz.view.state.doc)).toBe(text);
      expect(undoDepth(sitz.view.state)).toBe(0);
      expect(redoDepth(sitz.view.state)).toBe(1);
      expect(taste(sitz.view, 'y', 89)).toBe(true);
      expect(speichere(sitz.view.state.doc)).toBe(gespeichert);
      expect(meldungen).toEqual([gespeichert, text, gespeichert]);
    } finally {
      await zu(sitz);
    }
  });

  it('formats pasted markdown and copies plain text', async () => {
    const meldungen: string[] = [];
    const sitz = await oeffne('', (wert) => meldungen.push(wert));
    try {
      zwischenablage(sitz.view, 'paste', ablage('**a** *b* - c'));
      const sichtbar = sitz.view.dom.textContent ?? '';
      expect(sichtbar).toBe('a b - c');
      expect(sichtbar).not.toMatch(/[*_~`]/);
      const namen = tagNamen(sitz.view.dom);
      expect(namen).toContain('STRONG');
      expect(namen).toContain('EM');
      expect(speichere(sitz.view.state.doc)).toBe('**a** *b* - c');
      expect(meldungen).toEqual(['**a** *b* - c']);
      expect(undoDepth(sitz.view.state)).toBe(1);
      waehleAlles(sitz.view);
      const daten = ablage();
      zwischenablage(sitz.view, 'copy', daten);
      expect(daten.getData('text/plain')).toBe('a b - c');
      expect(daten.getData('text/plain')).not.toMatch(/[*_~`]/);
      expect(taste(sitz.view, 'z', 90)).toBe(true);
      expect(speichere(sitz.view.state.doc)).toBe('');
    } finally {
      await zu(sitz);
    }
  });

  it('merges a pasted line into the current paragraph', async () => {
    const sitz = await oeffne('Hallo', () => undefined);
    try {
      sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(sitz.view.state.doc, 6)));
      zwischenablage(sitz.view, 'paste', ablage('**a**'));
      expect(sitz.view.dom.textContent).toBe('Halloa');
      expect(tagNamen(sitz.view.dom)).toContain('STRONG');
      expect(speichere(sitz.view.state.doc)).toBe('Hallo**a**');
    } finally {
      await zu(sitz);
    }
  });

  it('stores a pasted alternate spelling in canonical form', async () => {
    const sitz = await oeffne('', () => undefined);
    try {
      zwischenablage(sitz.view, 'paste', ablage('__a__'));
      expect(sitz.view.dom.textContent).toBe('a');
      expect(tagNamen(sitz.view.dom)).toContain('STRONG');
      expect(speichere(sitz.view.state.doc)).toBe('**a**');
    } finally {
      await zu(sitz);
    }
  });

  it('drops list markers from the view and from copied text', async () => {
    const sitz = await oeffne('', () => undefined);
    try {
      zwischenablage(sitz.view, 'paste', ablage('- c'));
      expect(sitz.view.dom.textContent).toBe('c');
      expect(speichere(sitz.view.state.doc)).toBe('- c');
      waehleAlles(sitz.view);
      const daten = ablage();
      zwischenablage(sitz.view, 'copy', daten);
      expect(daten.getData('text/plain')).toBe('c');
    } finally {
      await zu(sitz);
    }
  });

  it('keeps pasted characters inside a code block', async () => {
    const sitz = await oeffne('```\nwort\n```', () => undefined);
    try {
      let pos = 1;
      sitz.view.state.doc.descendants((node, start) => {
        if (node.isText && node.text === 'wort') pos = start + node.text.length;
      });
      sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(sitz.view.state.doc, pos)));
      zwischenablage(sitz.view, 'paste', ablage('**a**'));
      expect(sitz.view.dom.textContent).toContain('**a**');
      expect(speichere(sitz.view.state.doc)).toBe('```\nwort**a**\n```');
    } finally {
      await zu(sitz);
    }
  });
});
