import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import {
  HINDERNIS,
  LAGE,
  LAGE_VAR,
  beobachteSicht,
  fixedFolgtSicht,
  layoutHubPx,
  leisteBodenPx,
  liesSicht,
  sicherUntenPx,
  ueberlappPx,
} from '../../ui/lage.ts';
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
  const leisteRef = useRef<HTMLDivElement>(null);
  const [mobil, setMobil] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [druck, setDruck] = useState<Druck>(LEER);

  useLayoutEffect(() => {
    const media = window.matchMedia('(max-width: 899px)');
    const setze = () => setMobil(media.matches);
    setze();
    media.addEventListener('change', setze);
    return () => media.removeEventListener('change', setze);
  }, []);

  useLayoutEffect(() => {
    const wurzel = document.documentElement;
    const weg = () => {
      wurzel.style.removeProperty(LAGE_VAR.boden);
      wurzel.style.removeProperty(LAGE_VAR.hub);
      wurzel.style.removeProperty(LAGE_VAR.toast);
      wurzel.style.removeProperty(LAGE_VAR.ueberlapp);
    };
    if (!mobil || !view) {
      weg();
      return;
    }
    const app = view.dom.closest('.app');
    const stoppe = beobachteSicht(() => {
      const el = leisteRef.current;
      if (!el || !(app instanceof HTMLElement)) return;
      const sicht = liesSicht();
      const sicher = sicherUntenPx();
      const folgt = fixedFolgtSicht(sicht);
      const boden = leisteBodenPx(sicht, sicher, folgt);
      wurzel.style.setProperty(LAGE_VAR.boden, `${boden}px`);
      const leiste = el.getBoundingClientRect();
      wurzel.style.setProperty(LAGE_VAR.hub, `${layoutHubPx(sicht, sicher, leiste.height)}px`);
      const inhalt = view.dom.closest('.inhalt');
      const schreib = view.dom.closest('.schreib');
      const behaelter = inhalt instanceof HTMLElement ? inhalt : schreib;
      if (behaelter instanceof HTMLElement) {
        const ueber = ueberlappPx(behaelter.getBoundingClientRect().bottom, leiste.top, LAGE.leisteLueckePx);
        wurzel.style.setProperty(LAGE_VAR.ueberlapp, `${ueber}px`);
      }
      const fuss = app.querySelector(HINDERNIS.fuss);
      const kanten = [leiste.top];
      if (fuss instanceof HTMLElement && fuss.getBoundingClientRect().height > 0) {
        kanten.push(fuss.getBoundingClientRect().top);
      }
      const toast = ueberlappPx(app.getBoundingClientRect().bottom, Math.min(...kanten), LAGE.leisteLueckePx);
      wurzel.style.setProperty(LAGE_VAR.toast, `${toast}px`);
    });
    return () => {
      stoppe();
      weg();
    };
  }, [mobil, view]);

  useEffect(() => {
    if (!view) return;
    const sel = view.state.selection.main;
    setDruck(leseDruck(view.state.doc.toString(), sel.from, sel.to));
    if (mobil) return;
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

  if (!view || (!mobil && !pos)) return null;
  const stil = mobil || !pos ? undefined : { top: pos.top, left: pos.left };
  return (
    <div
      ref={leisteRef}
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
