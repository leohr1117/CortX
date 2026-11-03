import { deleteCharBackward, deleteCharForward, history, undo } from '@codemirror/commands';
import { EditorState, Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { paarFilter } from './paar.ts';

function rufe(taste: (view: EditorView) => boolean, state: EditorState, bei: (tr: Transaction) => void): boolean {
  const ziel = {
    state,
    dispatch: (tr: Transaction) => bei(tr),
  };
  return taste(ziel as unknown as EditorView);
}

function nachTaste(doc: string, kopf: number, taste: (view: EditorView) => boolean): string {
  const state = EditorState.create({
    doc,
    selection: { anchor: kopf },
    extensions: [paarFilter()],
  });
  let neu = state;
  const lief = rufe(taste, state, (tr) => {
    neu = tr.state;
  });
  expect(lief).toBe(true);
  return neu.doc.toString();
}

describe('pair delete in the editor', () => {
  it('records the delete event the command actually sends', () => {
    const state = EditorState.create({ doc: '*test*', selection: { anchor: 6 } });
    rufe(deleteCharBackward, state, (tr) => {
      expect(tr.annotation(Transaction.userEvent)).toBe('delete.backward');
      expect(tr.changes.length).toBeGreaterThan(0);
    });
  });

  it('removes both markers in one backspace or delete', () => {
    expect(nachTaste('*test*', 6, deleteCharBackward)).toBe('test');
    expect(nachTaste('*test*', 1, deleteCharBackward)).toBe('test');
    expect(nachTaste('*test*', 0, deleteCharForward)).toBe('test');
    expect(nachTaste('**x**', 5, deleteCharBackward)).toBe('x');
    expect(nachTaste('hello', 5, deleteCharBackward)).toBe('hell');
  });

  it('undoes the pair in one step and keeps the earlier text', () => {
    let state = EditorState.create({ doc: '', extensions: [history(), paarFilter()] });
    state = state.update({ changes: { from: 0, insert: '*test*' }, selection: { anchor: 6 } }).state;
    const lief = rufe(deleteCharBackward, state, (tr) => {
      state = tr.state;
    });
    expect(lief).toBe(true);
    expect(state.doc.toString()).toBe('test');
    const zurueck = rufe(undo, state, (tr) => {
      state = tr.state;
    });
    expect(zurueck).toBe(true);
    expect(state.doc.toString()).toBe('*test*');
  });
});
