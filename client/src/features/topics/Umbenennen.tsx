import { useEffect, useRef, useState, type FormEvent } from 'react';
import { pflegeMeldung, planeUmbenennen } from '../../../../shared/features/topics/index.ts';
import { TOPIC_NAME_MAX } from '../../../../shared/kern/grenzen.ts';
import type { Thema } from '../../../../shared/kern/modell.ts';
import { SchliessenIcon } from '../../ui/icons.tsx';
import { benenneUm, PflegeFehler } from './api.ts';

export function Umbenennen({
  name,
  themen,
  onClose,
  onSaved,
}: {
  name: string;
  themen: readonly Thema[];
  onClose: () => void;
  onSaved: (neu: string) => void;
}) {
  const [wert, setWert] = useState(name);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const feld = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = feld.current;
    if (!el) return;
    el.focus();
    const ende = el.value.length;
    el.setSelectionRange(ende, ende);
  }, []);

  useEffect(() => {
    const taste = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || speichert) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [onClose, speichert]);

  async function speichern() {
    if (speichert) return;
    const namen = [name, ...themen.map((thema) => thema.name)];
    const plan = planeUmbenennen(name, wert, namen);
    if (!plan.ok) {
      setFehler(pflegeMeldung(plan.grund));
      return;
    }
    if (!plan.geaendert) {
      onSaved(plan.aktuell);
      return;
    }
    setSpeichert(true);
    try {
      const ergebnis = await benenneUm(name, plan.name);
      onSaved(ergebnis.topic);
    } catch (grund: unknown) {
      setFehler(grund instanceof PflegeFehler ? grund.message : 'Could not rename the topic.');
      setSpeichert(false);
    }
  }

  function senden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void speichern();
  }

  return (
    <section className="blatt" role="dialog" aria-modal="true" aria-labelledby="umbenennen-titel">
      <div className="griff" aria-hidden="true" />
      <div className="bk">
        <h2 id="umbenennen-titel">Rename topic</h2>
        <button type="button" className="ib" aria-label="Close" onClick={onClose} disabled={speichert}>
          <SchliessenIcon />
        </button>
      </div>
      <form noValidate onSubmit={senden}>
        <div className="bi">
          <label className="lab" htmlFor="thema-name">
            Name
          </label>
          <input
            ref={feld}
            id="thema-name"
            className="feld"
            value={wert}
            maxLength={TOPIC_NAME_MAX}
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
          <button type="submit" className="btn" disabled={speichert}>
            Save
          </button>
        </div>
      </form>
    </section>
  );
}
