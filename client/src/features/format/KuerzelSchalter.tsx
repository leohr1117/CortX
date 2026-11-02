import { useEffect, useState } from 'react';
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
      <span className="mt">Convert shortcuts while typing</span>
      <span className="ne">{an ? 'On' : 'Off'}</span>
    </button>
  );
}
