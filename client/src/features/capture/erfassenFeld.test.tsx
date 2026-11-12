import { act, createElement, useState, type ReactNode } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Root } from 'react-dom/client';
import type { Thema } from '../../../../shared/kern/modell.ts';
import type { Node as PmNode } from 'prosemirror-model';
import { packeDokument } from '../../../../shared/features/format/dokument.ts';
import { importiere } from '../../../../shared/features/format/md.ts';
import { posFuer } from '../../../../shared/features/format/stelle.ts';
import { speichere } from '../../../../shared/features/format/speichern.ts';
import { planeAblage } from '../../../../shared/features/seiten/pfad.ts';
import { setzeVorschlag, zielAmCursor } from '../../../../shared/features/seiten/zielvorschlag.ts';
import { klartextVon } from '../format/modellHaken.ts';
import { entfernePruefDom, richtePruefDom } from '../format/modellPruef.ts';
import { ErfassenFeld } from './ErfassenFeld.tsx';

function hatKopf(doc: PmNode): boolean {
  let gefunden = false;
  doc.descendants((knoten) => {
    if (knoten.type.name === 'ueberschrift') gefunden = true;
  });
  return gefunden;
}

const speicher = vi.hoisted(() => ({ roh: '' as unknown, schrieb: [] as unknown[] }));

vi.mock('../offline/index.ts', () => ({
  liesEntwurf: () => Promise.resolve(speicher.roh),
  schreibEntwurf: (doc: unknown) => {
    speicher.schrieb.push(doc);
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
  speicher.roh = '';
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
      const behandelt = view.someProp('handleTextInput', (fn) => fn(view, from, to, zeichen, () => view.state.tr) === true);
      if (!behandelt) view.dispatch(view.state.tr.insertText(zeichen));
    });
  }
}

async function druck(view: EditorView, key: string, extra: { ctrl?: boolean; meta?: boolean } = {}) {
  await act(async () => {
    const ereignis = {
      type: 'keydown',
      key,
      code: key,
      keyCode: key === 'Enter' ? 13 : key === 'Backspace' ? 8 : 0,
      ctrlKey: extra.ctrl === true,
      metaKey: extra.meta === true,
      altKey: false,
      shiftKey: false,
      isComposing: false,
      defaultPrevented: false,
      cancelBubble: false,
      sofort: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.cancelBubble = true;
      },
      stopImmediatePropagation() {
        this.sofort = true;
      },
    };
    view.dom.dispatchEvent(ereignis as unknown as Event);
  });
}

