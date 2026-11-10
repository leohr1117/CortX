import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import { packeDokument, pruefeDokument } from '../../../../shared/features/format/dokument.ts';
import { exportiere, importiere } from '../../../../shared/features/format/md.ts';
import { speichere } from '../../../../shared/features/format/speichern.ts';
import { liesEntwurf, schreibEntwurf } from '../offline/index.ts';

export function textVonDokument(doc: unknown): string {
  const knoten = pruefeDokument(doc);
  return knoten ? exportiere(knoten) : '';
}

export function packVonText(text: string): unknown {
  return packeDokument(importiere(text));
}

export function packVonEditor(view: EditorView | null, text: string): unknown {
  if (view) return packeDokument(view.state.doc);
  return packVonText(text);
}

function entwurfZuStand(roh: unknown): { text: string; doc: unknown } | null {
  if (typeof roh === 'string') {
    if (roh.length === 0) return null;
    return { text: roh, doc: packVonText(roh) };
  }
  const knoten = pruefeDokument(roh);
  if (!knoten) return null;
  const text = exportiere(knoten);
  if (text.length === 0) return null;
  return { text, doc: roh };
}

function packZumSchreiben(view: EditorView | null, text: string): unknown {
  if (text.length === 0) return '';
  if (view && speichere(view.state.doc) === text) return packeDokument(view.state.doc);
  return packVonText(text);
}

export function useEntwurfSync(
  text: string,
  view: EditorView | null,
  beruehrt: MutableRefObject<boolean>,
  rohRef: MutableRefObject<string>,
  uebernehme: (text: string, doc: unknown) => void,
  onBereit: () => void,
): void {
  const [bereit, setBereit] = useState(false);
  const zuletzt = useRef<string | null>(null);
  const uebernehmeRef = useRef(uebernehme);
  const onBereitRef = useRef(onBereit);
  uebernehmeRef.current = uebernehme;
  onBereitRef.current = onBereit;

  useEffect(() => {
    let aktiv = true;
    void liesEntwurf()
      .then((roh) => {
        if (!aktiv) return;
        const stand = entwurfZuStand(roh);
        if (stand && !beruehrt.current && rohRef.current.length === 0) uebernehmeRef.current(stand.text, stand.doc);
        setBereit(true);
        onBereitRef.current();
      })
      .catch(() => {
        if (!aktiv) return;
        setBereit(true);
        onBereitRef.current();
      });
    return () => {
      aktiv = false;
    };
  }, [beruehrt, rohRef]);

  useEffect(() => {
    if (!bereit) return;
    const inhalt = packZumSchreiben(view, text);
    const schluessel = typeof inhalt === 'string' ? inhalt : JSON.stringify(inhalt);
    if (zuletzt.current === schluessel) return;
    zuletzt.current = schluessel;
    void schreibEntwurf(inhalt).catch(() => undefined);
  }, [bereit, text, view]);
}
