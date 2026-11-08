import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { undo } from 'prosemirror-history';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Root } from 'react-dom/client';
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

async function einfuegen(view: EditorView, text: string, cursor = text.length): Promise<void> {
  await act(async () => {
    let tr = view.state.tr.insertText(text);
    const ende = tr.selection.from;
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, ende - text.length + cursor)));
  });
}

async function kurz(text: string, cursor: number, erwartet: string | null): Promise<void> {
  const sitz = await leer();
  try {
    if (text.length > 0) await einfuegen(sitz.view, text, cursor);
    const name = `${text}@${cursor}`;
    if (erwartet === null) expect(marken(sitz.view), name).not.toContain('fett');
    else expect(speichere(sitz.view.state.doc), name).toBe(erwartet);
    if (erwartet !== null) expect(marken(sitz.view), name).toEqual(['fett']);
  } finally { await zu(sitz); }
}

async function schrittZurueck(view: EditorView): Promise<boolean> {
  let ok = false;
  await act(async () => {
    ok = undo(view.state, (tr) => view.dispatch(tr));
  });
  return ok;
}

function ereignis(felder: Record<string, unknown>): Event {
  return {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    cancelBubble: false,
    preventDefault(this: { defaultPrevented: boolean }) {
      this.defaultPrevented = true;
    },
    stopPropagation(this: { cancelBubble: boolean }) {
      this.cancelBubble = true;
    },
    ...felder,
  } as unknown as Event;
}

async function enter(view: EditorView, art: 'taste' | 'absatz'): Promise<void> {
  await act(async () => {
    const ziel = art === 'taste'
      ? ereignis({ type: 'keydown', key: 'Enter', keyCode: 13, which: 13 })
      : ereignis({ type: 'beforeinput', inputType: 'insertParagraph' });
    view.dom.dispatchEvent(ziel);
  });
}

async function compositionEnde(view: EditorView): Promise<void> {
  await act(async () => {
    view.dom.dispatchEvent(ereignis({ type: 'compositionend' }));
    await new Promise((fertig) => setTimeout(fertig, 30));
  });
}

async function composition(view: EditorView, text: string): Promise<void> {
  await act(async () => {
    const tr = view.state.tr.insertText(text);
    tr.setMeta('composition', 1);
    view.dispatch(tr);
  });
  await compositionEnde(view);
}

function marken(view: EditorView): string[] {
  const namen = new Set<string>();
  view.state.doc.descendants((knoten) => {
    for (const mark of knoten.marks) namen.add(mark.type.name);
  });
  return [...namen];
}

