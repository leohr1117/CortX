import { useLayoutEffect, useRef, useState } from 'react';
import { EditorState, type Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  schalteCode,
  schalteFett,
  schalteHaken,
  schalteKursiv,
  schalteListe,
  schalteStrich,
  schalteUeberschrift,
  schalteVerknuepfung,
  type TextWahl,
} from '../../../../shared/features/format/index.ts';
import type { FormatBefehl } from './Leiste.tsx';
import { Leiste } from './Leiste.tsx';
import { LinkFeld } from './LinkFeld.tsx';
import { baueSpiegel, setzeUngueltig, setzeWahl } from './spiegel.ts';

interface Bereich {
  start: number;
  ende: number;
}

function wende(befehl: FormatBefehl, text: string, start: number, ende: number, ziel = ''): TextWahl {
  if (befehl === 'fett') return schalteFett(text, start, ende);
  if (befehl === 'kursiv') return schalteKursiv(text, start, ende);
  if (befehl === 'strich') return schalteStrich(text, start, ende);
  if (befehl === 'code') return schalteCode(text, start, ende);
  if (befehl === 'liste') return schalteListe(text, start, ende);
  if (befehl === 'haken') return schalteHaken(text, start, ende);
  if (befehl === 'link') return schalteVerknuepfung(text, start, ende, ziel);
  return schalteUeberschrift(text, start, ende);
}

export function Editor({
  text,
  onText,
  ungueltig = false,
}: {
  text: string;
  onText: (text: string) => void;
  ungueltig?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const fachRef = useRef<Compartment | null>(null);
  const onTextRef = useRef(onText);
  const textRef = useRef(text);
  const gemeldet = useRef(text);
  const [view, setView] = useState<EditorView | null>(null);
  const [stand, setStand] = useState(0);
  const [link, setLink] = useState<Bereich | null>(null);
  onTextRef.current = onText;
  textRef.current = text;

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
      },
      onLink: () => {
        const editor = viewRef.current;
        if (!editor) return;
        const sel = editor.state.selection.main;
        setLink({ start: sel.from, ende: sel.to });
      },
    });
    const editor = new EditorView({
      parent: el,
      state: EditorState.create({ doc: anfang, extensions: erweiterungen }),
    });
    (editor.dom as HTMLElement & { cm?: EditorView }).cm = editor;
    viewRef.current = editor;
    fachRef.current = fach;
    setView(editor);
    editor.focus();
    const ende = editor.state.doc.length;
    editor.dispatch({ selection: { anchor: ende } });
    return () => {
      lebend = false;
      editor.destroy();
      viewRef.current = null;
      fachRef.current = null;
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
    if (name === 'link') {
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
      <Leiste view={view} stand={stand} onBefehl={befehl} />
      {link ? <LinkFeld onClose={() => setLink(null)} onFertig={fertig} /> : null}
    </div>
  );
}
