import { createElement, type ReactNode } from 'react';
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { undoDepth } from 'prosemirror-history';
import { NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Root } from 'react-dom/client';
import type { PunktArt } from '../../../../shared/features/format/punkt.ts';
import { stelleImModell, stelleInQuelle } from '../../../../shared/features/format/modellpunkt.ts';
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

const TASTEN: Record<PunktArt, { key: string; keyCode: number; shift: boolean; input: string }> = {
  enter: { key: 'Enter', keyCode: 13, shift: false, input: 'insertParagraph' },
  umbruch: { key: 'Enter', keyCode: 13, shift: true, input: 'insertLineBreak' },
  zurueck: { key: 'Backspace', keyCode: 8, shift: false, input: 'deleteContentBackward' },
};

function posVon(view: EditorView, index: number): number {
  const text = speichere(view.state.doc);
  const pos = stelleImModell(view.state.doc, text, index);
  if (pos === null) throw new Error(`no cursor for ${index} in ${JSON.stringify(text)}`);
  return pos;
}

function setze(view: EditorView, index: number): void {
  const pos = posVon(view, index);
  const doc = view.state.doc;
  const $pos = doc.resolve(pos);
  const auswahl = $pos.parent.inlineContent
    ? TextSelection.create(doc, pos)
    : $pos.nodeAfter?.isAtom
      ? NodeSelection.create(doc, pos)
      : Selection.near($pos);
  view.dispatch(view.state.tr.setSelection(auswahl));
}

function sende(view: EditorView, felder: Record<string, unknown>): boolean {
  const ziel = {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    data: null as string | null,
    defaultPrevented: false,
    cancelBubble: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.cancelBubble = true; },
    ...felder,
  };
  view.dom.dispatchEvent(ziel as unknown as Event);
  return ziel.defaultPrevented;
}

function druecke(view: EditorView, art: PunktArt): boolean {
  const taste = TASTEN[art];
  return sende(view, { type: 'keydown', key: taste.key, keyCode: taste.keyCode, shiftKey: taste.shift });
}

function tippe(view: EditorView, art: PunktArt, input = TASTEN[art].input, data: string | null = null): boolean {
  return sende(view, { type: 'beforeinput', inputType: input, data });
}

const faelle: ReadonlyArray<readonly [string, number, PunktArt, string, number]> = [
  ['- a', 3, 'enter', '- a\n- ', 6],
  ['- hello', 5, 'enter', '- hel\n- lo', 8],
  ['* a', 3, 'enter', '* a\n* ', 6],
  ['+ a', 3, 'enter', '+ a\n+ ', 6],
  ['[] call', 7, 'enter', '[] call\n[] ', 11],
  ['[x] done', 8, 'enter', '[x] done\n[] ', 12],
  ['- [ ] a', 7, 'enter', '- [ ] a\n- [ ] ', 14],
  ['- [x] a', 7, 'enter', '- [x] a\n- [ ] ', 14],
  ['* [x] a', 7, 'enter', '* [x] a\n* [ ] ', 14],
  ['+ [ ] a', 7, 'enter', '+ [ ] a\n+ [ ] ', 14],
  ['[x]now', 6, 'enter', '[x]now\n[]', 9],
  ['- [x]a', 6, 'enter', '- [x]a\n- [ ]', 12],
  ['- ', 2, 'enter', '', 0],
  ['[] ', 3, 'enter', '', 0],
  ['[x] ', 4, 'enter', '', 0],
  ['[x]', 3, 'enter', '', 0],
  ['- [ ] ', 6, 'enter', '', 0],
  ['- [x] ', 6, 'enter', '', 0],
  ['- ', 2, 'zurueck', '', 0],
  ['[] ', 3, 'zurueck', '', 0],
  ['[x] ', 4, 'zurueck', '', 0],
  ['[x]', 3, 'zurueck', '', 0],
  ['- [ ] ', 6, 'zurueck', '', 0],
  ['- [x] ', 6, 'zurueck', '', 0],
  ['- a\n- \n- b', 4, 'enter', '- a\n\n- b', 4],
  ['- a\n- \n- b', 6, 'zurueck', '- a\n\n- b', 4],
  ['- \r', 2, 'zurueck', '', 0],
  ['- milk\r', 6, 'enter', '- milk\n- \r', 9],
  ['- hello', 5, 'umbruch', '- hel\n  lo', 8],
  ['- ab\n  ', 7, 'enter', '- ab\n- ', 7],
  ['- ab\n  cd', 8, 'enter', '- ab\n  c\n- d', 11],
  ['- ab\n  cd', 9, 'enter', '- ab\n  cd\n- ', 12],
  ['- ab\n  ', 7, 'zurueck', '- ab\n', 5],
];

function gleicherCursor(view: EditorView, text: string, cursor: number): void {
  const ist = stelleInQuelle(view.state.doc, text, view.state.selection);
  expect(ist).not.toBeNull();
  expect(stelleImModell(view.state.doc, text, ist as number)).toBe(stelleImModell(view.state.doc, text, cursor));
}

