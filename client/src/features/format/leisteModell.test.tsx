import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Mark } from 'prosemirror-model';
import type { Root } from 'react-dom/client';
import { ART } from '../../../../shared/features/format/baum.ts';
import { NUMMER_KNOPF } from '../../../../shared/features/format/nummer.ts';
import { formatVon, leistenEintraege } from '../../../../shared/features/format/register.ts';
import { speichere } from '../../../../shared/features/format/speichern.ts';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import { Leiste } from './Leiste.tsx';
import { ModellEditor } from './ModellEditor.tsx';
import { wendeModell } from './modellLauf.ts';
import { entfernePruefDom, richtePruefDom } from './modellPruef.ts';

let wurzel: (container: Element) => Root;

beforeAll(async () => {
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
  const zeichne = (stand: number) => createElement(
    'div',
    null,
    createElement(ModellEditor, { text, onText, ref }),
    createElement(Leiste, { view: ref.current, stand, modell: true }),
  );
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
  return { view, root, host };
}

async function zu(sitz: Sitz) {
  await act(async () => {
    sitz.root.unmount();
  });
  sitz.host.remove();
}

function knopf(host: HTMLElement, label: string): HTMLElement {
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

function gepresst(host: HTMLElement, label: string): string | null {
  return knopf(host, label).getAttribute('aria-pressed');
}

async function druecke(host: HTMLElement, label: string) {
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

function markenVon(view: EditorView, text: string): string[] {
  let marks: readonly Mark[] = [];
  view.state.doc.descendants((node) => {
    if (node.isText && node.text === text) marks = node.marks;
  });
  return marks.map((mark) => mark.type.name);
}

function arten(view: EditorView): string[] {
  const aus: string[] = [];
  view.state.doc.forEach((node) => {
    aus.push(node.type.name === 'punkt' ? String(node.attrs.art) : node.type.name);
  });
  return aus;
}

describe('format bar on the model editor', () => {
  it('bolds a mixed selection from the button and clears it on the second press', async () => {
    const meldungen: string[] = [];
    const sitz = await oeffne('**a**\n**b**\n**c** d **e**', (wert) => meldungen.push(wert));
    try {
      const namen = leistenEintraege().map((eintrag) => eintrag.knopf.beschriftung);
      const gesehen: string[] = [];
      const lauf = (knoten: Node) => {
        if (knoten.nodeType === 1 && (knoten as HTMLElement).getAttribute('role') === 'toolbar') {
          knoten.childNodes.forEach((kind) => {
            if (kind.nodeType === 1) gesehen.push((kind as HTMLElement).getAttribute('aria-label') ?? '');
          });
        }
        knoten.childNodes.forEach(lauf);
      };
      lauf(sitz.host);
      expect(gesehen).toEqual([...namen, ...NUMMER_KNOPF.map((eintrag) => TEXTE[eintrag.text])]);
      expect(gepresst(sitz.host, TEXTE.fett)).toBe('false');
      await druecke(sitz.host, TEXTE.fett);
      expect(speichere(sitz.view.state.doc)).toBe('**a**\n**b**\n**c d e**');
      expect(gepresst(sitz.host, TEXTE.fett)).toBe('true');
      expect(meldungen).toEqual(['**a**\n**b**\n**c d e**']);
      await druecke(sitz.host, TEXTE.fett);
      expect(speichere(sitz.view.state.doc)).toBe('a\nb\nc d e');
      expect(gepresst(sitz.host, TEXTE.fett)).toBe('false');
      expect(meldungen).toEqual(['**a**\n**b**\n**c d e**', 'a\nb\nc d e']);
    } finally {
      await zu(sitz);
    }
  });

  it('turns bold on for the next typed text and off again without changing the word', async () => {
    const sitz = await oeffne('eins ', () => undefined);
    try {
      const ende = TextSelection.atEnd(sitz.view.state.doc);
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.setSelection(ende));
      });
      expect(sitz.view.state.selection.empty).toBe(true);
      expect(gepresst(sitz.host, TEXTE.fett)).toBe('false');
      await druecke(sitz.host, TEXTE.fett);
      expect(sitz.view.state.storedMarks?.map((mark) => mark.type.name)).toEqual([ART.fett]);
      expect(speichere(sitz.view.state.doc)).toBe('eins ');
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.insertText('zwei'));
      });
      expect(markenVon(sitz.view, 'zwei')).toEqual([ART.fett]);
      const aus = formatVon(ART.fett).modell;
      await act(async () => {
        wendeModell(sitz.view, aus);
      });
      expect(sitz.view.state.storedMarks ?? []).toEqual([]);
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.insertText('x'));
      });
      expect(markenVon(sitz.view, 'zwei')).toEqual([ART.fett]);
      expect(markenVon(sitz.view, 'x')).toEqual([]);
    } finally {
      await zu(sitz);
    }
  });

  it('keeps an exclusive code mark across composition until the button turns it off', async () => {
    const sitz = await oeffne('eins ', () => undefined);
    try {
      const ende = TextSelection.atEnd(sitz.view.state.doc);
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.setSelection(ende));
      });
      await druecke(sitz.host, TEXTE.code);
      expect(sitz.view.state.storedMarks?.map((mark) => mark.type.name)).toEqual([ART.code]);
      const start = sitz.view.state.selection.from;
      for (const stueck of ['z', 'zw', 'zwe', 'zwei']) {
        await act(async () => {
          const bis = sitz.view.state.selection.from;
          const text = sitz.view.state.schema.text(stueck);
          sitz.view.dispatch(sitz.view.state.tr.replaceWith(start, bis, text));
        });
      }
      const treffer: string[] = [];
      sitz.view.state.doc.descendants((node) => {
        if (node.isText && node.text?.includes('zwei')) treffer.push(node.text);
      });
      expect(treffer).toEqual(['zwei']);
      expect(markenVon(sitz.view, 'zwei')).toEqual([ART.code]);
      expect(sitz.view.state.storedMarks?.map((mark) => mark.type.name)).toEqual([ART.code]);
      const aus = formatVon(ART.code).modell;
      await act(async () => {
        wendeModell(sitz.view, aus);
      });
      expect(sitz.view.state.storedMarks ?? []).toEqual([]);
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.insertText('x'));
      });
      expect(markenVon(sitz.view, 'zwei')).toEqual([ART.code]);
      expect(markenVon(sitz.view, 'x')).toEqual([]);
    } finally {
      await zu(sitz);
    }
  });

  it('turns a checklist on, off, and on again as one block type', async () => {
    const sitz = await oeffne('a\nb', () => undefined);
    try {
      await druecke(sitz.host, TEXTE.haken);
      expect(speichere(sitz.view.state.doc)).toBe('[] a\n[] b');
      expect(arten(sitz.view)).toEqual([ART.haken, ART.haken]);
      expect(gepresst(sitz.host, TEXTE.haken)).toBe('true');
      await druecke(sitz.host, TEXTE.haken);
      expect(speichere(sitz.view.state.doc)).toBe('a\nb');
      expect(arten(sitz.view)).toEqual(['absatz', 'absatz']);
      expect(gepresst(sitz.host, TEXTE.haken)).toBe('false');
      await druecke(sitz.host, TEXTE.haken);
      expect(speichere(sitz.view.state.doc)).toBe('[] a\n[] b');
      expect(arten(sitz.view)).toEqual([ART.haken, ART.haken]);
      expect(gepresst(sitz.host, TEXTE.haken)).toBe('true');
    } finally {
      await zu(sitz);
    }
  });

  it('replaces the list kind on every selected line', async () => {
    const sitz = await oeffne('a\nb', () => undefined);
    try {
      await druecke(sitz.host, TEXTE.liste);
      expect(speichere(sitz.view.state.doc)).toBe('- a\n- b');
      expect(arten(sitz.view)).toEqual([ART.liste, ART.liste]);
      expect(gepresst(sitz.host, TEXTE.liste)).toBe('true');
      expect(gepresst(sitz.host, TEXTE.haken)).toBe('false');
      await druecke(sitz.host, TEXTE.haken);
      expect(speichere(sitz.view.state.doc)).toBe('[] a\n[] b');
      expect(arten(sitz.view)).toEqual([ART.haken, ART.haken]);
      expect(gepresst(sitz.host, TEXTE.haken)).toBe('true');
      expect(gepresst(sitz.host, TEXTE.liste)).toBe('false');
      await druecke(sitz.host, TEXTE.liste);
      expect(speichere(sitz.view.state.doc)).toBe('- a\n- b');
      expect(arten(sitz.view)).toEqual([ART.liste, ART.liste]);
      await druecke(sitz.host, TEXTE.liste);
      expect(speichere(sitz.view.state.doc)).toBe('a\nb');
      expect(arten(sitz.view)).toEqual(['absatz', 'absatz']);
      expect(gepresst(sitz.host, TEXTE.liste)).toBe('false');
      expect(gepresst(sitz.host, TEXTE.haken)).toBe('false');
    } finally {
      await zu(sitz);
    }
  });

  it('replaces the list marker from the number buttons', async () => {
    const sitz = await oeffne('1. milk', () => undefined);
    try {
      await druecke(sitz.host, TEXTE.nummerGross);
      expect(sitz.view.state.doc.textContent).toBe('milk');
      expect(speichere(sitz.view.state.doc)).toBe('A. milk');
      expect(gepresst(sitz.host, TEXTE.nummerGross)).toBe('true');
      expect(gepresst(sitz.host, TEXTE.nummerZahl)).toBe('false');
      expect(gepresst(sitz.host, TEXTE.liste)).toBe('false');
      await druecke(sitz.host, TEXTE.liste);
      expect(sitz.view.state.doc.textContent).toBe('milk');
      expect(speichere(sitz.view.state.doc)).toBe('- milk');
      expect(gepresst(sitz.host, TEXTE.liste)).toBe('true');
      expect(gepresst(sitz.host, TEXTE.nummerGross)).toBe('false');
      await druecke(sitz.host, TEXTE.nummerRoemisch);
      expect(speichere(sitz.view.state.doc)).toBe('I. milk');
      expect(sitz.view.state.doc.textContent).toBe('milk');
      await druecke(sitz.host, TEXTE.haken);
      expect(speichere(sitz.view.state.doc)).toBe('[] milk');
      await druecke(sitz.host, TEXTE.nummerKlein);
      expect(speichere(sitz.view.state.doc)).toBe('a. milk');
      await druecke(sitz.host, TEXTE.nummerKlein);
      expect(speichere(sitz.view.state.doc)).toBe('milk');
      expect(gepresst(sitz.host, TEXTE.nummerKlein)).toBe('false');
      expect(gepresst(sitz.host, TEXTE.haken)).toBe('false');
    } finally {
      await zu(sitz);
    }
  });
});
