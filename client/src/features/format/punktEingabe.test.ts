import { EditorState } from '@codemirror/state';
import type { EditorView, KeyBinding } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { bauePunktEingabe } from './punktEingabe.ts';

function sicht(doc: string, kopf: number) {
  let state = EditorState.create({ doc, selection: { anchor: kopf } });
  const view = {
    get state() {
      return state;
    },
    composing: false,
    dispatch(spec: { changes?: { insert?: string }; selection?: { anchor?: number } }) {
      const text = spec.changes?.insert;
      if (text === undefined) return;
      const kopfNeu = spec.selection?.anchor ?? text.length;
      state = EditorState.create({ doc: text, selection: { anchor: kopfNeu } });
    },
  };
  return view;
}

function lauf(taste: KeyBinding, doc: string, kopf: number): { ok: boolean; text: string } {
  const view = sicht(doc, kopf);
  const ok = taste.run?.(view as unknown as EditorView) ?? false;
  return { ok, text: view.state.doc.toString() };
}

describe('list keys in the editor', () => {
  it('does not swallow the key when the command does not apply', () => {
    const { tasten } = bauePunktEingabe();
    const enter = tasten.find((taste) => taste.key === 'Enter');
    expect(enter?.preventDefault).toBeUndefined();
    expect(tasten.map((taste) => taste.key)).toEqual(['Enter', 'Shift-Enter', 'Backspace']);
    expect(tasten.every((taste) => taste.preventDefault === undefined)).toBe(true);
    expect(lauf(enter as KeyBinding, 'hello', 5)).toEqual({ ok: false, text: 'hello' });
  });

  it('applies enter once and swallows only the duplicate of that same text', () => {
    const { tasten } = bauePunktEingabe();
    const enter = tasten.find((taste) => taste.key === 'Enter') as KeyBinding;
    const view = sicht('- a', 3);
    expect(enter.run?.(view as unknown as EditorView)).toBe(true);
    expect(view.state.doc.toString()).toBe('- a\n- ');
    expect(enter.run?.(view as unknown as EditorView)).toBe(true);
    expect(view.state.doc.toString()).toBe('- a\n- ');
    const neu = sicht('* a', 3);
    expect(enter.run?.(neu as unknown as EditorView)).toBe(true);
    expect(neu.state.doc.toString()).toBe('* a\n* ');
  });

  it('breaks inside the item and clears an empty item', () => {
    const umbruch = bauePunktEingabe().tasten.find((taste) => taste.key === 'Shift-Enter') as KeyBinding;
    const leer = bauePunktEingabe().tasten.find((taste) => taste.key === 'Backspace') as KeyBinding;
    const voll = bauePunktEingabe().tasten.find((taste) => taste.key === 'Backspace') as KeyBinding;
    expect(lauf(umbruch, '- hello', 5)).toEqual({ ok: true, text: '- hel\n  lo' });
    expect(lauf(leer, '- ', 2)).toEqual({ ok: true, text: '' });
    expect(lauf(voll, '- milk', 2)).toEqual({ ok: false, text: '- milk' });
  });
});
