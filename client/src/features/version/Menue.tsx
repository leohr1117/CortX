import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { entscheideUpdateHinweis, HINWEIS_TEXT } from '../../../../shared/features/version/index.ts';
import { TEXTE, versionsZeile } from '../../../../shared/kern/texte.ts';
import { AKTUELLE_VERSION } from '../../../../shared/versionen.ts';
import { PunkteIcon } from '../../ui/icons.tsx';
import { KuerzelSchalter } from '../format/index.ts';
import { ladeStand } from './api.ts';

export function BibliothekMenue() {
  const [offen, setOffen] = useState(false);
  const [punkt, setPunkt] = useState(false);
  const kasten = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let aktiv = true;
    void ladeStand()
      .then((stand) => {
        if (!aktiv) return;
        const entscheid = entscheideUpdateHinweis(
          { benachrichtigt: stand.notified, gesehen: stand.seen },
          AKTUELLE_VERSION,
          stand.fresh,
        );
        setPunkt(entscheid.badge);
      })
      .catch(() => undefined);
    return () => {
      aktiv = false;
    };
  }, []);

  useEffect(() => {
    if (!offen) return;
    const zu = (event: MouseEvent) => {
      if (!kasten.current?.contains(event.target as Node)) setOffen(false);
    };
    const taste = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOffen(false);
    };
    document.addEventListener('mousedown', zu);
    document.addEventListener('keydown', taste);
    return () => {
      document.removeEventListener('mousedown', zu);
      document.removeEventListener('keydown', taste);
    };
  }, [offen]);

  return (
    <div className="menue-anker" ref={kasten}>
      <button
        type="button"
        className={offen ? 'ib on' : 'ib'}
        aria-label={TEXTE.menueBibliothek}
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-controls={offen ? 'bibliothek-menue' : undefined}
        onClick={() => setOffen((wert) => !wert)}
      >
        <PunkteIcon />
        {punkt ? <span className="neu-punkt" data-neu-punkt="" aria-hidden="true" /> : null}
      </button>
      {offen ? (
        <div className="menue" id="bibliothek-menue" role="menu" aria-label={TEXTE.menueBibliothek}>
          <div className="stat" role="none" data-version={AKTUELLE_VERSION}>
            <span>{versionsZeile(AKTUELLE_VERSION)}</span>
          </div>
          <div className="tr" role="separator" />
          <div role="none">
            <KuerzelSchalter />
          </div>
          <div className="tr" role="separator" />
          <Link className="m" role="menuitem" to="/library/whats-new" onClick={() => setOffen(false)}>
            {HINWEIS_TEXT.neuigkeiten}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