describe('input rules in the note editor', () => {
  it('wraps a word when two stars are typed after it and undo restores them', async () => {
    schalter(true);
    const sitz = await leer();
    try {
      await tippe(sitz.view, 'hello**');
      expect(speichere(sitz.view.state.doc)).toBe('**hello**');
      expect(sitz.view.state.doc.textContent).toBe('hello');
      expect(marken(sitz.view)).toEqual(['fett']);
      expect(await schrittZurueck(sitz.view)).toBe(true);
      expect(sitz.view.state.doc.textContent).toBe('hello**');
      expect(marken(sitz.view)).toEqual([]);
    } finally {
      await zu(sitz);
    }
  });

  it('turns a typed box into a checklist and undo restores the characters', async () => {
    schalter(true);
    const sitz = await leer();
    try {
      await tippe(sitz.view, '[ ]');
      expect(sitz.view.state.doc.child(0).type.name).toBe('punkt');
      expect(sitz.view.state.doc.child(0).attrs.art).toBe('haken');
      expect(speichere(sitz.view.state.doc)).toBe('[] ');
      expect(await schrittZurueck(sitz.view)).toBe(true);
      expect(sitz.view.state.doc.child(0).type.name).toBe('absatz');
      expect(sitz.view.state.doc.child(0).textContent).toBe('[ ]');
    } finally {
      await zu(sitz);
    }
  });

  it('applies a word shortcut after compositionend', async () => {
    schalter(true);
    const sitz = await leer();
    try {
      await act(async () => {
        const tr = sitz.view.state.tr.insertText('hello**');
        tr.setMeta('composition', 1);
        sitz.view.dispatch(tr);
      });
      expect(sitz.view.state.doc.textContent).toBe('hello**');
      await compositionEnde(sitz.view);
      expect(speichere(sitz.view.state.doc)).toBe('**hello**');
      expect(marken(sitz.view)).toEqual(['fett']);
    } finally {
      await zu(sitz);
    }
  });

  it('applies an inline shortcut after compositionend', async () => {
    schalter(true);
    const sitz = await leer();
    try {
      await composition(sitz.view, '**x**');
      expect(sitz.view.state.doc.textContent).toBe('x');
      expect(marken(sitz.view)).toEqual(['fett']);
      expect(speichere(sitz.view.state.doc)).toBe('**x**');
    } finally {
      await zu(sitz);
    }
  });

  it('turns a fence and enter into a code block from the key and from the paragraph input', async () => {
    schalter(true);
    for (const art of ['taste', 'absatz'] as const) {
      const sitz = await leer();
      try {
        await tippe(sitz.view, '```');
        await enter(sitz.view, art);
        expect(sitz.view.state.doc.child(1).type.name, art).toBe('codeblock');
        expect(speichere(sitz.view.state.doc), art).toBe('```\n\n```');
        await tippe(sitz.view, '**x**');
        expect(speichere(sitz.view.state.doc), art).toBe('```\n**x**\n```');
        expect(sitz.view.state.doc.child(1).type.name, art).toBe('codeblock');
      } finally {
        await zu(sitz);
      }
    }
  });

  function stelle(view: EditorView, wort: string): number {
    let pos = -1;
    view.state.doc.descendants((node, start) => {
      if (pos >= 0 || !node.isText || node.text !== wort) return;
      pos = start;
    });
    if (pos < 0) throw new Error(wort);
    return pos;
  }

  it('keeps text typed after a bold word outside the mark', async () => {
    schalter(true);
    const sitz = await oeffne('Titel\neins **zwei**');
    try {
      const ende = TextSelection.atEnd(sitz.view.state.doc);
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.setSelection(ende));
      });
      await tippe(sitz.view, ' drei');
      expect(speichere(sitz.view.state.doc)).toBe('Titel\neins **zwei** drei');
    } finally {
      await zu(sitz);
    }
  });

  it('keeps text typed before a marked word outside the mark', async () => {
    schalter(true);
    const sitz = await oeffne('Titel\n**zwei**');
    try {
      const anfang = stelle(sitz.view, 'zwei');
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(sitz.view.state.doc, anfang)));
      });
      await tippe(sitz.view, 'vor ');
      expect(speichere(sitz.view.state.doc)).toBe('Titel\nvor **zwei**');
    } finally {
      await zu(sitz);
    }
  });

  it('keeps a code mark when text is typed before it', async () => {
    schalter(true);
    const sitz = await oeffne('Titel\n`zwei`');
    try {
      const anfang = stelle(sitz.view, 'zwei');
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(sitz.view.state.doc, anfang)));
      });
      await tippe(sitz.view, 'vor ');
      expect(speichere(sitz.view.state.doc)).toBe('Titel\nvor `zwei`');
    } finally {
      await zu(sitz);
    }
  });

  async function komponiere(view: EditorView, text: string): Promise<void> {
    await act(async () => {
      view.dom.dispatchEvent(ereignis({ type: 'compositionstart' }));
      const tr = view.state.tr.insertText(text);
      tr.setMeta('composition', 1);
      view.dispatch(tr);
    });
    await compositionEnde(view);
  }

  it('keeps a mark off text composed before a word', async () => {
    schalter(true);
    const sitz = await oeffne('Titel\n**zwei**');
    try {
      const anfang = stelle(sitz.view, 'zwei');
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(sitz.view.state.doc, anfang)));
      });
      await komponiere(sitz.view, 'vor ');
      expect(speichere(sitz.view.state.doc)).toBe('Titel\nvor **zwei**');
    } finally {
      await zu(sitz);
    }
  });

  it('keeps a mark off text composed after a word', async () => {
    schalter(true);
    const sitz = await oeffne('Titel\neins **zwei**');
    try {
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.atEnd(sitz.view.state.doc)));
      });
      await komponiere(sitz.view, ' drei');
      expect(speichere(sitz.view.state.doc)).toBe('Titel\neins **zwei** drei');
    } finally {
      await zu(sitz);
    }
  });

  it('does not double a strike mark that was stored before typing', async () => {
    schalter(true);
    const sitz = await oeffne('Titel');
    try {
      const typ = sitz.view.state.schema.marks.strich;
      if (!typ) throw new Error('missing mark');
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.addStoredMark(typ.create()));
      });
      await tippe(sitz.view, 'hdhx');
      const roh = speichere(sitz.view.state.doc);
      expect(roh).not.toContain('~~~~');
      expect(roh).not.toContain('\\~');
      expect(roh).toContain('hdhx');
    } finally {
      await zu(sitz);
    }
  });
  it('wraps bold only at the two stars after a word', async () => {
    schalter(true);
    const an: Array<[string, number, string | null]> = [
      ['(hello**', 8, '**(hello**'], ['[hello**', 8, '**[hello**'], ['say (hello**', 12, 'say **(hello**'],
      ['say hello** there', 11, 'say **hello** there'], ['hello** ', 7, '**hello** '],
      ['', 0, null], ['**', 2, null], ['hi__', 4, null], ['hello***', 8, null], ['*hi*', 4, null],
      ['tag#1**', 7, null], ['hello**', 0, null], ['hello**', 3, null], ['#tag**', 6, null],
      ['note #tag**', 11, null], ['#school/math**', 14, null], ['**hello** ', 10, null],
    ];
    for (const [text, cursor, erwartet] of an) await kurz(text, cursor, erwartet);
    const kopf = await oeffne('= hello');
    try { await tippe(kopf.view, '**'); expect(speichere(kopf.view.state.doc)).toBe('= **hello**'); }
    finally { await zu(kopf); }
    const zeile = await oeffne('a\nhello');
    try { await tippe(zeile.view, '**'); expect(speichere(zeile.view.state.doc)).toBe('a\n**hello**'); }
    finally { await zu(zeile); }
  });
  it('turns a box only when the line so far is exactly that box', async () => {
    schalter(true);
    const milch = await leer();
    try {
      await einfuegen(milch.view, '[ ]milk', 3);
      expect(speichere(milch.view.state.doc)).toBe('[] milk');
      expect(milch.view.state.doc.child(0).attrs.art).toBe('haken');
    } finally { await zu(milch); }
    const zeile = await oeffne('x\nz');
    try {
      await act(async () => {
        const doc = zeile.view.state.doc;
        const start = doc.child(0).nodeSize + 1;
        zeile.view.dispatch(zeile.view.state.tr.insertText('[ ]', start, start + doc.child(1).content.size));
      });
      expect(speichere(zeile.view.state.doc)).toBe('x\n[] ');
    } finally { await zu(zeile); }
    for (const text of ['= [ ]', '[x]', '`[ ]`', 'see [ ]']) {
      const sitz = await leer();
      try {
        await einfuegen(sitz.view, text);
        expect(sitz.view.state.doc.child(0).type.name, text).toBe('absatz');
      } finally { await zu(sitz); }
    }
  });
});
