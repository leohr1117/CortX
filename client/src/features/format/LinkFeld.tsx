import { useEffect, useRef, useState, type FormEvent } from 'react';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import { createPortal } from 'react-dom';
import { SchliessenIcon } from '../../ui/icons.tsx';

export function LinkFeld({ onClose, onFertig }: { onClose: () => void; onFertig: (ziel: string) => void }) {
  const [wert, setWert] = useState<string>(TEXTE.linkAnfang);
  const [fehler, setFehler] = useState<string | null>(null);
  const feld = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = feld.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, el.value.length);
  }, []);

  useEffect(() => {
    const taste = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [onClose]);

  function senden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ziel = wert.trim();
    if (ziel.length === 0 || ziel === TEXTE.linkAnfang) {
      setFehler(TEXTE.linkEingeben);
      return;
    }
    onFertig(ziel);
  }

  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <section className="blatt" role="dialog" aria-modal="true" aria-labelledby="link-titel">
        <div className="griff" aria-hidden="true" />
        <div className="bk">
          <h2 id="link-titel">{TEXTE.link}</h2>
          <button type="button" className="ib" aria-label={TEXTE.schliessen} onClick={onClose}>
            <SchliessenIcon />
          </button>
        </div>
        <form noValidate onSubmit={senden}>
          <div className="bi">
            <label className="lab" htmlFor="link-ziel">
              {TEXTE.adresse}
            </label>
            <input
              ref={feld}
              id="link-ziel"
              className="feld"
              type="text"
              inputMode="url"
              value={wert}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={fehler ? true : undefined}
              onChange={(event) => {
                setWert(event.target.value);
                setFehler(null);
              }}
            />
            {fehler ? (
              <p className="feldfehler" role="alert">
                {fehler}
              </p>
            ) : null}
          </div>
          <div className="bf">
            <button type="submit" className="btn">
              {TEXTE.linkHinzufuegen}
            </button>
          </div>
        </form>
      </section>
    </>,
    document.body,
  );
}
