import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { leseDruck, type Druck } from './druck.ts';

function LeistenIcon({ pfade }: { pfade: readonly string[] }) {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      {pfade.map((pfad) => (
        <path key={pfad} d={pfad} />
      ))}
    </svg>
  );
}

const WICHTIG_PFAD = ['M12 5v9', 'M12 19h.01'] as const;
const LISTE_PFAD = ['M3 6h.01', 'M3 12h.01', 'M3 18h.01', 'M8 6h13', 'M8 12h13', 'M8 18h13'] as const;
const HAKEN_PFAD = ['m3 7 2 2 4-4', 'm3 17 2 2 4-4', 'M13 6h8', 'M13 12h8', 'M13 18h8'] as const;

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

function zeichenVon(befehl: FormatBefehl): ReactNode {
  if (befehl === 'wichtig') return <LeistenIcon pfade={WICHTIG_PFAD} />;
  if (befehl === 'liste') return <LeistenIcon pfade={LISTE_PFAD} />;
  if (befehl === 'haken') return <LeistenIcon pfade={HAKEN_PFAD} />;
  return null;
}

const KNOEPFE: ReadonlyArray<{ befehl: FormatBefehl; name: string; zeichen: string; klasse?: string }> = [
  { befehl: 'fett', name: 'Bold', zeichen: 'B', klasse: 'fett' },
  { befehl: 'kursiv', name: 'Italic', zeichen: 'I', klasse: 'kursiv' },
  { befehl: 'strich', name: 'Strikethrough', zeichen: 'S', klasse: 'strich' },
  { befehl: 'wichtig', name: 'Important', zeichen: '' },
  { befehl: 'code', name: 'Code', zeichen: '</>' },
  { befehl: 'ueberschrift', name: 'Heading', zeichen: 'H' },
  { befehl: 'liste', name: 'Bulleted list', zeichen: '' },
  { befehl: 'haken', name: 'Checklist', zeichen: '' },
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
  const [sockel, setSockel] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [druck, setDruck] = useState<Druck>(LEER);

  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
    if (!mobil || !view) {
      setSockel(0);
      return;
    }
    const fuss = view.dom.closest('.app')?.querySelector('footer.fuss');
    if (!(fuss instanceof HTMLElement)) {
      setSockel(0);
      return;
    }
    const messe = () => {
      const sicht = window.visualViewport;
      const sichtUnten = sicht ? sicht.offsetTop + sicht.height : window.innerHeight;
      const naechster = Math.max(0, Math.round(sichtUnten - fuss.getBoundingClientRect().top));
      setSockel((alt) => (alt === naechster ? alt : naechster));
    };
    messe();
    const beobachter = new ResizeObserver(messe);
    beobachter.observe(fuss);
    const sicht = window.visualViewport;
    sicht?.addEventListener('resize', messe);
    sicht?.addEventListener('scroll', messe);
    window.addEventListener('resize', messe);
    return () => {
      beobachter.disconnect();
      sicht?.removeEventListener('resize', messe);
      sicht?.removeEventListener('scroll', messe);
      window.removeEventListener('resize', messe);
    };
  }, [mobil, view]);

  useLayoutEffect(() => {
    const wurzel = document.documentElement;
    if (sockel <= 0) {
      wurzel.style.removeProperty('--capture-leiste');
      return;
    }
    wurzel.style.setProperty('--capture-leiste', `${sockel}px`);
    return () => {
      wurzel.style.removeProperty('--capture-leiste');
    };
  }, [sockel]);

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
    ? {
        bottom:
          sockel > 0 ? `${unten + sockel}px` : `calc(${unten}px + env(safe-area-inset-bottom))`,
      }
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
            title={knopf.name}
            aria-pressed={knopf.befehl === 'link' ? undefined : an}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onBefehl(knopf.befehl)}
          >
            {zeichenVon(knopf.befehl) ?? knopf.zeichen}
          </button>
        );
      })}
    </div>
  );
}
