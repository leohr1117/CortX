import { useLayoutEffect, useState, type RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { VORSCHLAG_BREITE } from '../../../../shared/kern/grenzen.ts';

export function useMenuePlatz(
  offen: boolean,
  start: number,
  text: string,
  sichtRef: RefObject<EditorView | null>,
): { top: number; left: number } {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!offen || start < 0) return;
    const editor = sichtRef.current;
    if (!editor) return;
    const setze = () => {
      const stelle = editor.coordsAtPos(start);
      if (!stelle) return;
      const left = Math.round(
        Math.min(Math.max(8, stelle.left), Math.max(8, window.innerWidth - VORSCHLAG_BREITE - 8)),
      );
      const top = Math.round(stelle.bottom + 6);
      setPos((alt) => (alt.top === top && alt.left === left ? alt : { top, left }));
    };
    setze();
    editor.scrollDOM.addEventListener('scroll', setze);
    window.addEventListener('resize', setze);
    return () => {
      editor.scrollDOM.removeEventListener('scroll', setze);
      window.removeEventListener('resize', setze);
    };
  }, [offen, start, text, sichtRef]);
  return pos;
}
