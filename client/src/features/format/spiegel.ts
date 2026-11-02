import {
  defaultKeymap,
  history,
  historyKeymap,
  isolateHistory,
} from '@codemirror/commands';
import { Compartment, EditorState, Prec, type Extension, type Transaction } from '@codemirror/state';
import { drawSelection, EditorView, keymap, type KeyBinding } from '@codemirror/view';
import { NOTE_TEXT_MAX } from '../../../../shared/kern/grenzen.ts';
import {
  schalteCode,
  schalteFett,
  schalteHaken,
  schalteKursiv,
  schalteListe,
  schalteStrich,
  schalteUeberschrift,
  wandleKuerzel,
  type TextWahl,
} from '../../../../shared/features/format/index.ts';
import { kuerzelAn } from './kuerzelSpeicher.ts';
import { schmuck } from './schmuck.ts';

export interface SpiegelHaken {
  onText: (text: string) => void;
  onAuswahl: () => void;
  onLink: () => void;
}

function eineEingabe(tr: Transaction): boolean {
  if (!tr.isUserEvent('input.type')) return false;
  let eingefuegt = 0;
  let geloescht = false;
  tr.changes.iterChanges((von, bis, _vonB, _bisB, text) => {
    if (bis > von) geloescht = true;
    eingefuegt += text.length;
  });
  return !geloescht && eingefuegt === 1;
}

function attribute(ungueltig: boolean): Extension {
  const werte: Record<string, string> = { 'aria-label': 'Note' };
  if (ungueltig) werte['aria-invalid'] = 'true';
  return EditorView.contentAttributes.of(werte);
}

export function setzeWahl(view: EditorView, wahl: TextWahl): void {
  const start = Math.max(0, Math.min(wahl.start, wahl.text.length));
  const ende = Math.max(0, Math.min(wahl.ende, wahl.text.length));
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: wahl.text },
    selection: { anchor: start, head: ende },
    userEvent: 'input.format',
    scrollIntoView: true,
  });
  view.focus();
}

function formatTasten(haken: SpiegelHaken): readonly KeyBinding[] {
  const lauf = (fn: (text: string, start: number, ende: number) => TextWahl) => (view: EditorView) => {
    const sel = view.state.selection.main;
    setzeWahl(view, fn(view.state.doc.toString(), sel.from, sel.to));
    return true;
  };
  return [
    { key: 'Mod-b', run: lauf(schalteFett) },
    { key: 'Mod-i', run: lauf(schalteKursiv) },
    { key: 'Mod-Shift-x', run: lauf(schalteStrich) },
    { key: 'Mod-e', run: lauf(schalteCode) },
    { key: 'Mod-Shift-h', run: lauf(schalteUeberschrift) },
    { key: 'Mod-Shift-l', run: lauf(schalteListe) },
    { key: 'Mod-Shift-u', run: lauf(schalteHaken) },
    {
      key: 'Mod-k',
      run: () => {
        haken.onLink();
        return true;
      },
    },
  ];
}

const thema = EditorView.theme(
  {
    '&': { color: '#f2f2f2', backgroundColor: 'transparent', height: '100%' },
    '.cm-scroller': { fontFamily: 'inherit', lineHeight: 'inherit', fontSize: 'inherit' },
    '.cm-content': {
      fontFamily: 'inherit',
      padding: '0',
      border: '0',
      backgroundColor: 'transparent',
      color: '#f2f2f2',
      caretColor: '#60a5fa',
    },
    '.cm-line': { padding: '0' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#60a5fa' },
    '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
      backgroundColor: 'rgba(96, 165, 250, 0.35)',
    },
  },
  { dark: true },
);

export function baueSpiegel(start: string, haken: SpiegelHaken): { erweiterungen: Extension[]; fach: Compartment } {
  const fach = new Compartment();
  let zuletzt = start;
  const erweiterungen: Extension[] = [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    thema,
    schmuck,
    Prec.high(keymap.of(formatTasten(haken))),
    keymap.of([...historyKeymap, ...defaultKeymap]),
    EditorState.transactionFilter.of((tr) => (tr.newDoc.length <= NOTE_TEXT_MAX ? tr : [])),
    fach.of(attribute(false)),
    EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged) haken.onAuswahl();
      if (!update.docChanged) return;
      const text = update.state.doc.toString();
      const eingabe = update.transactions.find(eineEingabe);
      if (eingabe && kuerzelAn()) {
        const wahl = wandleKuerzel(text, update.state.selection.main.head);
        if (wahl && wahl.text !== text) {
          const view = update.view;
          queueMicrotask(() => {
            if (!view.dom.isConnected) {
              haken.onText(text);
              return;
            }
            if (view.state.doc.toString() !== text) return;
            view.dispatch({
              changes: { from: 0, to: view.state.doc.length, insert: wahl.text },
              selection: { anchor: wahl.ende },
              userEvent: 'convert',
              annotations: isolateHistory.of('full'),
            });
          });
          return;
        }
      }
      if (text === zuletzt) return;
      zuletzt = text;
      haken.onText(text);
    }),
  ];
  return { erweiterungen, fach };
}

export function setzeUngueltig(view: EditorView, fach: Compartment, wert: boolean): void {
  view.dispatch({ effects: fach.reconfigure(attribute(wert)) });
}
