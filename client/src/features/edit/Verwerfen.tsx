import { useEffect, useRef } from 'react';

export function Verwerfen({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  const kasten = useRef<HTMLElement>(null);

  useEffect(() => {
    kasten.current?.focus();
    const taste = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onKeep();
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [onKeep]);

  return (
    <>
      <div className="scrim" onClick={onKeep} />
      <section
        className="dlg"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="verwerfen-titel"
        aria-describedby="verwerfen-text"
        tabIndex={-1}
        ref={kasten}
      >
        <h2 id="verwerfen-titel">Discard changes?</h2>
        <p id="verwerfen-text">Your edits to this note will be lost.</p>
        <div className="knoepfe">
          <button type="button" className="btn zweit" onClick={onKeep}>
            Keep editing
          </button>
          <button type="button" className="btn gefahr" onClick={onDiscard}>
            Discard
          </button>
        </div>
      </section>
    </>
  );
}
