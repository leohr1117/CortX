import { isolateHistory } from '@codemirror/commands';
import { EditorState, Transaction } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { loeschePaar } from '../../../../shared/features/format/index.ts';

function reineLoeschung(tr: Transaction): { von: number; bis: number } | null {
  if (!tr.docChanged) return null;
  let von = 0;
  let bis = 0;
  let anzahl = 0;
  let textDazu = false;
  tr.changes.iterChanges((fromA, toA, _vonB, _bisB, inserted) => {
    anzahl += 1;
    von = fromA;
    bis = toA;
    if (inserted.length > 0) textDazu = true;
  });
  if (anzahl !== 1 || textDazu || bis <= von) return null;
  return { von, bis };
}

function istTasteLoeschen(tr: Transaction): boolean {
  return tr.isUserEvent('delete.backward') || tr.isUserEvent('delete.forward') || tr.isUserEvent('delete.selection');
}

export function paarFilter() {
  return EditorState.transactionFilter.of((tr) => {
    if (!istTasteLoeschen(tr)) return tr;
    const bereich = reineLoeschung(tr);
    if (!bereich) return tr;
    const text = tr.startState.doc.toString();
    const wahl = loeschePaar(text, bereich.von, bereich.bis);
    if (!wahl) return tr;
    const ereignis = tr.annotation(Transaction.userEvent) ?? 'delete';
    return tr.startState.update({
      changes: { from: 0, to: text.length, insert: wahl.text },
      selection: { anchor: wahl.start, head: wahl.ende },
      userEvent: ereignis,
      annotations: isolateHistory.of('full'),
      filter: false,
      scrollIntoView: true,
    });
  });
}

function zeichenBereich(
  text: string,
  von: number,
  bis: number,
  rueckwaerts: boolean,
): { von: number; bis: number } | null {
  if (von !== bis) return von < bis ? { von, bis } : { von: bis, bis: von };
  if (rueckwaerts) {
    if (von <= 0) return null;
    return { von: von - 1, bis: von };
  }
  if (von >= text.length) return null;
  return { von, bis: von + 1 };
}

export const paarEingabe = ViewPlugin.fromClass(
  class {
    private dom: HTMLElement;
    private handler: (event: Event) => void;

    constructor(view: EditorView) {
      this.dom = view.contentDOM;
      this.handler = (event: Event) => {
        if (!(event instanceof InputEvent) || event.isComposing) return;
        const rueckwaerts = event.inputType === 'deleteContentBackward';
        const vorwaerts = event.inputType === 'deleteContentForward';
        if (!rueckwaerts && !vorwaerts) return;
        if (view.state.selection.ranges.length !== 1) return;
        const text = view.state.doc.toString();
        const sel = view.state.selection.main;
        const bereich = zeichenBereich(text, sel.from, sel.to, rueckwaerts);
        if (!bereich) return;
        const wahl = loeschePaar(text, bereich.von, bereich.bis);
        if (!wahl) return;
        event.preventDefault();
        event.stopPropagation();
        view.dispatch({
          changes: { from: 0, to: text.length, insert: wahl.text },
          selection: { anchor: wahl.start, head: wahl.ende },
          userEvent: rueckwaerts ? 'delete.backward' : 'delete.forward',
          annotations: isolateHistory.of('full'),
          filter: false,
          scrollIntoView: true,
        });
      };
      this.dom.addEventListener('beforeinput', this.handler, true);
    }

    destroy(): void {
      this.dom.removeEventListener('beforeinput', this.handler, true);
    }
  },
);
