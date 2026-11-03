import {
  Compartment,
  EditorState,
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Extension,
  type Transaction,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  keymap,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { tastaturIstHandy } from '../../ui/system.ts';
import { tagMarken } from './marken.ts';

const TAG = Decoration.mark({ class: 'tag' });
const HIER = Decoration.mark({ class: 'tag hier' });

export interface TagAktionen {
  ablegen: () => void;
  hoch: () => void;
  runter: () => void;
  zu: () => void;
  waehlen: () => void;
  gesperrt: () => boolean;
}

interface TagHinweis {
  offen: boolean;
  aktiv: number;
}

export const setzeHinweis = StateEffect.define<TagHinweis>();

const hinweisFeld = StateField.define<TagHinweis>({
  create: () => ({ offen: false, aktiv: 0 }),
  update(wert, tr) {
    for (const effekt of tr.effects) {
      if (effekt.is(setzeHinweis)) return effekt.value;
    }
    return wert;
  },
});

type AktionsRef = { readonly current: TagAktionen };

function male(view: EditorView): DecorationSet {
  const marken = tagMarken(view.state.doc.toString(), view.state.selection.main.head);
  if (marken.length === 0) return Decoration.none;
  const bau = new RangeSetBuilder<Decoration>();
  for (const marke of marken) bau.add(marke.start, marke.end, marke.hier ? HIER : TAG);
  return bau.finish();
}

let strgEnterBis = 0;

function istStrgEnter(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.isComposing;
}

function ohneStrgZeilenumbruch(tr: Transaction): Transaction | readonly Transaction[] {
  if (Date.now() > strgEnterBis || !tr.docChanged) return tr;
  let nurUmbruch = true;
  let gesehen = false;
  tr.changes.iterChanges((_von, _bis, _vonB, _bisB, text) => {
    gesehen = true;
    if (!/^\n+$/.test(text.toString())) nurUmbruch = false;
  });
  if (!gesehen || !nurUmbruch) return tr;
  return [];
}

export function fangStrgEnter(
  sicht: { readonly current: EditorView | null },
  aktionen: AktionsRef,
): () => void {
  const taste = (event: KeyboardEvent) => {
    if (!istStrgEnter(event)) return;
    const editor = sicht.current;
    if (!editor || aktionen.current.gesperrt() || editor.composing) return;
    const ziel = event.target;
    if (ziel instanceof Element && ziel.closest('[role="dialog"], input, textarea, select')) return;
    strgEnterBis = Date.now() + 100;
    event.preventDefault();
    event.stopPropagation();
    aktionen.current.ablegen();
  };
  window.addEventListener('keydown', taste, true);
  return () => window.removeEventListener('keydown', taste, true);
}

function tastatur(aktionen: AktionsRef) {
  const lauf = (fn: (aktion: TagAktionen) => void) => (view: EditorView) => {
    if (view.composing || aktionen.current.gesperrt()) return false;
    fn(aktionen.current);
    return true;
  };
  return [
    { key: 'Mod-Enter', preventDefault: true, run: lauf((aktion) => aktion.ablegen()) },
    { key: 'ArrowDown', run: lauf((aktion) => aktion.runter()) },
    { key: 'ArrowUp', run: lauf((aktion) => aktion.hoch()) },
    { key: 'Escape', run: lauf((aktion) => aktion.zu()) },
    {
      key: 'Enter',
      run: (view: EditorView) => {
        if (view.composing || aktionen.current.gesperrt()) return false;
        if (tastaturIstHandy()) return false;
        aktionen.current.waehlen();
        return true;
      },
    },
  ];
}

export function tastenWennOffen(offen: boolean, aktionen: AktionsRef): Extension {
  if (!offen) return [];
  return Prec.highest(keymap.of(tastatur(aktionen)));
}

function attribute(state: EditorState): Record<string, string> {
  const stand = state.field(hinweisFeld);
  const werte: Record<string, string> = {
    spellcheck: 'false',
    autocapitalize: 'off',
    autocorrect: 'off',
    autocomplete: 'off',
    'aria-autocomplete': 'list',
    'aria-expanded': stand.offen ? 'true' : 'false',
  };
  if (stand.offen) {
    werte['aria-controls'] = 'vorschlaege';
    werte['aria-activedescendant'] = `vorschlag-${stand.aktiv}`;
  }
  return werte;
}

export function tagFeld(aktionen: AktionsRef): { erweiterung: Extension; tasten: Compartment } {
  const tasten = new Compartment();
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = male(view);
      }
      update(update: ViewUpdate): void {
        if (update.docChanged || update.selectionSet || update.viewportChanged) this.decorations = male(update.view);
      }
    },
    { decorations: (wert) => wert.decorations },
  );
  const erweiterung: Extension = [
    plugin,
    hinweisFeld,
    tasten.of([]),
    EditorState.transactionFilter.of(ohneStrgZeilenumbruch),
    keymap.of([
      {
        key: 'Mod-Enter',
        preventDefault: true,
        run: (view) => {
          if (view.composing || aktionen.current.gesperrt()) return false;
          aktionen.current.ablegen();
          return true;
        },
      },
    ]),
    EditorView.contentAttributes.compute([hinweisFeld], attribute),
  ];
  return { erweiterung, tasten };
}
