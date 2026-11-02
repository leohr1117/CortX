import { useEffect, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { MarkerIcon } from '../../ui/icons.tsx';
import { leseDruck, type Druck } from './druck.ts';

export type FormatBefehl =
  | 'fett'
  | 'kursiv'
  | 'strich'
  | 'code'
  | 'ueberschrift'
  | 'liste'
  | 'haken'
  | 'wichtig'
  | 'link';

const LEER: Druck = {
  fett: false,
  kursiv: false,
  strich: false,
  code: false,
  link: false,
  ueberschrift: false,
  liste: false,
  haken: false,
  wichtig: false,
};

const KNOEPFE: ReadonlyArray<{ befehl: FormatBefehl; name: string; zeichen: string; klasse?: string }> = [
  { befehl: 'fett', name: 'Bold', zeichen: 'B', klasse: 'fett' },
  { befehl: 'kursiv', name: 'Italic', zeichen: 'I', klasse: 'kursiv' },
  { befehl: 'strich', name: 'Strikethrough', zeichen: 'S', klasse: 'strich' },
  { befehl: 'wichtig', name: 'Wichtig', zeichen: '' },
  { befehl: 'code', name: 'Code', zeichen: '</>' },
  { befehl: 'ueberschrift', name: 'Heading', zeichen: 'H' },
  { befehl: 'liste', name: 'List', zeichen: '•' },
  { befehl: 'haken', name: 'Checklist', zeichen: '☐' },
  { befehl: 'link', name: 'Link', zeichen: 'Link', klasse: 'breit' },
];

export function Leiste({
  view,
  stand,
  onBefehl,
}: {
  view: EditorView | null;
  stand: number;
  onBefehl: (befehl: FormatBefehl) => void;
}) {
  const [mobil, setMobil] = useState(false);
  const [unten, setUnten] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [druck, setDruck] = useState<Druck>(LEER);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)');
    const setze = () => setMobil(media.matches);
    setze();
    media.addEventListener('change', setze);
    return () => media.removeEventListener('change', setze);
  }, []);

  useEffect(() => {
    if (!mobil) return;
    const sicht = window.visualViewport;
    if (!sicht) return;
    const setze = () => setUnten(Math.max(0, Math.round(window.innerHeight - sicht.height - sicht.offsetTop)));
    setze();
    sicht.addEventListener('resize', setze);
    sicht.addEventListener('scroll', setze);
    return () => {
      sicht.removeEventListener('resize', setze);
      sicht.removeEventListener('scroll', setze);
    };
  }, [mobil]);

  useEffect(() => {
    if (!view) return;
    const sel = view.state.selection.main;
    setDruck(leseDruck(view.state.doc.toString(), sel.from, sel.to));
    if (mobil) {
      setPos({ top: 0, left: 0 });
      return;
    }
    if (sel.empty) {
      setPos(null);
      return;
    }
    const coords = view.coordsAtPos(sel.head);
    if (!coords) {
      setPos(null);
      return;
    }
    const breite = 420;
    const left = Math.max(8, Math.min(coords.left, window.innerWidth - breite - 8));
    const top = coords.top > 64 ? coords.top - 52 : coords.bottom + 8;
    setPos({ top, left });
  }, [view, stand, mobil]);

  if (!view || !pos) return null;
  const stil = mobil
    ? { bottom: `calc(${unten}px + env(safe-area-inset-bottom))` }
    : { top: pos.top, left: pos.left };
  return (
    <div
      className={mobil ? 'format-leiste mobil' : 'format-leiste schwebend'}
      role="toolbar"
      aria-label="Format"
      style={stil}
    >
      {KNOEPFE.map((knopf) => {
        const an = knopf.befehl === 'link' ? false : druck[knopf.befehl];
        return (
          <button
            key={knopf.befehl}
            type="button"
            className={['schalt', knopf.klasse, an ? 'an' : ''].filter(Boolean).join(' ')}
            aria-label={knopf.name}
            aria-pressed={knopf.befehl === 'link' ? undefined : an}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onBefehl(knopf.befehl)}
          >
            {knopf.befehl === 'wichtig' ? <MarkerIcon /> : knopf.zeichen}
          </button>
        );
      })}
    </div>
  );
}
