import { type Ref, useLayoutEffect, useRef } from 'react';
import { baseKeymap } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { lade } from '../../../../shared/features/format/laden.ts';
import { speichere } from '../../../../shared/features/format/speichern.ts';
import { modellAblage } from './modellAblage.ts';
import { modellEingabe } from './modellEingabe.ts';
import { knotenAnsichten, markenAnsichten } from './modellSicht.ts';
import { zustandNach } from './modellLauf.ts';

function schreibeRef(ziel: Ref<EditorView | null> | undefined, wert: EditorView | null) {
  if (!ziel) return;
  if (typeof ziel === 'function') ziel(wert);
  else ziel.current = wert;
}

function plugins() {
  return [
    history(),
    keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo }),
    ...modellEingabe(),
    modellAblage(),
    keymap(baseKeymap),
  ];
}

export function ModellEditor({
  text,
  onText,
  ref,
}: {
  text: string;
  onText: (text: string) => void;
  ref?: Ref<EditorView | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onTextRef = useRef(onText);
  const textRef = useRef(text);
  const gemeldet = useRef(text);
  const refWeiter = useRef(ref);
  onTextRef.current = onText;
  textRef.current = text;
  refWeiter.current = ref;

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const anfang = textRef.current;
    gemeldet.current = anfang;
    const erweiterungen = plugins();
    const view = new EditorView(el, {
      state: EditorState.create({ doc: lade(anfang), plugins: erweiterungen }),
      nodeViews: knotenAnsichten(),
      markViews: markenAnsichten(),
      attributes: { role: 'textbox', 'aria-multiline': 'true' },
      dispatchTransaction(tr) {
        const vorher = view.state;
        const ersetzt = zustandNach(tr);
        const next = ersetzt ?? vorher.apply(tr);
        view.updateState(next);
        if (ersetzt ? next.doc.eq(vorher.doc) : !tr.docChanged) return;
        const wert = speichere(next.doc);
        gemeldet.current = wert;
        onTextRef.current(wert);
      },
    });
    viewRef.current = view;
    schreibeRef(refWeiter.current, view);
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
    view.updateState(EditorState.create({ doc: lade(text), plugins: view.state.plugins }));
  }, [text]);

  return <div ref={host} className="schreib modell-host" />;
}
