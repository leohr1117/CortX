import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { leistenEintraege, type FormatBefehl } from '../../../../shared/features/format/index.ts';
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
      {leistenEintraege().map((eintrag) => {
        const knopf = eintrag.knopf;
        const an = knopf.gedrueckt ? druck[eintrag.id] : false;
        return (
          <button
            key={eintrag.id}
            type="button"
            className={['schalt', knopf.klasse, an ? 'an' : ''].filter(Boolean).join(' ')}
            aria-label={knopf.beschriftung}
            title={knopf.beschriftung}
            aria-pressed={knopf.gedrueckt ? an : undefined}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onBefehl(eintrag.id)}
          >
            {knopf.pfade ? <LeistenIcon pfade={knopf.pfade} /> : knopf.zeichen}
          </button>
        );
      })}
    </div>
  );
}