function erstesElement(knoten: globalThis.Node | null | undefined): HTMLElement | null {
  if (!knoten) return null;
  for (const kind of [...knoten.childNodes]) {
    if (kind.nodeType === 1) return kind as HTMLElement;
  }
  return null;
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
    const proben = ['Buy milk', '#school/Seite', '#tag', '#thema/seite', 'Remember #wo\nnoch #tag'];
    for (const probe of proben) {
      const sitz = await oeffne();
      await tippe(sitz.stand.view!, probe);
      expect(sitz.stand.text).toBe(probe);
      expect(speichere(sitz.stand.view!.state.doc)).toBe(probe);
      expect(klartextVon(sitz.stand.view!.state.doc)).toBe(probe);
      expect(hatKopf(sitz.stand.view!.state.doc)).toBe(false);
      await zu(sitz);
    }
    const kopf = await oeffne();
    await tippe(kopf.stand.view!, '# ');
    expect(kopf.stand.text).toBe('# ');
    expect(hatKopf(kopf.stand.view!.state.doc)).toBe(true);
    expect(klartextVon(kopf.stand.view!.state.doc)).toBe('');
    await zu(kopf);
  });

  it('keeps target lines and hash tags as text when the text is loaded', async () => {
    const probe = '#thema/seite\n#tag\n# Title';
    const sitz = await oeffne();
    await act(async () => {
      sitz.stand.setze(probe);
    });
    const view = sitz.stand.view!;
    expect(speichere(view.state.doc)).toBe(probe);
    expect(hatKopf(view.state.doc)).toBe(true);
    expect(view.state.doc.child(0).type.name).toBe('absatz');
    expect(view.state.doc.child(0).textContent).toBe('#thema/seite');
    expect(view.state.doc.child(1).textContent).toBe('#tag');
    expect(view.state.doc.child(2).type.name).toBe('ueberschrift');
    expect(view.state.doc.child(2).textContent).toBe('Title');
    expect(klartextVon(view.state.doc)).toBe('#thema/seite\n#tag\nTitle');
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
      expect(hatKopf(handy.stand.view!.state.doc)).toBe(false);
    } finally {
      setzeHandy(false);
      await zu(handy);
    }
  });

  it('reads and writes the offline draft', async () => {
    const doc = packeDokument(importiere('#school/Seite'));
    speicher.roh = doc;
    const sitz = await oeffne();
    expect(sitz.stand.text).toBe('#school/Seite');
    expect(speichere(sitz.stand.view!.state.doc)).toBe('#school/Seite');
    expect(klartextVon(sitz.stand.view!.state.doc)).toBe('#school/Seite');
    expect(sitz.stand.view!.state.selection.head).toBe(TextSelection.atEnd(sitz.stand.view!.state.doc).from);
    expect(speicher.schrieb.at(-1)).toEqual(packeDokument(sitz.stand.view!.state.doc));
    await tippe(sitz.stand.view!, '!');
    expect(sitz.stand.text).toBe('#school/Seite!');
    expect(speicher.schrieb.at(-1)).toEqual(packeDokument(sitz.stand.view!.state.doc));
    await zu(sitz);
  });

  it('wraps a typed word marker and leaves a hash tag literal', async () => {
    const sitz = await oeffne();
    await tippe(sitz.stand.view!, '**hello**');
    await act(async () => {
      await Promise.resolve();
    });
    expect(sitz.stand.text).toBe('**hello**');
    expect(klartextVon(sitz.stand.view!.state.doc)).toBe('hello');
    expect(elemente(sitz.stand.view!.dom).some((el) => el.classList.contains('cm-fett') && el.textContent === 'hello')).toBe(true);
    await zu(sitz);

    const hash = await oeffne();
    await tippe(hash.stand.view!, '#tag**');
    await act(async () => {
      await Promise.resolve();
    });
    expect(hash.stand.text).toBe('#tag**');
    await zu(hash);
  });

  it('shows a formatted word as marks and keeps the source', async () => {
    const sitz = await oeffne();
    await act(async () => {
      sitz.stand.setze('**Hi**');
    });
    const view = sitz.stand.view!;
    expect(speichere(view.state.doc)).toBe('**Hi**');
    expect(klartextVon(view.state.doc)).toBe('Hi');
    const fett = elemente(view.dom).filter((el) => el.classList.contains('cm-fett'));
    expect(fett.map((el) => el.textContent)).toContain('Hi');
    expect(view.dom.textContent ?? '').not.toContain('*');
    const quelle = '***~~!!`Hi`!!~~***';
    await act(async () => {
      sitz.stand.setze(quelle);
    });
    expect(speichere(view.state.doc)).toBe(quelle);
    expect(klartextVon(view.state.doc)).toBe('Hi');
    const verschachtelt = elemente(view.dom).filter((el) =>
      ['cm-fett', 'cm-kursiv', 'cm-strich', 'cm-wichtig', 'cm-code'].every((name) => el.classList.contains(name)),
    );
    expect(verschachtelt.map((el) => el.textContent)).toContain('Hi');
    expect(view.dom.textContent ?? '').toBe('Hi');
    await zu(sitz);
  });

  it('draws the empty hint inside the field', async () => {
    const sitz = await oeffne('', undefined, 'Start typing\u2026');
    const view = sitz.stand.view!;
    let lauf: globalThis.Node | null = view.dom;
    let schreib: HTMLElement | null = null;
    while (lauf) {
      if (lauf.nodeType === 1 && (lauf as HTMLElement).classList.contains('schreib')) schreib = lauf as HTMLElement;
      lauf = lauf.parentNode;
    }
    const halter = elemente(view.dom).find((el) => el.getAttribute('data-zeile') === 'platz');
    expect(halter?.style.pointerEvents).toBe('none');
    expect(halter?.style.position).toBe('absolute');
    expect(halter?.classList.contains('cm-placeholder')).toBe(false);
    expect(halter?.textContent ?? '').not.toContain('Start typing');
    expect(view.dom.contains(halter ?? null)).toBe(true);
    const sichtbar = schreib
      ? elemente(schreib).find((el) => el.classList.contains('cm-placeholder'))
      : undefined;
    expect(sichtbar?.textContent).toBe('Start typing\u2026');
    expect(schreib?.contains(sichtbar ?? null)).toBe(true);
    expect(view.dom.contains(sichtbar ?? null)).toBe(false);
    await zu(sitz);
  });

  it('marks the tag at the caret', async () => {
    const sitz = await oeffne();
    await act(async () => {
      sitz.stand.setze('Call #wo');
    });
    const marke = elemente(sitz.stand.view!.dom).find((el) => el.classList.contains('hier'));
    expect(marke?.classList.contains('tag')).toBe(true);
    expect(marke?.textContent).toBe('#wo');
    await zu(sitz);
  });

  it('keeps a single space after a typed checkbox shortcut', async () => {
    const sitz = await oeffne();
    await tippe(sitz.stand.view!, '[ ] milch');
    expect(speichere(sitz.stand.view!.state.doc)).toBe('[] milch');
    expect(klartextVon(sitz.stand.view!.state.doc)).toBe('milch');
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
    expect(speichere(view.state.doc)).toBe(probe);
    expect(sitz.stand.text).toBe(probe);
    expect(hatKopf(view.state.doc)).toBe(false);
    expect(klartextVon(view.state.doc)).toBe('x\na\n#thema/seite\n#tag');
    const kinder = Array.from({ length: view.state.doc.childCount }, (_, index) => view.state.doc.child(index));
    const zielZeile = kinder.find((knoten) => knoten.textContent === '#thema/seite');
    const tagZeile = kinder.find((knoten) => knoten.textContent === '#tag');
    expect(zielZeile?.type.name).toBe('absatz');
    expect(tagZeile?.type.name).toBe('absatz');
    const knoten = elemente(view.dom);
    expect(view.dom.textContent ?? '').not.toContain('*');
    expect(knoten.filter((el) => el.classList.contains('cm-fett')).map((el) => el.textContent)).toContain('x');
    const punktZeile = knoten.find((el) => el.classList.contains('cm-punkt') && el.textContent === 'a');
    expect(erstesElement(punktZeile ?? null)?.classList.contains('cm-marker')).toBe(true);
    const plan = planeAblage(speichere(view.state.doc), themen);
    expect(plan?.ungueltig).toBe(false);
    expect(plan?.ziele[1]).toMatchObject({ topicName: 'thema', seite: 'seite', text: '' });
    expect(plan?.ziele[2]).toMatchObject({ topicName: 'tag', seite: null, text: '' });
    await zu(sitz);
  });

  it('gives a decimal marker the list column and leaves a letter line as typed', async () => {
    const sitz = await oeffne();
    const view = sitz.stand.view!;
    const probe = '1. milk\nA. tea\n[] task';
    await act(async () => {
      sitz.stand.setze(probe);
    });
    expect(speichere(view.state.doc)).toBe(probe);
    expect(klartextVon(view.state.doc)).toBe('milk\nA. tea\ntask');
    const knoten = elemente(view.dom);
    const zahlZeile = knoten.find((el) => el.classList.contains('cm-nummer'));
    const zahl = zahlZeile ? elemente(zahlZeile).find((el) => el.classList.contains('cm-marker')) : undefined;
    expect(zahlZeile?.tagName).toBe('DIV');
    expect(zahl?.classList.contains('nummer')).toBe(true);
    expect(erstesElement(zahlZeile ?? null)).toBe(zahl);
    expect(zahlZeile?.textContent).toContain('milk');
    expect(knoten.some((el) => el.tagName === 'P' && el.textContent === 'A. tea')).toBe(true);
    expect(knoten.some((el) => el.classList.contains('nummerart'))).toBe(false);
    const haken = knoten.find((el) => el.classList.contains('cm-haken'));
    expect(haken?.classList.contains('cm-marker')).toBe(true);
    expect(erstesElement(haken?.parentNode ?? null)).toBe(haken);
    expect(knoten.some((el) => el.classList.contains('cm-punkt'))).toBe(false);
    await zu(sitz);
  });

  it('continues a list on enter and keeps a plain enter as a new line', async () => {
    const liste = await oeffne();
    await tippe(liste.stand.view!, '- milk');
    await druck(liste.stand.view!, 'Enter');
    expect(liste.stand.text).toBe('- milk\n- ');
    expect(hatKopf(liste.stand.view!.state.doc)).toBe(false);
    expect(klartextVon(liste.stand.view!.state.doc)).toBe('milk\n');
    const zeilen = elemente(liste.stand.view!.dom).filter((el) => el.classList.contains('cm-punkt'));
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]?.textContent).toBe('milk');
    expect(zeilen[1]?.textContent).toBe('');
    expect(erstesElement(zeilen[0] ?? null)?.classList.contains('cm-marker')).toBe(true);
    await zu(liste);
  });

  it('continues a numbered list and ends an empty numbered item with enter or backspace', async () => {
    const weiter = await oeffne();
    await act(async () => {
      weiter.stand.setze('1. milk');
    });
    await druck(weiter.stand.view!, 'Enter');
    expect(weiter.stand.text).toBe('1. milk\n2. ');
    expect(klartextVon(weiter.stand.view!.state.doc)).toBe('milk\n');
    expect(weiter.stand.view!.state.doc.child(1).attrs).toMatchObject({ art: 'nummer', nummer: 2 });
    await zu(weiter);

    const enterLeer = await oeffne();
    await act(async () => {
      enterLeer.stand.setze('1. ');
    });
    await druck(enterLeer.stand.view!, 'Enter');
    expect(enterLeer.stand.view!.state.doc.toString()).toBe('doc(absatz)');
    expect(enterLeer.stand.text).toBe('');
    await zu(enterLeer);

    const weg = await oeffne();
    await act(async () => {
      weg.stand.setze('1. ');
    });
    await druck(weg.stand.view!, 'Backspace');
    expect(weg.stand.view!.state.doc.toString()).toBe('doc(absatz)');
    expect(weg.stand.text).toBe('');
    await zu(weg);
  });

  it('formats pasted markdown when html still shows the markers, including text afterwards', async () => {
    const sitz = await oeffne();
    const view = sitz.stand.view!;
    const probe = '# Titel\n**fett** und `code`\n- a\n1. b\nText danach';
    const html = '<div># Titel</div><div>**fett** und `code`</div><div>- a</div><div>1. b</div><div>Text danach</div>';
    await act(async () => {
      const werte = new Map<string, string>([
        ['text/plain', probe],
        ['text/html', html],
      ]);
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
    expect(speichere(view.state.doc)).toBe(probe);
    expect(sitz.stand.text).toBe(probe);
    expect(view.state.doc.child(0).type.name).toBe('ueberschrift');
    expect(view.state.doc.lastChild?.textContent).toBe('Text danach');
    expect(view.dom.textContent ?? '').not.toContain('**');
    await zu(sitz);
  });
});
