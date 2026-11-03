import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FocusEvent, type PointerEvent } from 'react';
import { SchliessenIcon } from './icons.tsx';
import {
  KARTE_TEXT,
  pausiereLauf,
  setzeLaufFort,
  starteLauf,
  wischSchliesst,
  type KarteAktion,
  type KartenLauf,
} from './kartenregister.ts';
import { LAGE, LAGE_VAR, beobachteSicht, fixedFolgtSicht, hindernisOben, kartenHubPx, liesSicht } from './lage.ts';

export {
  KARTE_TEXT,
  aktionRueckgaengig,
  textHinzugefuegt,
  textThemaWeg,
  textThemaZusammen,
} from './kartenregister.ts';

interface Karte {
  id: number;
  text: string;
  aktion: KarteAktion | null;
  schluessel: string | null;
}

let karte: Karte | null = null;
let lauf = 0;
const verworfen = new Set<string>();
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

function zeile(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function zeigeKarte(text: string, aktion?: KarteAktion, schluessel?: string): void {
  const textZeile = zeile(text);
  if (textZeile.length === 0) return;
  const key = schluessel ?? null;
  if (key && verworfen.has(key)) return;
  const label = aktion?.text ?? null;
  if (karte && karte.text === textZeile && karte.schluessel === key && (karte.aktion?.text ?? null) === label) {
    karte = { ...karte, aktion: aktion ?? null };
    melde();
    return;
  }
  lauf += 1;
  karte = { id: lauf, text: textZeile, aktion: aktion ?? null, schluessel: key };
  melde();
}

export function schliesseKarte(grund: 'weg' | 'aktion' = 'weg'): void {
  if (!karte) return;
  if (grund === 'weg' && karte.schluessel) verworfen.add(karte.schluessel);
  karte = null;
  melde();
}

function KarteAnsicht({ eintrag }: { eintrag: Karte }) {
  const laufRef = useRef<KartenLauf>(starteLauf(eintrag.aktion !== null, Date.now()));
  const timer = useRef<number | null>(null);
  const grund = useRef({ zeiger: false, fokus: false });
  const finger = useRef<{ x: number; y: number } | null>(null);
  const zug = useRef({ x: 0, y: 0 });
  const gezogen = useRef(false);
  const loslass = useRef<(() => void) | null>(null);
  const [hub, setHub] = useState(0);
  const [versatz, setVersatz] = useState({ x: 0, y: 0 });

  function stoppe(): void {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
  }

  function starte(): void {
    stoppe();
    timer.current = window.setTimeout(() => schliesseKarte('weg'), laufRef.current.restMs);
  }

  function halte(): void {
    const jetzt = Date.now();
    const aktiv = grund.current.zeiger || grund.current.fokus;
    if (aktiv) {
      if (!laufRef.current.pausiert) {
        laufRef.current = pausiereLauf(laufRef.current, jetzt);
        stoppe();
      }
      return;
    }
    if (!laufRef.current.pausiert) return;
    laufRef.current = setzeLaufFort(laufRef.current, jetzt);
    starte();
  }

  useEffect(() => {
    laufRef.current = starteLauf(eintrag.aktion !== null, Date.now());
    grund.current = { zeiger: false, fokus: false };
    starte();
    const esc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      schliesseKarte('weg');
    };
    window.addEventListener('keydown', esc);
    return () => {
      stoppe();
      loslass.current?.();
      window.removeEventListener('keydown', esc);
    };
  }, [eintrag.id]);

  useLayoutEffect(() => {
    return beobachteSicht(() => {
      const sicht = liesSicht();
      const naechster = kartenHubPx(sicht, hindernisOben(), LAGE.karteAbstandPx, fixedFolgtSicht(sicht));
      setHub((alt) => (alt === naechster ? alt : naechster));
    });
  }, []);

  function beiStart(event: PointerEvent<HTMLDivElement>): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    loslass.current?.();
    finger.current = { x: event.clientX, y: event.clientY };
    zug.current = { x: 0, y: 0 };
    gezogen.current = false;
    const beweg = (ev: globalThis.PointerEvent) => {
      if (!finger.current) return;
      const dx = ev.clientX - finger.current.x;
      const dy = ev.clientY - finger.current.y;
      const naechster = Math.abs(dx) >= Math.abs(dy) ? { x: dx, y: 0 } : { x: 0, y: Math.max(0, dy) };
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) gezogen.current = true;
      zug.current = naechster;
      setVersatz(naechster);
    };
    const ende = () => {
      window.removeEventListener('pointermove', beweg);
      window.removeEventListener('pointerup', ende);
      window.removeEventListener('pointercancel', ende);
      if (loslass.current === ende) loslass.current = null;
      if (wischSchliesst(zug.current.x, zug.current.y)) schliesseKarte('weg');
      zug.current = { x: 0, y: 0 };
      finger.current = null;
      setVersatz({ x: 0, y: 0 });
    };
    loslass.current = ende;
    window.addEventListener('pointermove', beweg);
    window.addEventListener('pointerup', ende);
    window.addEventListener('pointercancel', ende);
  }

  function beiFokus(): void {
    grund.current.fokus = true;
    halte();
  }

  function beiBlur(event: FocusEvent<HTMLDivElement>): void {
    const nach = event.relatedTarget;
    if (nach instanceof Node && event.currentTarget.contains(nach)) return;
    grund.current.fokus = false;
    halte();
  }

  function beiEnter(): void {
    grund.current.zeiger = true;
    halte();
  }

  function beiLeave(): void {
    grund.current.zeiger = false;
    halte();
  }

  function fuehreAus(): void {
    if (gezogen.current) return;
    const laufAktion = eintrag.aktion;
    schliesseKarte('aktion');
    laufAktion?.run();
  }

  const schieben = `translateX(calc(-50% + ${versatz.x}px)) translateY(${versatz.y}px)`;

  return (
    <div
      className="karte-ort"
      style={{ [LAGE_VAR.karteHub as string]: hub > 0 ? `${hub}px` : undefined, transform: schieben }}
    >
      <div
        className="karte"
        role="status"
        aria-live="polite"
        onPointerDown={beiStart}
        onPointerEnter={beiEnter}
        onPointerLeave={beiLeave}
        onFocus={beiFokus}
        onBlur={beiBlur}
      >
        <span className="t">{eintrag.text}</span>
        {eintrag.aktion ? (
          <button type="button" className="a" onClick={fuehreAus}>
            {eintrag.aktion.text}
          </button>
        ) : null}
        <button type="button" className="x" aria-label={KARTE_TEXT.schliessen} onClick={() => schliesseKarte('weg')}>
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
