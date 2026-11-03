import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import type { EditorView as SpiegelAnsicht } from '@codemirror/view';
import type { EditorView as ModellAnsicht } from 'prosemirror-view';
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

function LeistenIcon({ pfade }: { pfade: readonly string[] }) {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      {pfade.map((pfad) => (
        <path key={pfad} d={pfad} />
      ))}
    </svg>
  );
}

interface Spanne {
  empty: boolean;
  head: number;
  from: number;
  to: number;
}

interface SpiegelLeiste {
  view: SpiegelAnsicht | null;
  stand: number;
  onBefehl: (befehl: FormatBefehl) => void;
  modell?: false;
}

interface ModellLeiste {
  view: ModellAnsicht | null;
  stand: number;
  modell: true;
}

type LeistenProps = SpiegelLeiste | ModellLeiste;

type ModellModul = typeof import('./modellLauf.ts');

let modellModul: ModellModul | null = null;

function ladeModell(): Promise<ModellModul> {
  if (modellModul) return Promise.resolve(modellModul);
  return import('./modellLauf.ts').then((modul) => {
    modellModul = modul;
    return modul;
  });
}

function spanneVon(props: LeistenProps): Spanne | null {
  if (!props.view) return null;
  if (props.modell) {
    const sel = props.view.state.selection;
    return { empty: sel.empty, head: sel.head, from: sel.from, to: sel.to };
  }
  const sel = props.view.state.selection.main;
  return { empty: sel.empty, head: sel.head, from: sel.from, to: sel.to };
}

function kastenBei(props: LeistenProps, stelle: number): { left: number; top: number; bottom: number } | null {
  if (!props.view) return null;
  if (props.modell) return props.view.coordsAtPos(stelle);
  return props.view.coordsAtPos(stelle);
}

export function Leiste(props: LeistenProps) {
  const view = props.view;
  const stand = props.stand;
  const leisteRef = useRef<HTMLDivElement>(null);
  const [mobil, setMobil] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [tick, setTick] = useState(0);

  useLayoutEffect(() => {
    if (props.modell !== true) return;
    let lebend = true;
    void ladeModell().then(() => {
      if (lebend) setTick((wert) => wert + 1);
    });
    return () => { lebend = false; };
  }, [props.modell]);

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
    const sel = spanneVon(props);
    if (!view || !sel) return;
    if (mobil) return;
    if (sel.empty) {
      setPos(null);
      return;
    }
    const coords = kastenBei(props, sel.head);
    if (!coords) {
      setPos(null);
      return;
    }
    const breite = 420;
    const left = Math.max(8, Math.min(coords.left, window.innerWidth - breite - 8));
    const top = coords.top > 64 ? coords.top - 52 : coords.bottom + 8;
    setPos({ top, left });
  }, [view, stand, mobil, tick, props.modell]);

  if (!view || (!mobil && !pos)) return null;
  const stil = mobil || !pos ? undefined : { top: pos.top, left: pos.left };
  const sel = spanneVon(props);
  if (!sel) return null;
  const text = props.modell || !props.view ? '' : props.view.state.doc.toString();
  return (
    <div
      ref={leisteRef}
      className={mobil ? 'format-leiste mobil' : 'format-leiste schwebend'}
      role="toolbar"
      aria-label={TEXTE.format}
      style={stil}
    >
      {leistenEintraege().map((eintrag) => {
        const knopf = eintrag.knopf;
        const an = !knopf.gedrueckt
          ? false
          : props.modell
            ? (props.view ? (eintrag.modell?.isActive(props.view.state) ?? false) : false)
            : eintrag.isActive(text, sel.from, sel.to);
        return (
          <button
            key={eintrag.id}
            type="button"
            className={['schalt', knopf.klasse, an ? 'an' : ''].filter(Boolean).join(' ')}
            aria-label={knopf.beschriftung}
            title={knopf.beschriftung}
            aria-pressed={knopf.gedrueckt ? an : undefined}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              if (props.modell) {
                const ansicht = props.view;
                if (!ansicht) return;
                void ladeModell().then((modul) => {
                  modul.wendeModell(ansicht, eintrag.modell);
                  setTick((wert) => wert + 1);
                });
                return;
              }
              props.onBefehl(eintrag.id);
            }}
          >
            {knopf.pfade ? <LeistenIcon pfade={knopf.pfade} /> : knopf.zeichen}
          </button>
        );
      })}
    </div>
  );
}
