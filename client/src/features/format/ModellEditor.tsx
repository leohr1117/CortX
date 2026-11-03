import { type Ref, useLayoutEffect, useRef } from 'react';
import { baseKeymap } from 'prosemirror-commands';
import { closeHistory, history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { wandleKuerzel } from '../../../../shared/features/format/kuerzel.ts';
import { lade } from '../../../../shared/features/format/laden.ts';
import { speichere } from '../../../../shared/features/format/speichern.ts';
import { NOTE_TEXT_MAX } from '../../../../shared/kern/grenzen.ts';
import { kuerzelAn } from './kuerzelSpeicher.ts';
import { modellAblage } from './modellAblage.ts';
import { modellEingabe } from './modellEingabe.ts';
import { inlinePlugins } from './inlineKuerzel.ts';
import { zeilenPlugins } from './zeilenKuerzel.ts';
import { haengeGriff, merkeEnde, merkeWahl } from './modellGriff.ts';
import { zustandNach } from './modellLauf.ts';
import { knotenAnsichten, markenAnsichten, schichtenPlugin } from './modellSicht.ts';
import { grenzen, offsetFuer } from './modellStelle.ts';
import { formatTasten } from './modellTasten.ts';

function schreibeRef(ziel: Ref<EditorView | null> | undefined, wert: EditorView | null) {
  if (!ziel) return;
  if (typeof ziel === 'function') ziel(wert);
  else ziel.current = wert;
}

function cursorPos(doc: EditorState['doc'], text: string, index: number): number {
  const grenze = grenzen(doc, text);
  const safe = Math.max(0, Math.min(index, text.length));
  const pos = grenze[safe] ?? 0;
  return Math.max(0, Math.min(pos, doc.content.size));
}

export function ModellEditor({
  text,
  onText,
  onAuswahl,
  onLink,
  ungueltig = false,
  ref,
}: {
  text: string;
  onText: (text: string) => void;
  onAuswahl?: () => void;
  onLink?: () => void;
  ungueltig?: boolean;
  ref?: Ref<EditorView | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onTextRef = useRef(onText);
  const onAuswahlRef = useRef(onAuswahl);
  const onLinkRef = useRef(onLink);
  const textRef = useRef(text);
  const gemeldet = useRef(text);
  const refWeiter = useRef(ref);
  onTextRef.current = onText;
  onAuswahlRef.current = onAuswahl;
  onLinkRef.current = onLink;
  textRef.current = text;
  refWeiter.current = ref;

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    let tippt = false;
    const anfang = textRef.current;
    gemeldet.current = anfang;
    const basis = EditorState.create({
      doc: lade(anfang),
      plugins: [
        history(),
        ...zeilenPlugins(),
        ...inlinePlugins(),
        keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo }),
        keymap(formatTasten(() => onLinkRef.current?.())),
        ...modellEingabe(),
        modellAblage(),
        keymap(baseKeymap),
        schichtenPlugin(),
        new Plugin({
          props: {
            handleTextInput() {
              tippt = true;
              return false;
            },
          },
        }),
      ],
    });
    const ende = TextSelection.atEnd(basis.doc);
    const start = basis.apply(basis.tr.setSelection(ende).setMeta('addToHistory', false));
    const view = new EditorView(el, {
      state: start,
      nodeViews: knotenAnsichten(),
      markViews: markenAnsichten(),
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Note' },
      dispatchTransaction(tr) {
        const vorher = view.state;
        const ersetzt = zustandNach(tr);
        const next = ersetzt ?? vorher.apply(tr);
        const wert = speichere(next.doc);
        if (wert.length > NOTE_TEXT_MAX) {
          tippt = false;
          return;
        }
        const docGeaendert = ersetzt ? !next.doc.eq(vorher.doc) : tr.docChanged;
        const auswahlGeaendert = !next.selection.eq(vorher.selection);
        view.updateState(next);
        const warTipp = tippt;
        tippt = false;
        if (docGeaendert && !tr.getMeta('programm') && !ersetzt && warTipp && kuerzelAn()) {
          const kopf = offsetFuer(next.doc, wert, next.selection.head);
          const wahl = wandleKuerzel(wert, kopf);
          if (wahl && wahl.text !== wert) {
            queueMicrotask(() => {
              if (!view.dom.isConnected) return;
              if (speichere(view.state.doc) !== wert) return;
              const doc = lade(wahl.text);
              if (speichere(doc).length > NOTE_TEXT_MAX) return;
              let naechste = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
              const pos = cursorPos(naechste.doc, wahl.text, wahl.ende);
              naechste = closeHistory(naechste);
              naechste = naechste.setSelection(TextSelection.near(naechste.doc.resolve(pos)));
              view.dispatch(naechste.setMeta('programm', true));
              merkeWahl(view, wahl.ende, wahl.ende);
            });
          }
        }
        if (!docGeaendert) {
          if (auswahlGeaendert) onAuswahlRef.current?.();
          return;
        }
        gemeldet.current = speichere(view.state.doc);
        onTextRef.current(gemeldet.current);
        onAuswahlRef.current?.();
      },
    });
    viewRef.current = view;
    haengeGriff(view);
    merkeEnde(view, anfang);
    schreibeRef(refWeiter.current, view);
    view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
      schreibeRef(refWeiter.current, null);
    };
  }, []);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view || text === gemeldet.current) return;
    gemeldet.current = text;
    const zustand = EditorState.create({ doc: lade(text), plugins: view.state.plugins });
    const ende = TextSelection.atEnd(zustand.doc);
    view.updateState(zustand.apply(zustand.tr.setSelection(ende).setMeta('addToHistory', false)));
    merkeEnde(view, text);
    onAuswahlRef.current?.();
  }, [text]);

  useLayoutEffect(() => {
    const dom = viewRef.current?.dom;
    if (!dom) return;
    if (ungueltig) dom.setAttribute('aria-invalid', 'true');
    else dom.removeAttribute('aria-invalid');
  }, [ungueltig]);

  return <div ref={host} className="schreib modell-host" />;
}
