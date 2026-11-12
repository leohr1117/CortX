import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import type { Root } from 'react-dom/client';
import { TextSelection } from 'prosemirror-state';
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

function ablage(text: string, html?: string) {
  const werte = new Map<string, string>([['text/plain', text]]);
  if (html !== undefined) werte.set('text/html', html);
  return {
    getData: (art: string) => werte.get(art) ?? '',
    setData: (art: string, wert: string) => {
      werte.set(art, wert);
    },
    clearData: () => {
      werte.clear();
    },
  };
}

function zwischenablage(view: EditorView, daten: ReturnType<typeof ablage>) {
  const ereignis = {
    type: 'paste',
    clipboardData: daten,
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
}

function mitKlasse(knoten: Node, name: string): HTMLElement[] {
  const aus: HTMLElement[] = [];
  if (knoten.nodeType === 1 && (knoten as HTMLElement).classList.contains(name)) aus.push(knoten as HTMLElement);
  knoten.childNodes.forEach((kind) => aus.push(...mitKlasse(kind, name)));
  return aus;
}

async function fuegeEin(text: string): Promise<Sitz> {
  const sitz = await oeffne('', () => undefined);
  zwischenablage(sitz.view, ablage(text));
  return sitz;
}

describe('pasted numbered lists', () => {
  it('formats each pasted kind and drops the marker characters', async () => {
    const einzeln = [
      { roh: '1. milk', text: '1. milk', klasse: 'nummer', labels: [''] },
      { roh: 'A. milk', text: 'A. milk', klasse: 'nummerart', labels: ['A.'] },
      { roh: 'a. milk', text: 'a. milk', klasse: 'nummerart', labels: ['a.'] },
      { roh: 'I. milk', text: 'I. milk', klasse: 'nummerart', labels: ['I.'] },
      { roh: 'i. milk', text: 'i. milk', klasse: 'nummerart', labels: ['i.'] },
    ];
    for (const fall of einzeln) {
      const sitz = await fuegeEin(fall.roh);
      try {
        expect(sitz.view.state.doc.childCount).toBe(1);
        expect(sitz.view.state.doc.child(0).type.name).toBe('punkt');
        expect(sitz.view.state.doc.child(0).textContent).toBe('milk');
        expect(sitz.view.state.doc.textContent).toBe('milk');
        expect(speichere(sitz.view.state.doc)).toBe(fall.text);
        expect(mitKlasse(sitz.view.dom, fall.klasse).map((el) => el.textContent ?? '')).toEqual(fall.labels);
      } finally {
        await zu(sitz);
      }
    }

    const laeufe = [
      { roh: '1. eins\n9. zwei', text: '1. eins\n2. zwei', klasse: 'nummer', labels: ['', ''] },
      { roh: 'A. eins\nC. zwei', text: 'A. eins\nB. zwei', klasse: 'nummerart', labels: ['A.', 'B.'] },
      { roh: 'a. eins\nc. zwei', text: 'a. eins\nb. zwei', klasse: 'nummerart', labels: ['a.', 'b.'] },
      { roh: 'I. eins\nIII. zwei', text: 'I. eins\nII. zwei', klasse: 'nummerart', labels: ['I.', 'II.'] },
      { roh: 'i. eins\niv. zwei', text: 'i. eins\nii. zwei', klasse: 'nummerart', labels: ['i.', 'ii.'] },
    ];
    for (const fall of laeufe) {
      const sitz = await fuegeEin(fall.roh);
      try {
        expect(sitz.view.state.doc.child(0).textContent).toBe('eins');
        expect(sitz.view.state.doc.child(1).textContent).toBe('zwei');
        expect(speichere(sitz.view.state.doc)).toBe(fall.text);
        expect(mitKlasse(sitz.view.dom, fall.klasse).map((el) => el.textContent ?? '')).toEqual(fall.labels);
      } finally {
        await zu(sitz);
      }
    }
  });

  it('leaves a sentence, a bullet, a task and an untouched line as they are', async () => {
    const plain = await fuegeEin('Note. hallo\nSee. you\n- milk\n- [ ] open');
    try {
      expect(speichere(plain.view.state.doc)).toBe('Note. hallo\nSee. you\n- milk\n[] open');
      expect(plain.view.state.doc.child(0).type.name).toBe('absatz');
      expect(plain.view.state.doc.child(0).textContent).toBe('Note. hallo');
      expect(plain.view.state.doc.child(2).attrs.art).toBe('liste');
      expect(plain.view.state.doc.child(3).attrs.art).toBe('haken');
      expect(mitKlasse(plain.view.dom, 'nummerart')).toEqual([]);
    } finally {
      await zu(plain);
    }

    const sitz = await oeffne('keep', () => undefined);
    try {
      zwischenablage(sitz.view, ablage('A. milk'));
      expect(sitz.view.state.doc.child(0).textContent).toBe('keep');
      expect(sitz.view.state.doc.child(0).attrs.quelle).toBe('keep');
      expect(sitz.view.state.doc.child(1).textContent).toBe('milk');
      expect(speichere(sitz.view.state.doc)).toBe('keep\nA. milk');
    } finally {
      await zu(sitz);
    }
  });
});


describe('pasted markdown with html on the clipboard', () => {
  it('formats markdown from plain text when html still shows the markers', async () => {
    const probe = '# Titel\n**fett** und `code`\n- a\n1. b\nText danach';
    const html = '<div># Titel</div><div>**fett** und `code`</div><div>- a</div><div>1. b</div><div>Text danach</div>';
    const sitz = await oeffne('', () => undefined);
    try {
      zwischenablage(sitz.view, ablage(probe, html));
      const doc = sitz.view.state.doc;
      expect(speichere(doc)).toBe(probe);
      expect(doc.child(0).type.name).toBe('ueberschrift');
      expect(doc.child(0).textContent).toBe('Titel');
      expect(doc.child(1).textContent).toBe('fett und code');
      const marks: string[] = [];
      doc.child(1).descendants((node) => {
        for (const mark of node.marks) marks.push(mark.type.name);
      });
      expect(marks).toEqual(expect.arrayContaining(['fett', 'code']));
      expect(doc.child(2).attrs.art).toBe('liste');
      expect(doc.child(3).attrs.art).toBe('nummer');
      expect(doc.lastChild?.textContent).toBe('Text danach');
      expect(sitz.view.dom.textContent ?? '').not.toMatch(/\*\*|\# Titel/);
    } finally {
      await zu(sitz);
    }
  });

  it('keeps real html formatting when plain text has no markdown markers', async () => {
    const sitz = await oeffne('', () => undefined);
    try {
      zwischenablage(sitz.view, ablage('fett', '<p><strong>fett</strong></p>'));
      const marks: string[] = [];
      sitz.view.state.doc.descendants((node) => {
        for (const mark of node.marks) marks.push(mark.type.name);
      });
      expect(sitz.view.state.doc.textContent).toBe('fett');
      expect(marks).toContain('fett');
    } finally {
      await zu(sitz);
    }
  });

  it('formats markdown pasted into an existing line, including text after the caret', async () => {
    const sitz = await oeffne('Hallo Welt', () => undefined);
    try {
      const pos = 1 + 'Hallo '.length;
      sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(sitz.view.state.doc, pos)));
      zwischenablage(sitz.view, ablage('**fett**', '<p>**fett**</p>'));
      expect(speichere(sitz.view.state.doc)).toBe('Hallo **fett**Welt');
      expect(sitz.view.state.doc.child(0).textContent).toBe('Hallo fettWelt');
    } finally {
      await zu(sitz);
    }
  });
});
