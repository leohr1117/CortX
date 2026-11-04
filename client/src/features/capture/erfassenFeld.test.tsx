import { act, createElement, useState, type ReactNode } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Root } from 'react-dom/client';
import type { Thema } from '../../../../shared/kern/modell.ts';
import { posFuer } from '../../../../shared/features/format/stelle.ts';
import { planeAblage } from '../../../../shared/features/seiten/pfad.ts';
import { setzeVorschlag, zielAmCursor } from '../../../../shared/features/seiten/zielvorschlag.ts';
import { entfernePruefDom, richtePruefDom } from '../format/modellPruef.ts';
import { ErfassenFeld } from './ErfassenFeld.tsx';
import { setzeErfassenText } from './erfassenBefehl.ts';
import { hatUeberschrift, textAusDokument } from './erfassenDokument.ts';

const speicher = vi.hoisted(() => ({ text: '', schrieb: [] as string[] }));

vi.mock('../offline/index.ts', () => ({
  liesEntwurf: () => Promise.resolve(speicher.text),
  schreibEntwurf: (text: string) => {
    speicher.schrieb.push(text);
    return Promise.resolve();
  },
}));

const themen: Thema[] = [
  { name: 'Science', count: 9 },
  { name: 'School', count: 4 },
  { name: 'Work', count: 14 },
  { name: 'Workout', count: 6 },
  { name: 'Home', count: 2 },
];

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

beforeEach(() => {
  speicher.text = '';
  speicher.schrieb = [];
});

interface Stand {
  text: string;
  view: EditorView | null;
  setze: (text: string) => void;
}

function Halt({
  start,
  onAblegen,
  platzhalter,
  stand,
}: {
  start: string;
  onAblegen?: (text: string) => void;
  platzhalter?: string;
  stand: Stand;
}) {
  const [text, setText] = useState(start);
  stand.text = text;
  stand.setze = (wert: string) => {
    setText(wert);
  };
  return createElement(ErfassenFeld, {
    text,
    themen,
    platzhalter,
    onAblegen,
    onText: (wert: string) => {
      stand.text = wert;
      setText(wert);
    },
    ref: (view) => {
      stand.view = view;
    },
  });
}

async function oeffne(start = '', onAblegen?: (text: string) => void, platzhalter?: string) {
  const stand: Stand = { text: start, view: null, setze: () => undefined };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = wurzel(host);
  await act(async () => {
    root.render(createElement(Halt, { start, onAblegen, platzhalter, stand }) as ReactNode);
  });
  await act(async () => {
    await Promise.resolve();
  });
  if (!stand.view) throw new Error('missing editor');
  return { stand, root, host };
}

async function zu(sitz: { root: Root; host: HTMLElement }) {
  await act(async () => {
    sitz.root.unmount();
  });
  sitz.host.remove();
}

async function tippe(view: EditorView, text: string) {
  for (const zeichen of text) {
    await act(async () => {
      const { from, to } = view.state.selection;
      view.dispatch(view.state.tr.insertText(zeichen, from, to));
    });
  }
}

