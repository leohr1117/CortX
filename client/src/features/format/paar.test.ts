import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseKeymap } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { auswahlAn, dokumentFuer, textAusDokument } from '../capture/erfassenDokument.ts';
import { feldPlugins, type FeldAktion } from '../capture/erfassenEingabe.ts';
import { erfassenSchmuck } from '../capture/erfassenSchmuck.ts';
import { entfernePruefDom, richtePruefDom } from './modellPruef.ts';
import { knotenAnsichten, markenAnsichten } from './modellSicht.ts';

const still: FeldAktion = {
  ablegen() {},
  offen: () => false,
  waehlen() {},
  hoch() {},
  runter() {},
  zu() {},
};

beforeAll(() => {
  richtePruefDom();
});

afterAll(() => {
  entfernePruefDom();
});

function oeffne(text: string, kopf = text.length): EditorView {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const doc = dokumentFuer(text);
  const basis = EditorState.create({
    doc,
    plugins: [
      history(),
      erfassenSchmuck(() => ''),
      keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo }),
      ...feldPlugins(() => still, () => undefined),
      keymap(baseKeymap),
    ],
  });
  const auswahl = basis.tr.setSelection(auswahlAn(doc, text, kopf)).setMeta('addToHistory', false);
  return new EditorView(host, {
    state: basis.apply(auswahl),
    nodeViews: knotenAnsichten(),
    markViews: markenAnsichten(),
  });
}

function zu(view: EditorView): void {
  const host = view.dom.parentElement;
  view.destroy();
  host?.remove();
}

function taste(view: EditorView, key: string, extra: { ctrl?: boolean; inputType?: string } = {}): boolean {
  const ereignis = {
    type: extra.inputType ? 'beforeinput' : 'keydown',
    key,
    code: key,
    keyCode: key === 'Backspace' ? 8 : key === 'Delete' ? 46 : key === 'z' ? 90 : 0,
    ctrlKey: extra.ctrl === true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    inputType: extra.inputType,
    data: null,
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
  return ereignis.defaultPrevented;
}

describe('pair delete in the editor', () => {
  it('removes both markers in one backspace or delete', () => {
    const ende = oeffne('*test*');
    try {
      taste(ende, 'Backspace');
      expect(textAusDokument(ende.state.doc)).toBe('test');
    } finally {
      zu(ende);
    }
    const innen = oeffne('*test*', 1);
    try {
      taste(innen, 'Backspace');
      expect(textAusDokument(innen.state.doc)).toBe('test');
    } finally {
      zu(innen);
    }
    const vorn = oeffne('*test*', 0);
    try {
      taste(vorn, 'Delete');
      expect(textAusDokument(vorn.state.doc)).toBe('test');
    } finally {
      zu(vorn);
    }
    const fett = oeffne('**x**');
    try {
      taste(fett, 'Backspace');
      expect(textAusDokument(fett.state.doc)).toBe('x');
    } finally {
      zu(fett);
    }
  });

  it('leaves a normal backspace for the field to delete one character', () => {
    const wort = oeffne('hello');
    try {
      expect(taste(wort, 'Backspace', { inputType: 'deleteContentBackward' })).toBe(false);
      expect(textAusDokument(wort.state.doc)).toBe('hello');
      expect(taste(wort, 'Backspace')).toBe(false);
      expect(textAusDokument(wort.state.doc)).toBe('hello');
    } finally {
      zu(wort);
    }
  });

  it('undoes the pair in one step and keeps the earlier text', () => {
    const view = oeffne('*test*');
    try {
      taste(view, 'Backspace');
      expect(textAusDokument(view.state.doc)).toBe('test');
      taste(view, 'z', { ctrl: true });
      expect(textAusDokument(view.state.doc)).toBe('*test*');
    } finally {
      zu(view);
    }
  });

  it('removes both markers from a phone backspace', () => {
    const view = oeffne('*test*');
    try {
      taste(view, 'Backspace', { inputType: 'deleteContentBackward' });
      expect(textAusDokument(view.state.doc)).toBe('test');
    } finally {
      zu(view);
    }
  });
});
