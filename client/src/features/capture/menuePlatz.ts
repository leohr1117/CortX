import { useLayoutEffect, useState, type RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { VORSCHLAG_BREITE } from '../../../../shared/kern/grenzen.ts';
import { HINDERNIS, LAGE, beobachteSicht, liesSicht, listenPlatz } from '../../ui/lage.ts';

export function useMenuePlatz(
  offen: boolean,
  start: number,
  text: string,
  sichtRef: RefObject<EditorView | null>,
): { top: number; left: number; maxHoehe: number } {
  const [pos, setPos] = useState<{ top: number; left: number; maxHoehe: number }>({
    top: 0,
    left: 0,
    maxHoehe: LAGE.listeMaxPx,
  });
  useLayoutEffect(() => {
    if (!offen || start < 0) return;
    const editor = sichtRef.current;
    if (!editor) return;
    const setze = () => {
      const stelle = editor.coordsAtPos(start);
      if (!stelle) return;
      const sicht = liesSicht();
      const leiste = document.querySelector(HINDERNIS.leiste);
      const leisteOben =
        leiste instanceof HTMLElement && leiste.getBoundingClientRect().height > 0
          ? leiste.getBoundingClientRect().top
          : sicht.sichtVersatz + sicht.sichtHoehe;
      const platz = listenPlatz(
        sicht.sichtVersatz,
        leisteOben,
        stelle.top,
        stelle.bottom,
        LAGE.listeMaxPx,
        LAGE.listeMinPx,
        LAGE.listeLueckePx,
      );
      const left = Math.round(
        Math.min(Math.max(8, stelle.left), Math.max(8, window.innerWidth - VORSCHLAG_BREITE - 8)),
      );
      setPos((alt) =>
        alt.top === platz.top && alt.left === left && alt.maxHoehe === platz.maxHoehe
          ? alt
          : { top: platz.top, left, maxHoehe: platz.maxHoehe },
      );
    };
    const stoppe = beobachteSicht(setze);
    editor.scrollDOM.addEventListener('scroll', setze);
    return () => {
      stoppe();
      editor.scrollDOM.removeEventListener('scroll', setze);
    };
  }, [offen, start, text, sichtRef]);
  return pos;
}
