import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import { SchliessenIcon } from './icons.tsx';
import { LAGE, LAGE_VAR, beobachteSicht, fixedFolgtSicht, hindernisOben, kartenHubPx, liesSicht } from './lage.ts';

export const KARTE_DAUER_OHNE_MS = 5000;
export const KARTE_DAUER_MIT_MS = 8000;
export const KARTE_ABSTAND_PX = LAGE.karteAbstandPx;
export const KARTE_BREITE_PX = 480;
export const KARTE_TREFFER_PX = 48;
export const KARTE_WISCHEN_PX = 80;

export const KARTE_TEXT = {
  seiteGeloescht: 'Page deleted',
  rueckgaengig: 'Undo',
  schliessen: 'Close',
} as const;

export function karteDauer(hatAktion: boolean): number {
  return hatAktion ? KARTE_DAUER_MIT_MS : KARTE_DAUER_OHNE_MS;
}

export interface KarteAktion {
  text: string;
  run: () => void;
}

interface Karte {
  id: number;
  text: string;
  aktion: KarteAktion | null;
}

let karte: Karte | null = null;
let lauf = 0;
const hoerer = new Set<() => void>();

function melde(): void {
  for (const fn of hoerer) fn();
}

function abonniere(fn: () => void): () => void {
  hoerer.add(fn);
  return () => hoerer.delete(fn);
}

function leseKarte(): Karte | null {
  return karte;
}

export function zeigeKarte(text: string, aktion?: KarteAktion): void {
  lauf += 1;
  karte = { id: lauf, text, aktion: aktion ?? null };
  melde();
}

export function schliesseKarte(): void {
  if (!karte) return;
  karte = null;
  melde();
}

function KarteAnsicht({ eintrag }: { eintrag: Karte }) {
  const rest = useRef(karteDauer(eintrag.aktion !== null));
  const start = useRef(0);
  const timer = useRef<number | null>(null);
  const pausiert = useRef(false);
  const finger = useRef<{ x: number; y: number } | null>(null);
  const [hub, setHub] = useState(0);
  const [zug, setZug] = useState({ x: 0, y: 0 });

  function stoppe(): void {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
  }

  function starte(): void {
    stoppe();
    start.current = Date.now();
    timer.current = window.setTimeout(() => schliesseKarte(), rest.current);
  }

  function pause(): void {
    if (pausiert.current || timer.current === null) return;
    pausiert.current = true;
    rest.current = Math.max(0, rest.current - (Date.now() - start.current));
    stoppe();
  }

  function weiter(): void {
    if (!pausiert.current) return;
    pausiert.current = false;
    starte();
  }

  useEffect(() => {
    rest.current = karteDauer(eintrag.aktion !== null);
    pausiert.current = false;
    starte();
    function esc(event: KeyboardEvent): void {
      if (event.key === 'Escape') schliesseKarte();
    }
    window.addEventListener('keydown', esc);
    return () => {
      stoppe();
      window.removeEventListener('keydown', esc);
    };
  }, [eintrag.id, eintrag.aktion]);

  useLayoutEffect(() => {
    return beobachteSicht(() => {
      const sicht = liesSicht();
      const naechster = kartenHubPx(sicht, hindernisOben(), LAGE.karteAbstandPx, fixedFolgtSicht(sicht));
      setHub((alt) => (alt === naechster ? alt : naechster));
    });
  }, []);

  function beiStart(event: PointerEvent<HTMLDivElement>): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    finger.current = { x: event.clientX, y: event.clientY };
  }

  function beiBeweg(event: PointerEvent<HTMLDivElement>): void {
    if (!finger.current) return;
    const dx = event.clientX - finger.current.x;
    const dy = event.clientY - finger.current.y;
    if (Math.abs(dx) >= Math.abs(dy)) setZug({ x: dx, y: 0 });
    else setZug({ x: 0, y: Math.max(0, dy) });
  }

  function beiEnde(): void {
    if (Math.abs(zug.x) >= KARTE_WISCHEN_PX || zug.y >= KARTE_WISCHEN_PX) schliesseKarte();
    setZug({ x: 0, y: 0 });
    finger.current = null;
  }

  const schieben = `translateX(calc(-50% + ${zug.x}px)) translateY(${zug.y}px)`;

  return (
    <div
      className="karte-ort"
      style={{ [LAGE_VAR.karteHub as string]: hub > 0 ? `${hub}px` : undefined, transform: schieben }}
      onPointerDown={beiStart}
      onPointerMove={beiBeweg}
      onPointerUp={beiEnde}
      onPointerCancel={beiEnde}
    >
      <div
        className="karte"
        role="status"
        aria-live="polite"
        onPointerEnter={pause}
        onPointerLeave={weiter}
        onFocus={pause}
        onBlur={weiter}
      >
        <span className="t">{eintrag.text}</span>
        {eintrag.aktion ? (
          <button
            type="button"
            className="a"
            onClick={() => {
              const laufAktion = eintrag.aktion;
              schliesseKarte();
              laufAktion?.run();
            }}
          >
            {eintrag.aktion.text}
          </button>
        ) : null}
        <button type="button" className="x" aria-label={KARTE_TEXT.schliessen} onClick={() => schliesseKarte()}>
          <SchliessenIcon />
        </button>
      </div>
    </div>
  );
}

export function KartenHost() {
  const aktuell = useSyncExternalStore(abonniere, leseKarte, leseKarte);
  if (!aktuell) return null;
  return <KarteAnsicht key={aktuell.id} eintrag={aktuell} />;
}
