import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ZurueckIcon } from '../../ui/icons.tsx';

const FENSTER_KANTE = 2;

function kanteGleich(innen: number, aussen: number): boolean {
  return Math.abs(innen - aussen) <= FENSTER_KANTE;
}

function fensterIpad(): boolean {
  if (typeof window === 'undefined') return false;
  const flaeche = window.screen;
  const breite = flaeche?.width ?? 0;
  const hoehe = flaeche?.height ?? 0;
  if (breite <= 0 || hoehe <= 0) return false;
  const innenB = window.innerWidth;
  const innenH = window.innerHeight;
  const gerade = kanteGleich(innenB, breite) && kanteGleich(innenH, hoehe);
  const gedreht = kanteGleich(innenB, hoehe) && kanteGleich(innenH, breite);
  return !(gerade || gedreht);
}

function useFenster(aktiv: boolean): boolean {
  const [an, setAn] = useState(() => aktiv && fensterIpad());
  useEffect(() => {
    if (!aktiv) {
      setAn(false);
      return;
    }
    const neu = () => setAn(fensterIpad());
    neu();
    const sicht = window.visualViewport;
    sicht?.addEventListener('resize', neu);
    window.addEventListener('resize', neu);
    return () => {
      sicht?.removeEventListener('resize', neu);
      window.removeEventListener('resize', neu);
    };
  }, [aktiv]);
  return an;
}

export function Kopf({
  titel,
  zurueck,
  zurueckLabel,
  aktion,
  onZurueck,
  fenster = false,
}: {
  titel?: string;
  zurueck: string;
  zurueckLabel: string;
  aktion?: ReactNode;
  onZurueck?: () => void;
  fenster?: boolean;
}) {
  const ipad = useFenster(fenster);
  return (
    <header className={ipad ? 'kopf fenster-ipad' : 'kopf'}>
      <div className="spalte">
        {onZurueck ? (
          <button type="button" className="ib" aria-label={zurueckLabel} onClick={onZurueck}>
            <ZurueckIcon />
          </button>
        ) : (
          <Link className="ib" to={zurueck} aria-label={zurueckLabel}>
            <ZurueckIcon />
          </Link>
        )}
        {titel ? <h1>{titel}</h1> : <span className="kopf-rest" />}
        {aktion}
      </div>
    </header>
  );
}
