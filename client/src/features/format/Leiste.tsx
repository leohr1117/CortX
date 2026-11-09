import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import type { EditorView as ModellAnsicht } from 'prosemirror-view';
import { leistenEintraege, type FormatBefehl } from '../../../../shared/features/format/index.ts';
import { formatImCodeblockGesperrt } from '../../../../shared/features/format/modellbefehl.ts';
import { NUMMER_KNOPF } from '../../../../shared/features/format/nummer.ts';
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

interface LeistenProps {
  view: ModellAnsicht | null;
  stand: number;
  modell: true;
  onZiel?: () => void;
  onModell?: (befehl: FormatBefehl) => void;
  nummern?: boolean;
}

type ModellModul = typeof import('./modellLauf.ts');

let modellModul: ModellModul | null = null;

function ladeModell(): Promise<ModellModul> {
  if (modellModul) return Promise.resolve(modellModul);
  return import('./modellLauf.ts').then((modul) => {
    modellModul = modul;
    return modul;
  });
}

function spanneVon(view: ModellAnsicht | null): Spanne | null {
  if (!view) return null;
  const sel = view.state.selection;
  return { empty: sel.empty, head: sel.head, from: sel.from, to: sel.to };
}

function macBefehl(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iP(hone|[oa]d)/.test(navigator.platform);
}

function tasteAnzeige(taste: string): { titel: string; aria: string } {
  const teile = taste.split('-');
  const zeichen = teile[teile.length - 1] ?? '';
  const mac = macBefehl();
  const name = (zeichen === '!' ? '1' : zeichen).toUpperCase();
  const schicht = teile.includes('Shift') || zeichen === '!';
  const titel = [
    teile.includes('Mod') ? (mac ? 'Cmd' : 'Ctrl') : '',
    teile.includes('Alt') ? (mac ? 'Option' : 'Alt') : '',
    schicht ? 'Shift' : '',
    name,
  ].filter((teil) => teil.length > 0);
  const aria = [
    teile.includes('Mod') ? (mac ? 'Meta' : 'Control') : '',
    teile.includes('Alt') ? 'Alt' : '',
    schicht ? 'Shift' : '',
    name,
  ].filter((teil) => teil.length > 0);
  return { titel: titel.join('+'), aria: aria.join('+') };
}

export function Leiste(props: LeistenProps) {
  const view = props.view;
  const stand = props.stand;
  const leisteRef = useRef<HTMLDivElement>(null);
  const [mobil, setMobil] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [tick, setTick] = useState(0);

  useLayoutEffect(() => {
    let lebend = true;
    void ladeModell().then(() => {
      if (lebend) setTick((wert) => wert + 1);
    });
    return () => { lebend = false; };
  }, []);

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
    const sel = spanneVon(view);
    if (!view || !sel) return;
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
  }, [view, stand, mobil, tick]);

  if (!view || (!mobil && !pos)) return null;
  const stil = mobil || !pos ? undefined : { top: pos.top, left: pos.left };
  const sel = spanneVon(view);
  if (!sel) return null;
  return (
    <div
      ref={leisteRef}
      className={['format-leiste', mobil ? 'mobil' : 'schwebend', props.modell ? 'modell' : ''].filter(Boolean).join(' ')}
      role="toolbar"
      aria-label={TEXTE.format}
      style={stil}
    >
      {leistenEintraege().map((eintrag) => {
        const knopf = eintrag.knopf;
        const an = !knopf.gedrueckt ? false : (eintrag.modell?.isActive(view.state) ?? false);
        const gesperrt = formatImCodeblockGesperrt(eintrag.id, view.state);
        const anzeige = knopf.taste ? tasteAnzeige(knopf.taste) : null;
        return (
          <button
            key={eintrag.id}
            type="button"
            className={['schalt', knopf.klasse, an ? 'an' : ''].filter(Boolean).join(' ')}
            aria-label={knopf.beschriftung}
            title={anzeige ? `${knopf.beschriftung} (${anzeige.titel})` : knopf.beschriftung}
            aria-keyshortcuts={anzeige?.aria}
            aria-pressed={knopf.gedrueckt ? an : undefined}
            aria-disabled={gesperrt ? true : undefined}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              if (formatImCodeblockGesperrt(eintrag.id, view.state)) return;
              if (eintrag.knopf.ziel) {
                props.onZiel?.();
                return;
              }
              if (props.onModell) {
                props.onModell(eintrag.id);
                setTick((wert) => wert + 1);
                return;
              }
              void ladeModell().then((modul) => {
                modul.wendeModell(view, eintrag.modell);
                setTick((wert) => wert + 1);
              });
            }}
          >
            {knopf.pfade ? <LeistenIcon pfade={knopf.pfade} /> : knopf.zeichen}
          </button>
        );
      })}
      {props.nummern !== false && view
        ? NUMMER_KNOPF.map((eintrag) => {
            const ansicht = props.view;
            if (!ansicht) return null;
            const name = TEXTE[eintrag.text];
            const an = modellModul?.nummerAn(ansicht.state, eintrag.art) ?? false;
            return (
              <button
                key={eintrag.art}
                type="button"
                className={['schalt', an ? 'an' : ''].filter(Boolean).join(' ')}
                aria-label={name}
                title={name}
                aria-pressed={an}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  void ladeModell().then((modul) => {
                    modul.wendeNummer(ansicht, eintrag.art);
                    setTick((wert) => wert + 1);
                  });
                }}
              >
                {eintrag.zeichen}
              </button>
            );
          })
        : null}
    </div>
  );
}