async function pruefe(text: string, index: number, art: PunktArt, neu: string, cursor: number, weg: 'taste' | 'eingabe'): Promise<void> {
  const sitz = await oeffne(text);
  try {
    setze(sitz.view, index);
    const behandelt = weg === 'taste' ? druecke(sitz.view, art) : tippe(sitz.view, art);
    const wert = speichere(sitz.view.state.doc);
    expect(behandelt, `${weg} ${art} ${JSON.stringify(text)}`).toBe(true);
    expect(wert, `${weg} ${art} ${JSON.stringify(text)}`).toBe(neu);
    gleicherCursor(sitz.view, wert, cursor);
  } finally {
    await zu(sitz);
  }
}

describe('list keys in the model editor', () => {
  it('applies every list key from the text cases', async () => {
    for (const [text, index, art, neu, cursor] of faelle) {
      await pruefe(text, index, art, neu, cursor, 'taste');
    }
  });

  it('applies the same cases from a phone line break', async () => {
    for (const [text, index, art, neu, cursor] of faelle) {
      await pruefe(text, index, art, neu, cursor, 'eingabe');
    }
  });

  it('reads a phone newline as enter and leaves other input alone', async () => {
    for (const data of ['\n', '\r\n']) {
      const sitz = await oeffne('- a');
      try {
        setze(sitz.view, 3);
        expect(tippe(sitz.view, 'enter', 'insertText', data)).toBe(true);
        expect(speichere(sitz.view.state.doc)).toBe('- a\n- ');
      } finally {
        await zu(sitz);
      }
    }
    const still = await oeffne('- a');
    try {
      setze(still.view, 3);
      expect(tippe(still.view, 'enter', 'insertText', 'a')).toBe(false);
      expect(tippe(still.view, 'enter', 'insertCompositionText', '\n')).toBe(false);
      expect(sende(still.view, { type: 'beforeinput', inputType: 'insertParagraph', ctrlKey: true })).toBe(false);
      expect(speichere(still.view.state.doc)).toBe('- a');
    } finally {
      await zu(still);
    }
  });

  it('a second enter leaves the list', async () => {
    const sitz = await oeffne('- a');
    try {
      setze(sitz.view, 3);
      expect(druecke(sitz.view, 'enter')).toBe(true);
      expect(druecke(sitz.view, 'enter')).toBe(true);
      expect(speichere(sitz.view.state.doc)).toBe('- a\n');
    } finally {
      await zu(sitz);
    }
  });

  it('applies enter once and swallows only the duplicate of that same text', async () => {
    const sitz = await oeffne('- a');
    try {
      setze(sitz.view, 3);
      expect(druecke(sitz.view, 'enter')).toBe(true);
      expect(speichere(sitz.view.state.doc)).toBe('- a\n- ');
      expect(tippe(sitz.view, 'enter')).toBe(true);
      expect(speichere(sitz.view.state.doc)).toBe('- a\n- ');
      expect(druecke(sitz.view, 'enter')).toBe(true);
      expect(speichere(sitz.view.state.doc)).toBe('- a\n');
    } finally {
      await zu(sitz);
    }
    const neu = await oeffne('* a');
    try {
      setze(neu.view, 3);
      expect(druecke(neu.view, 'enter')).toBe(true);
      expect(speichere(neu.view.state.doc)).toBe('* a\n* ');
    } finally {
      await zu(neu);
    }
  });

  it('leaves backspace alone except at the start of an empty item', async () => {
    for (const index of [0, 2, 6]) {
      const sitz = await oeffne('- milk');
      try {
        setze(sitz.view, index);
        druecke(sitz.view, 'zurueck');
        expect(speichere(sitz.view.state.doc)).toBe('- milk');
      } finally {
        await zu(sitz);
      }
    }
    const telefon = await oeffne('- milk');
    try {
      setze(telefon.view, 6);
      expect(tippe(telefon.view, 'zurueck')).toBe(false);
      expect(speichere(telefon.view.state.doc)).toBe('- milk');
    } finally {
      await zu(telefon);
    }
  });

  it('does not make a list from plain text or a code fence', async () => {
    const text = await oeffne('hello');
    try {
      setze(text.view, 5);
      druecke(text.view, 'enter');
      const wert = speichere(text.view.state.doc);
      expect(wert === 'hello' || wert === 'hello\n').toBe(true);
      expect(tippe(text.view, 'enter')).toBe(false);
    } finally {
      await zu(text);
    }
    const zaun = await oeffne('```\n- a\n```');
    try {
      setze(zaun.view, 6);
      expect(tippe(zaun.view, 'umbruch')).toBe(false);
      expect(tippe(zaun.view, 'zurueck')).toBe(false);
      expect(speichere(zaun.view.state.doc)).toBe('```\n- a\n```');
      druecke(zaun.view, 'enter');
      expect(speichere(zaun.view.state.doc)).toBe('```\n- \na\n```');
    } finally {
      await zu(zaun);
    }
  });

  it('continues a numbered line and ends an empty one', async () => {
    const ende = await oeffne('1. item');
    try {
      setze(ende.view, 7);
      expect(druecke(ende.view, 'enter')).toBe(true);
      expect(speichere(ende.view.state.doc)).toBe('1. item\n2. ');
      expect(ende.view.state.doc.child(0).attrs.art).toBe('nummer');
      expect(ende.view.state.doc.child(1).attrs).toMatchObject({ art: 'nummer', nummer: 2 });
      expect(undoDepth(ende.view.state)).toBe(1);
      expect(sende(ende.view, { type: 'keydown', key: 'z', keyCode: 90, ctrlKey: true })).toBe(true);
      expect(speichere(ende.view.state.doc)).toBe('1. item');
    } finally {
      await zu(ende);
    }
    const telefon = await oeffne('A. milk');
    try {
      setze(telefon.view, 7);
      expect(tippe(telefon.view, 'enter')).toBe(true);
      expect(speichere(telefon.view.state.doc)).toBe('A. milk\nB. ');
    } finally {
      await zu(telefon);
    }
    const mitte = await oeffne('1. item');
    try {
      setze(mitte.view, 5);
      expect(druecke(mitte.view, 'enter')).toBe(true);
      expect(speichere(mitte.view.state.doc)).toBe('1. it\n2. em');
      expect(mitte.view.state.doc.child(1).attrs.art).toBe('nummer');
    } finally {
      await zu(mitte);
    }
    const markiert = await oeffne('1. item');
    try {
      const doc = markiert.view.state.doc;
      const von = stelleImModell(doc, '1. item', 3);
      const bis = stelleImModell(doc, '1. item', 5);
      if (von === null || bis === null) throw new Error('selection');
      markiert.view.dispatch(markiert.view.state.tr.setSelection(TextSelection.create(doc, von, bis)));
      expect(druecke(markiert.view, 'enter')).toBe(true);
      expect(speichere(markiert.view.state.doc)).toBe('1. \n2. em');
      expect(markiert.view.state.doc.child(1).attrs.art).toBe('nummer');
    } finally {
      await zu(markiert);
    }
    const leer = await oeffne('1. ');
    try {
      setze(leer.view, 3);
      expect(druecke(leer.view, 'enter')).toBe(true);
      expect(leer.view.state.doc.toString()).toBe('doc(absatz)');
      expect(speichere(leer.view.state.doc)).toBe('');
    } finally {
      await zu(leer);
    }
    const zurueck = await oeffne('1. ');
    try {
      setze(zurueck.view, 3);
      expect(druecke(zurueck.view, 'zurueck')).toBe(true);
      expect(zurueck.view.state.doc.toString()).toBe('doc(absatz)');
      expect(speichere(zurueck.view.state.doc)).toBe('');
    } finally {
      await zu(zurueck);
    }
    const telefonLeer = await oeffne('A. ');
    try {
      setze(telefonLeer.view, 3);
      expect(tippe(telefonLeer.view, 'zurueck')).toBe(true);
      expect(telefonLeer.view.state.doc.toString()).toBe('doc(absatz)');
    } finally {
      await zu(telefonLeer);
    }
  });

  it('deletes a selection instead of the whole item and keeps one undo step', async () => {
    const sitz = await oeffne('- milk');
    try {
      const doc = sitz.view.state.doc;
      const von = stelleImModell(doc, '- milk', 2);
      const bis = stelleImModell(doc, '- milk', 4);
      if (von === null || bis === null) throw new Error('selection');
      sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(doc, von, bis)));
      druecke(sitz.view, 'zurueck');
      expect(speichere(sitz.view.state.doc)).toBe('- lk');
    } finally {
      await zu(sitz);
    }
  });

  it('does not carry a mark onto the next line', async () => {
    const sitz = await oeffne('eins **zwei**');
    try {
      setze(sitz.view, 'eins **zwei**'.length);
      druecke(sitz.view, 'enter');
      sitz.view.dispatch(sitz.view.state.tr.insertText('danach'));
      expect(speichere(sitz.view.state.doc)).toBe('eins **zwei**\ndanach');
      const zeile = sitz.view.state.doc.lastChild;
      expect(zeile?.textContent).toBe('danach');
      expect(zeile?.firstChild?.marks ?? []).toHaveLength(0);
    } finally {
      await zu(sitz);
    }
  });

  it('keeps a list key as one undo step', async () => {
    const sitz = await oeffne('- a');
    try {
      setze(sitz.view, 3);
      expect(druecke(sitz.view, 'enter')).toBe(true);
      expect(speichere(sitz.view.state.doc)).toBe('- a\n- ');
      expect(undoDepth(sitz.view.state)).toBe(1);
      expect(sende(sitz.view, { type: 'keydown', key: 'z', keyCode: 90, ctrlKey: true })).toBe(true);
      expect(speichere(sitz.view.state.doc)).toBe('- a');
      expect(undoDepth(sitz.view.state)).toBe(0);
    } finally {
      await zu(sitz);
    }
  });
});