async function druck(view: EditorView, key: string, extra: { ctrl?: boolean; meta?: boolean } = {}) {
  await act(async () => {
    const ereignis = {
      type: 'keydown',
      key,
      code: key,
      keyCode: key === 'Enter' ? 13 : 0,
      ctrlKey: extra.ctrl === true,
      metaKey: extra.meta === true,
      altKey: false,
      shiftKey: false,
      isComposing: false,
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

function elemente(knoten: Node): HTMLElement[] {
  const aus: HTMLElement[] = [];
  const lauf = (aktuell: Node) => {
    if (aktuell.nodeType === 1) aus.push(aktuell as HTMLElement);
    for (const kind of [...aktuell.childNodes]) lauf(kind);
  };
  lauf(knoten);
  return aus;
}

function optionen(): HTMLElement[] {
  return elemente(document.body).filter((el) => el.getAttribute('role') === 'option');
}

function setzeHandy(an: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: an,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  })) as unknown as typeof window.matchMedia;
}

describe('capture field', () => {
  it('files the same bytes as the plain text field for the same typing', async () => {
    const proben = ['Buy milk', '#school/Seite', '#tag', '# ', '#thema/seite', 'Remember #wo\nnoch #tag'];
    for (const probe of proben) {
      const sitz = await oeffne();
      await tippe(sitz.stand.view!, probe);
      expect(sitz.stand.text).toBe(probe);
      expect(textAusDokument(sitz.stand.view!.state.doc)).toBe(probe);
      expect(hatUeberschrift(sitz.stand.view!.state.doc)).toBe(false);
      await zu(sitz);
    }
  });

  it('keeps target lines and hash tags as text when the text is loaded', async () => {
    const probe = '#thema/seite\n#tag\n# Title';
    const sitz = await oeffne();
    await act(async () => {
      sitz.stand.setze(probe);
    });
    const view = sitz.stand.view!;
    expect(hatUeberschrift(view.state.doc)).toBe(false);
    expect(textAusDokument(view.state.doc)).toBe(probe);
    expect(view.state.doc.child(0).type.name).toBe('absatz');
    expect(view.state.doc.child(0).textContent).toBe('#thema/seite');
    expect(view.state.doc.child(1).textContent).toBe('#tag');
    expect(view.state.doc.child(2).type.name).toBe('absatz');
    expect(view.state.doc.child(2).textContent).toBe('# Title');
    expect(view.state.selection.head).toBe(posFuer(view.state.doc, probe, probe.length));
    expect(view.state.selection.head).toBe(TextSelection.atEnd(view.state.doc).from);
    await zu(sitz);
  });

  it('shows #sc suggestions in the same order as the plain text field, new row last', async () => {
    const sitz = await oeffne();
    await tippe(sitz.stand.view!, '#sc');
    const erwartet = zielAmCursor('#sc', '#sc'.length, themen);
    const liste = erwartet?.liste;
    if (!liste) throw new Error('missing suggestions');
    const knoten = optionen();
    expect(knoten.map((eintrag) => eintrag.textContent)).toEqual([
      ...liste.treffer.map((eintrag) => `${eintrag.name}${eintrag.zahl ?? ''}`),
      liste.neuText,
    ]);
    expect(liste.treffer.map((eintrag) => eintrag.name)).toEqual(['Science', 'School']);
    expect(knoten[0]?.getAttribute('aria-selected')).toBe('true');
    expect(knoten[knoten.length - 1]?.className).toContain('neu');
    expect(knoten[knoten.length - 1]?.parentNode && (knoten[knoten.length - 1]!.parentNode as HTMLElement).className).toContain(
      'neu-fest',
    );
    await druck(sitz.stand.view!, 'ArrowDown');
    await druck(sitz.stand.view!, 'Enter');
    const neu = setzeVorschlag('#sc', '#sc'.length, liste.treffer[1]?.einsetzen ?? '');
    expect(sitz.stand.text).toBe(neu?.text);
    expect(optionen()).toHaveLength(0);
    await zu(sitz);
  });

  it('files on ctrl or cmd enter and does not file on enter, including a phone keyboard', async () => {
    const abgelegt: string[] = [];
    const sitz = await oeffne('', (text) => {
      abgelegt.push(text);
    });
    await tippe(sitz.stand.view!, 'Buy milk');
    await druck(sitz.stand.view!, 'Enter');
    expect(abgelegt).toEqual([]);
    expect(sitz.stand.text).toBe('Buy milk\n');
    await druck(sitz.stand.view!, 'Enter', { ctrl: true });
    expect(abgelegt).toEqual(['Buy milk\n']);
    expect(sitz.stand.text).toBe('Buy milk\n');
    await druck(sitz.stand.view!, 'Enter', { meta: true });
    expect(abgelegt).toEqual(['Buy milk\n', 'Buy milk\n']);
    await zu(sitz);

    const handyAblage: string[] = [];
    setzeHandy(true);
    const handy = await oeffne('', (text) => {
      handyAblage.push(text);
    });
    try {
      await tippe(handy.stand.view!, '#sc');
      await druck(handy.stand.view!, 'Enter');
      expect(handyAblage).toEqual([]);
      expect(handy.stand.text).toBe('#sc\n');
      expect(hatUeberschrift(handy.stand.view!.state.doc)).toBe(false);
    } finally {
      setzeHandy(false);
      await zu(handy);
    }
  });

  it('reads and writes the offline draft', async () => {
    speicher.text = '#school/Seite';
    const sitz = await oeffne();
    expect(sitz.stand.text).toBe('#school/Seite');
    expect(textAusDokument(sitz.stand.view!.state.doc)).toBe('#school/Seite');
    expect(sitz.stand.view!.state.selection.head).toBe(TextSelection.atEnd(sitz.stand.view!.state.doc).from);
    expect(speicher.schrieb.at(-1)).toBe('#school/Seite');
    await tippe(sitz.stand.view!, '!');
    expect(sitz.stand.text).toBe('#school/Seite!');
    expect(speicher.schrieb.at(-1)).toBe('#school/Seite!');
    await zu(sitz);
  });

  it('wraps a typed word marker and leaves a hash tag literal', async () => {
    const sitz = await oeffne();
    await tippe(sitz.stand.view!, 'hello**');
    await act(async () => {
      await Promise.resolve();
    });
    expect(sitz.stand.text).toBe('**hello**');
    expect(textAusDokument(sitz.stand.view!.state.doc)).toBe('**hello**');
    await zu(sitz);

    const hash = await oeffne();
    await tippe(hash.stand.view!, '#tag**');
    await act(async () => {
      await Promise.resolve();
    });
    expect(hash.stand.text).toBe('#tag**');
    await zu(hash);
  });

  it('shows a formatted word with hidden markers and keeps the source', async () => {
    const sitz = await oeffne();
    const view = sitz.stand.view!;
    await act(async () => {
      setzeErfassenText(view, '**Hi**', 3, 3);
    });
    expect(textAusDokument(view.state.doc)).toBe('**Hi**');
    const fett = elemente(view.dom).filter((el) => el.classList.contains('cm-fett'));
    expect(fett.map((el) => el.textContent)).toContain('Hi');
    expect(elemente(view.dom).filter((el) => el.classList.contains('cm-marker-weg'))).toHaveLength(2);
    const quelle = '***~~!!`Hi`!!~~***';
    const stelle = quelle.indexOf('Hi') + 1;
    await act(async () => {
      setzeErfassenText(view, quelle, stelle, stelle);
    });
    expect(textAusDokument(view.state.doc)).toBe(quelle);
    const verschachtelt = elemente(view.dom).filter((el) =>
      ['cm-fett', 'cm-kursiv', 'cm-strich', 'cm-wichtig', 'cm-code'].every((name) => el.classList.contains(name)),
    );
    expect(verschachtelt.map((el) => el.textContent)).toContain('Hi');
    await zu(sitz);
  });

  it('draws the empty hint inside the field', async () => {
    const sitz = await oeffne('', undefined, 'Start typing\u2026');
    const hinweis = elemente(sitz.stand.view!.dom).find((el) => el.classList.contains('cm-placeholder'));
    expect(hinweis?.textContent).toBe('Start typing\u2026');
    let ahne: Node | null = hinweis ?? null;
    let imFeld = false;
    while (ahne) {
      if (ahne.nodeType === 1 && (ahne as HTMLElement).classList.contains('cm-editor')) imFeld = true;
      ahne = ahne.parentNode;
    }
    expect(imFeld).toBe(true);
    await zu(sitz);
  });

  it('formats pasted markdown and keeps a target line', async () => {
    const sitz = await oeffne();
    const view = sitz.stand.view!;
    const probe = '**x**\n- a\n#thema/seite\n#tag';
    await act(async () => {
      const werte = new Map<string, string>([['text/plain', probe]]);
      const ereignis = {
        type: 'paste',
        clipboardData: { getData: (art: string) => werte.get(art) ?? '' },
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopPropagation() {},
      };
      view.dom.dispatchEvent(ereignis as unknown as Event);
    });
    expect(textAusDokument(view.state.doc)).toBe(probe);
    expect(sitz.stand.text).toBe(probe);
    expect(hatUeberschrift(view.state.doc)).toBe(false);
    expect(view.state.doc.child(2).type.name).toBe('absatz');
    expect(view.state.doc.child(2).textContent).toBe('#thema/seite');
    expect(view.state.doc.child(3).textContent).toBe('#tag');
    const knoten = elemente(view.dom);
    const weg = knoten.filter((el) => el.classList.contains('cm-marker-weg')).map((el) => el.textContent);
    expect(knoten.filter((el) => el.classList.contains('cm-fett')).map((el) => el.textContent)).toContain('x');
    expect(weg).toContain('**');
    expect(weg).toContain('- ');
    expect(weg.every((text) => !text?.includes('#'))).toBe(true);
    expect(knoten.some((el) => el.classList.contains('cm-punkt') && el.textContent === '\u2022 ')).toBe(true);
    const plan = planeAblage(textAusDokument(view.state.doc), themen);
    expect(plan?.ungueltig).toBe(false);
    expect(plan?.ziele[1]).toMatchObject({ topicName: 'thema', seite: 'seite', text: '' });
    expect(plan?.ziele[2]).toMatchObject({ topicName: 'tag', seite: null, text: '' });
    await zu(sitz);
  });

  it('continues a list on enter and keeps a plain enter as a new line', async () => {
    const liste = await oeffne();
    await tippe(liste.stand.view!, '- milk');
    await druck(liste.stand.view!, 'Enter');
    expect(liste.stand.text).toBe('- milk\n- ');
    expect(hatUeberschrift(liste.stand.view!.state.doc)).toBe(false);
    await zu(liste);
  });
});
