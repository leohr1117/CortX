import { useEffect, useState } from 'react';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import { kuerzelAn, setzeKuerzel } from './kuerzelSpeicher.ts';

export function KuerzelSchalter() {
  const [an, setAn] = useState(true);

  useEffect(() => {
    setAn(kuerzelAn());
  }, []);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={an}
      className="m schalter"
      onClick={() => {
        const neu = !kuerzelAn();
        setzeKuerzel(neu);
        setAn(neu);
      }}
    >
      <span className="mt">{TEXTE.kuerzel}</span>
      <span className="ne">{an ? TEXTE.an : TEXTE.aus}</span>
    </button>
  );
}
