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
import { entferneFormatierung } from '../../../../shared/features/format/modellbefehl.ts';
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
  zeige: (stand: number) => Promise<void>;
}

async function oeffne(
  text: string,
  onText: (wert: string) => void,
  extra?: { onLink?: () => void; onZiel?: () => void },
): Promise<Sitz> {
  const ref: { current: EditorView | null } = { current: null };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = wurzel(host);
  const zeichne = (stand: number) => createElement(
    'div',
    null,
    createElement(ModellEditor, { text, onText, onLink: extra?.onLink, ref }),
    createElement(Leiste, { view: ref.current, stand, modell: true, onZiel: extra?.onZiel }),
  );
  const zeige = async (stand: number) => {
    await act(async () => {
      root.render(zeichne(stand) as ReactNode);
    });
  };
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
  return { view, root, host, zeige };
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

function taste(view: EditorView, key: string, keyCode: number, shift = false): boolean {
  const ereignis = {
    type: 'keydown',
    key,
    code: `Key${key.toUpperCase()}`,
    keyCode,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: shift,
    defaultPrevented: false,
    cancelBubble: false,
    preventDefault() { ereignis.defaultPrevented = true; },
    stopPropagation() { ereignis.cancelBubble = true; },
  };
  view.dom.dispatchEvent(ereignis as unknown as Event);
  return ereignis.defaultPrevented;
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

function fundPos(view: EditorView, wort: string): number {
  let pos = -1;
  view.state.doc.descendants((node, start) => {
    if (pos >= 0 || !node.isText || !node.text) return;
    const index = node.text.indexOf(wort);
    if (index >= 0) pos = start + index;
  });
  if (pos < 0) throw new Error(`missing ${wort}`);
  return pos;
}

async function waehleWoerter(sitz: Sitz, vonWort: string, bisWort: string, stand: number): Promise<void> {
  const doc = sitz.view.state.doc;
  const von = fundPos(sitz.view, vonWort);
  const bis = fundPos(sitz.view, bisWort) + bisWort.length;
  await act(async () => {
    sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(doc, von, bis)));
  });
  await sitz.zeige(stand);
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

  it('lights inline buttons only when the whole selection has the format', async () => {
    const faelle = [
      [TEXTE.kursiv, ART.kursiv],
      [TEXTE.strich, 'strich'],
      [TEXTE.code, ART.code],
      [TEXTE.wichtigKnopf, ART.wichtig],
    ] as const;
    for (const [label, id] of faelle) {
      const sitz = await oeffne('aa bb', () => undefined);
      try {
        expect(gepresst(sitz.host, label)).toBe('false');
        await waehleWoerter(sitz, 'aa', 'aa', 2);
        await druecke(sitz.host, label);
        expect(markenVon(sitz.view, 'aa')).toContain(id);
        expect(gepresst(sitz.host, label)).toBe('true');
        expect(gepresst(sitz.host, label)).not.toBe('mixed');
        await waehleWoerter(sitz, 'aa', 'bb', 3);
        expect(gepresst(sitz.host, label)).toBe('false');
        await waehleWoerter(sitz, 'aa', 'aa', 4);
        expect(gepresst(sitz.host, label)).toBe('true');
        await druecke(sitz.host, label);
        expect(markenVon(sitz.view, 'aa')).not.toContain(id);
        expect(gepresst(sitz.host, label)).toBe('false');
        expect(sitz.view.state.doc.textContent).toBe('aa bb');
      } finally {
        await zu(sitz);
      }
    }
  });

  it('lights Heading for a heading line and not for a mixed line selection', async () => {
    const sitz = await oeffne('aa\nbb', () => undefined);
    try {
      expect(gepresst(sitz.host, TEXTE.ueberschrift)).toBe('false');
      await druecke(sitz.host, TEXTE.ueberschrift);
      expect(arten(sitz.view)).toEqual(['ueberschrift', 'ueberschrift']);
      expect(gepresst(sitz.host, TEXTE.ueberschrift)).toBe('true');
      await waehleWoerter(sitz, 'bb', 'bb', 2);
      await druecke(sitz.host, TEXTE.ueberschrift);
      await waehleWoerter(sitz, 'aa', 'bb', 3);
      expect(gepresst(sitz.host, TEXTE.ueberschrift)).toBe('false');
      await waehleWoerter(sitz, 'aa', 'aa', 4);
      expect(gepresst(sitz.host, TEXTE.ueberschrift)).toBe('true');
      expect(sitz.view.state.doc.textContent).toBe('aabb');
    } finally {
      await zu(sitz);
    }
  });

  it('lights Code for a whole code block and not for a mixed block selection', async () => {
    const sitz = await oeffne('aa\nbb\ncc', () => undefined);
    try {
      await waehleWoerter(sitz, 'aa', 'bb', 2);
      expect(gepresst(sitz.host, TEXTE.code)).toBe('false');
      await druecke(sitz.host, TEXTE.code);
      await waehleWoerter(sitz, 'aa', 'cc', 3);
      expect(gepresst(sitz.host, TEXTE.code)).toBe('false');
      expect(gepresst(sitz.host, TEXTE.code)).not.toBe('mixed');
      await waehleWoerter(sitz, 'aa', 'bb', 4);
      expect(gepresst(sitz.host, TEXTE.code)).toBe('true');
      expect(sitz.view.state.doc.textContent).toContain('aa');
      expect(sitz.view.state.doc.textContent).toContain('cc');
      for (const name of [TEXTE.fett, TEXTE.kursiv, TEXTE.strich, TEXTE.wichtigKnopf, TEXTE.link]) {
        expect(knopf(sitz.host, name).getAttribute('aria-disabled')).toBe('true');
      }
    } finally {
      await zu(sitz);
    }
  });

  it('lights Important for every selected important line and keeps a one-line selection inline', async () => {
    const sitz = await oeffne('aa\nbb', () => undefined);
    try {
      await druecke(sitz.host, TEXTE.wichtigKnopf);
      expect(arten(sitz.view)).toEqual(['wichtigZeile', 'wichtigZeile']);
      expect(gepresst(sitz.host, TEXTE.wichtigKnopf)).toBe('true');
      expect(sitz.view.state.doc.textContent).toBe('aabb');
    } finally {
      await zu(sitz);
    }
    const gemischt = await oeffne('!!!! aa\nbb', () => undefined);
    try {
      expect(gepresst(gemischt.host, TEXTE.wichtigKnopf)).toBe('false');
      await waehleWoerter(gemischt, 'aa', 'aa', 2);
      expect(gepresst(gemischt.host, TEXTE.wichtigKnopf)).toBe('false');
      await druecke(gemischt.host, TEXTE.wichtigKnopf);
      expect(markenVon(gemischt.view, 'aa')).toContain(ART.wichtig);
      expect(gemischt.view.state.doc.child(0).type.name).toBe('wichtigZeile');
      expect(gepresst(gemischt.host, TEXTE.wichtigKnopf)).toBe('true');
      expect(gemischt.view.state.doc.textContent).toContain('aa');
    } finally {
      await zu(gemischt);
    }
  });

  it('keeps bold, italic, strike, important, and link inert in a code block and enables them again', async () => {
    let links = 0;
    const sitz = await oeffne('aa\nbb\ncc', () => undefined, {
      onLink: () => { links += 1; },
      onZiel: () => { links += 1; },
    });
    const gesperrt = [TEXTE.fett, TEXTE.kursiv, TEXTE.strich, TEXTE.wichtigKnopf, TEXTE.link];
    try {
      expect(formatVon(ART.wichtig).knopf?.taste).toBeUndefined();
      await druecke(sitz.host, TEXTE.code);
      expect(arten(sitz.view).every((art) => art === 'codeblock')).toBe(true);
      const imCode = fundPos(sitz.view, 'aa') + 1;
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(sitz.view.state.doc, imCode)));
      });
      await sitz.zeige(2);
      const cursor = sitz.view.state;
      expect(cursor.selection.empty).toBe(true);
      expect(taste(sitz.view, 'b', 66)).toBe(true);
      expect(taste(sitz.view, 'k', 75)).toBe(true);
      expect(sitz.view.state).toBe(cursor);
      expect(sitz.view.state.storedMarks ?? []).toEqual([]);
      expect(links).toBe(0);
      await waehleWoerter(sitz, 'aa', 'cc', 3);
      const gewaehlt = sitz.view.state;
      expect(taste(sitz.view, 'b', 66)).toBe(true);
      expect(taste(sitz.view, 'i', 73)).toBe(true);
      expect(taste(sitz.view, 'x', 88, true)).toBe(true);
      expect(taste(sitz.view, 'k', 75)).toBe(true);
      expect(sitz.view.state).toBe(gewaehlt);
      expect(links).toBe(0);
      const dokument = speichere(sitz.view.state.doc);
      for (const name of gesperrt) {
        const el = knopf(sitz.host, name);
        expect(el.getAttribute('aria-disabled')).toBe('true');
        expect(el.hasAttribute('disabled')).toBe(false);
        expect(el.getAttribute('tabindex')).not.toBe('-1');
        el.focus();
        expect(el.ownerDocument?.activeElement).toBe(el);
        await druecke(sitz.host, name);
        expect(speichere(sitz.view.state.doc)).toBe(dokument);
      }
      expect(links).toBe(0);
      expect(knopf(sitz.host, TEXTE.code).getAttribute('aria-disabled')).not.toBe('true');
      expect(knopf(sitz.host, TEXTE.ueberschrift).getAttribute('aria-disabled')).not.toBe('true');
      expect(knopf(sitz.host, TEXTE.liste).getAttribute('aria-disabled')).not.toBe('true');
      expect(knopf(sitz.host, TEXTE.haken).getAttribute('aria-disabled')).not.toBe('true');
      const frei = entferneFormatierung(sitz.view.state);
      expect(frei).not.toBe(sitz.view.state);
      frei.doc.forEach((node) => expect(node.type.name).toBe('codeblock'));
      await druecke(sitz.host, TEXTE.code);
      expect(arten(sitz.view).every((art) => art === 'absatz')).toBe(true);
      expect(sitz.view.state.doc.textContent).toContain('aa');
      expect(sitz.view.state.doc.textContent).toContain('cc');
      await waehleWoerter(sitz, 'aa', 'cc', 4);
      for (const name of gesperrt) expect(knopf(sitz.host, name).hasAttribute('aria-disabled')).toBe(false);
      await druecke(sitz.host, TEXTE.fett);
      expect(speichere(sitz.view.state.doc)).toContain('**');
      expect(sitz.view.state.doc.textContent).toContain('aa');
    } finally {
      await zu(sitz);
    }
  });
});
