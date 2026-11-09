import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import {
  arten,
  druecke,
  entferneLeistenPruef,
  fundPos,
  oeffne,
  richteLeistenPruef,
  setzeKomposition,
  taste,
  wichtigTaste,
  zu,
} from './leisteSitz.ts';

beforeAll(async () => {
  await richteLeistenPruef();
});

afterAll(() => {
  entferneLeistenPruef();
});

function macBefehl(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iP(hone|[oa]d)/.test(navigator.platform);
}

function eigenesMod(): { ctrl: boolean; meta: boolean } {
  return macBefehl() ? { ctrl: false, meta: true } : { ctrl: true, meta: false };
}

async function anDenAnfang(sitz: Awaited<ReturnType<typeof oeffne>>): Promise<void> {
  await act(async () => {
    sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(sitz.view.state.doc, 1)));
  });
}

describe('important shift chord', () => {
  it('requires shift together with the exclamation mark and a digit-1 path', async () => {
    const sitz = await oeffne('Milch', () => undefined);
    const eigen = eigenesMod();
    const fremd = macBefehl() ? { ctrl: true, meta: false } : { ctrl: false, meta: true };
    try {
      await anDenAnfang(sitz);
      expect(sitz.view.state.selection.empty).toBe(true);
      expect(arten(sitz.view)).toEqual(['absatz']);
      expect(taste(sitz.view, '!', 49, false, { code: 'Digit1', ...eigen })).toBe(false);
      expect(taste(sitz.view, '!', 0, true, { code: 'Slash', ...eigen })).toBe(false);
      expect(taste(sitz.view, '1', 49, true, { code: 'Digit1', ...eigen })).toBe(true);
      expect(arten(sitz.view)).toEqual(['wichtigZeile']);
      expect(sitz.view.state.doc.textContent).toBe('Milch');
      expect(taste(sitz.view, 'z', 90, false, eigen)).toBe(true);
      expect(arten(sitz.view)).toEqual(['absatz']);
      expect(taste(sitz.view, '!', 49, true, { code: 'Digit1', alt: true, ...eigen })).toBe(false);
      expect(taste(sitz.view, '!', 49, true, { code: 'Digit1', alt: true, ctrl: true })).toBe(false);
      expect(taste(sitz.view, '!', 49, true, { code: 'Digit1', ctrl: false, meta: false })).toBe(false);
      expect(taste(sitz.view, '!', 49, true, { code: 'Digit1', ...fremd })).toBe(false);
      expect(taste(sitz.view, '!', 49, true, { code: 'Digit1', ctrl: true, meta: true })).toBe(false);
      expect(arten(sitz.view)).toEqual(['absatz']);
      expect(sitz.view.state.doc.textContent).toBe('Milch');
      expect(taste(sitz.view, '!', 0, true, { code: 'Digit1', ...eigen })).toBe(true);
      expect(arten(sitz.view)).toEqual(['wichtigZeile']);
      expect(taste(sitz.view, 'z', 90, false, eigen)).toBe(true);
      expect(arten(sitz.view)).toEqual(['absatz']);
      expect(taste(sitz.view, '!', 49, true, { code: 'Slash', ...eigen })).toBe(true);
      expect(arten(sitz.view)).toEqual(['wichtigZeile']);
      expect(taste(sitz.view, 'z', 90, false, eigen)).toBe(true);
      expect(taste(sitz.view, '!', 0, true, { code: 'Slash', which: 49, ...eigen })).toBe(true);
      expect(arten(sitz.view)).toEqual(['wichtigZeile']);
      expect(sitz.view.state.doc.textContent).toBe('Milch');
    } finally {
      await zu(sitz);
    }
  });

  it('does nothing outside the editor, during composition, or inside a code block', async () => {
    const sitz = await oeffne('Milch', () => undefined);
    const eigen = eigenesMod();
    try {
      await anDenAnfang(sitz);
      const feld = document.createElement('input');
      document.body.appendChild(feld);
      expect(wichtigTaste(sitz.view, { ziel: feld, ...eigen })).toBe(false);
      feld.remove();
      expect(arten(sitz.view)).toEqual(['absatz']);
      setzeKomposition(sitz.view, true);
      const still = sitz.view.state;
      expect(wichtigTaste(sitz.view, eigen)).toBe(false);
      expect(sitz.view.state).toBe(still);
      setzeKomposition(sitz.view, false);
      expect(taste(sitz.view, '!', 49, true, { code: 'Digit1', isComposing: true, ...eigen })).toBe(false);
      expect(arten(sitz.view)).toEqual(['absatz']);
    } finally {
      await zu(sitz);
    }
    const block = await oeffne('aa\nbb\ncc', () => undefined);
    try {
      await druecke(block.host, TEXTE.code);
      expect(arten(block.view).every((art) => art === 'codeblock')).toBe(true);
      const imCode = fundPos(block.view, 'aa') + 1;
      await act(async () => {
        block.view.dispatch(block.view.state.tr.setSelection(TextSelection.create(block.view.state.doc, imCode)));
      });
      await block.zeige(2);
      const code = block.view.state;
      expect(code.selection.empty).toBe(true);
      expect(wichtigTaste(block.view, eigen)).toBe(true);
      expect(block.view.state).toBe(code);
      expect(block.view.state.doc.textContent).toBe('aabbcc');
    } finally {
      await zu(block);
    }
  });
});
