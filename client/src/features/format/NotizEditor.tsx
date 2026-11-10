import { useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import { leistenEintraege } from '../../../../shared/features/format/index.ts';
import { Leiste } from './Leiste.tsx';
import { LinkFeld } from './LinkFeld.tsx';
import { ModellEditor } from './ModellEditor.tsx';
import { setzeZustand } from './modellLauf.ts';

export function NotizEditor({
  text,
  onText,
  dokument,
  onDokument,
  ungueltig = false,
}: {
  text: string;
  onText: (text: string) => void;
  dokument?: unknown;
  onDokument?: (doc: unknown) => void;
  ungueltig?: boolean;
}) {
  const [view, setView] = useState<EditorView | null>(null);
  const [stand, setStand] = useState(0);
  const [link, setLink] = useState(false);

  function fertig(ziel: string) {
    const editor = view;
    setLink(false);
    if (!editor) return;
    const eintrag = leistenEintraege().find((kandidat) => kandidat.knopf.ziel);
    const naechster = eintrag?.modell?.run(editor.state, ziel);
    if (!naechster || naechster === editor.state) return;
    setzeZustand(editor, naechster);
    setStand((wert) => wert + 1);
  }

  return (
    <>
      <ModellEditor
        modus="notiz"
        text={text}
        dokument={dokument}
        ungueltig={ungueltig}
        onText={onText}
        onDokument={onDokument}
        onAuswahl={() => setStand((wert) => wert + 1)}
        onLink={() => setLink(true)}
        ref={setView}
      />
      <Leiste view={view} stand={stand} modell onZiel={() => setLink(true)} />
      {link ? <LinkFeld onClose={() => setLink(false)} onFertig={fertig} /> : null}
    </>
  );
}
