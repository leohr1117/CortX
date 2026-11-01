import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ZurueckIcon } from '../../ui/icons.tsx';

export function Kopf({
  titel,
  zurueck,
  zurueckLabel,
  aktion,
}: {
  titel: string;
  zurueck: string;
  zurueckLabel: string;
  aktion?: ReactNode;
}) {
  return (
    <header className="kopf">
      <div className="spalte">
        <Link className="ib" to={zurueck} aria-label={zurueckLabel}>
          <ZurueckIcon />
        </Link>
        <h1>{titel}</h1>
        {aktion}
      </div>
    </header>
  );
}
