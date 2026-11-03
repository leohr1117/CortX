import { type Ref, useLayoutEffect, useRef, useState } from 'react';
import { EditorState, type Compartment, type Extension } from '@codemirror/state';
import { EditorView, placeholder as platzhalter } from '@codemirror/view';
import {
  formatVon,
  schalteFormat,
  type FormatBefehl,
  type TextWahl,
} from '../../../../shared/features/format/index.ts';
import { Leiste } from './Leiste.tsx';
import { LinkFeld } from './LinkFeld.tsx';
import { baueSpiegel, setzeUngueltig, setzeWahl } from './spiegel.ts';

interface Bereich {
  start: number;
  ende: number;
}

function wende(befehl: FormatBefehl, text: string, start: number, ende: number, ziel = ''): TextWahl {
  return schalteFormat(befehl, text, start, ende, ziel);
}

function schreibeRef(ziel: Ref<EditorView | null> | undefined, wert: EditorView | null) {
  if (!ziel) return;
  if (typeof ziel === 'function') ziel(wert);
  else ziel.current = wert;
}

export function Editor({
  text,
  onText,
  ungueltig = false,
  onCaret,
  placeholder,
  extensions,
  leiste = true,
  ref,
}: {
  text: string;
  onText: (text: string) => void;
  ungueltig?: boolean;
  onCaret?: (caret: number) => void;
  placeholder?: string;
  extensions?: Extension;
  leiste?: boolean;
  ref?: Ref<EditorView | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const fachRef = useRef<Compartment | null>(null);
  const onTextRef = useRef(onText);
  const onCaretRef = useRef(onCaret);
  const textRef = useRef(text);
  const extraRef = useRef(extensions);
  const platzRef = useRef(placeholder);
  const refWeiter = useRef(ref);
  const gemeldet = useRef(text);
  const [view, setView] = useState<EditorView | null>(null);
  const [stand, setStand] = useState(0);
  const [link, setLink] = useState<Bereich | null>(null);
  onTextRef.current = onText;
  onCaretRef.current = onCaret;
  textRef.current = text;
  extraRef.current = extensions;
  platzRef.current = placeholder;
  refWeiter.current = ref;

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    let lebend = true;
    const anfang = textRef.current;
    const { erweiterungen, fach } = baueSpiegel(anfang, {
      onText: (wert) => {
        gemeldet.current = wert;
        onTextRef.current(wert);
      },
      onAuswahl: () => {
        if (lebend) setStand((wert) => wert + 1);
        const editor = viewRef.current;
        if (editor) onCaretRef.current?.(editor.state.selection.main.head);
      },
      onLink: () => {
        const editor = viewRef.current;
        if (!editor) return;
        const sel = editor.state.selection.main;
        setLink({ start: sel.from, ende: sel.to });
      },
    });
    const extra = extraRef.current;
    const platz = platzRef.current;
    const alle = [...erweiterungen];
    if (platz) alle.push(platzhalter(platz));
    if (extra) alle.push(extra);
    const editor = new EditorView({
      parent: el,
      state: EditorState.create({ doc: anfang, extensions: alle }),
    });
    (editor.dom as HTMLElement & { cm?: EditorView }).cm = editor;
    viewRef.current = editor;
    fachRef.current = fach;
    schreibeRef(refWeiter.current, editor);
    setView(editor);
    editor.focus();
    const ende = editor.state.doc.length;
    editor.dispatch({ selection: { anchor: ende } });
    return () => {
      lebend = false;
      editor.destroy();
      viewRef.current = null;
      fachRef.current = null;
      schreibeRef(refWeiter.current, null);
      setView(null);
    };
  }, []);

  useLayoutEffect(() => {
    const editor = viewRef.current;
    if (!editor || text === gemeldet.current) return;
    if (editor.state.doc.toString() === text) {
      gemeldet.current = text;
      return;
    }
    gemeldet.current = text;
    const kopf = Math.min(editor.state.selection.main.head, text.length);
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: text },
      selection: { anchor: kopf },
    });
  }, [text]);

  useLayoutEffect(() => {
    const editor = viewRef.current;
    const fach = fachRef.current;
    if (!editor || !fach) return;
    setzeUngueltig(editor, fach, ungueltig);
  }, [ungueltig, view]);

  function befehl(name: FormatBefehl) {
    const editor = viewRef.current;
    if (!editor) return;
    if (formatVon(name).knopf?.ziel) {
      const sel = editor.state.selection.main;
      setLink({ start: sel.from, ende: sel.to });
      return;
    }
    const sel = editor.state.selection.main;
    setzeWahl(editor, wende(name, editor.state.doc.toString(), sel.from, sel.to));
  }

  function fertig(ziel: string) {
    const editor = viewRef.current;
    if (!editor || !link) return;
    setzeWahl(editor, wende('link', editor.state.doc.toString(), link.start, link.ende, ziel));
    setLink(null);
  }

  return (
    <div className="schreib klar">
      <div ref={host} className="cm-host" />
      {leiste ? <Leiste view={view} stand={stand} onBefehl={befehl} /> : null}
      {link ? <LinkFeld onClose={() => setLink(null)} onFertig={fertig} /> : null}
    </div>
  );
}
