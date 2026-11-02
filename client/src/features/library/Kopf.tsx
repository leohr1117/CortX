import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ZurueckIcon } from '../../ui/icons.tsx';

export function Kopf({
  titel,
  zurueck,
  zurueckLabel,
  aktion,
  onZurueck,
}: {
  titel?: string;
  zurueck: string;
  zurueckLabel: string;
  aktion?: ReactNode;
  onZurueck?: () => void;
}) {
  return (
    <header className="kopf">
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
