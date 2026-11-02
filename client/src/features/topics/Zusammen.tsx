import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  filtereZiele,
  zieleFuerZusammenfuehren,
  zitier,
  zusammenHinweis,
} from '../../../../shared/features/topics/index.ts';
import type { Thema } from '../../../../shared/kern/modell.ts';
import { HashIcon, LupeIcon, SchliessenIcon } from '../../ui/icons.tsx';

export function Zusammen({
  name,
  anzahl,
  themen,
  fehler,
  gesperrt,
  onClose,
  onWahl,
}: {
  name: string;
  anzahl: number;
  themen: readonly Thema[];
  fehler: string | null;
  gesperrt: boolean;
  onClose: () => void;
  onWahl: (ziel: string) => void;
}) {
  const [suche, setSuche] = useState('');
  const [aktiv, setAktiv] = useState(0);
  const [tastatur, setTastatur] = useState(false);
  const feld = useRef<HTMLInputElement>(null);
  const ziele = filtereZiele(suche, zieleFuerZusammenfuehren(themen, name));
  const index = ziele.length === 0 ? 0 : Math.min(aktiv, ziele.length - 1);

  useEffect(() => {
    feld.current?.focus();
  }, []);

  useEffect(() => {
    const taste = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || gesperrt) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [onClose, gesperrt]);

  function waehle(stelle: number) {
    if (gesperrt) return;
    const zeile = ziele[stelle];
    if (!zeile) return;
    onWahl(zeile.name);
  }

  function taste(event: KeyboardEvent<HTMLInputElement>) {
    if (ziele.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setTastatur(true);
      setAktiv(Math.min(ziele.length - 1, index + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setTastatur(true);
      setAktiv(Math.max(0, index - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      waehle(index);
    }
  }

  return (
    <section className="blatt" role="dialog" aria-modal="true" aria-labelledby="zusammen-titel">
      <div className="griff" aria-hidden="true" />
      <div className="bk">
        <h2 id="zusammen-titel">Merge {zitier(name)} into</h2>
        <button type="button" className="ib" aria-label="Close" onClick={onClose} disabled={gesperrt}>
          <SchliessenIcon />
        </button>
      </div>
      <p className="bh">{zusammenHinweis(anzahl, name)}</p>
      {fehler ? <p className="hinweis">{fehler}</p> : null}
      <label className="suche">
        <LupeIcon />
        <input
          ref={feld}
          value={suche}
          placeholder="Search topics"
          aria-label="Search topics"
          aria-controls="zusammen-liste"
          aria-expanded={ziele.length > 0}
          aria-activedescendant={ziele.length > 0 ? `zusammen-${index}` : undefined}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setSuche(event.target.value);
            setAktiv(0);
            setTastatur(false);
          }}
          onKeyDown={taste}
        />
      </label>
      <div className="wl rolle" id="zusammen-liste" role="listbox" aria-label="Topics">
        {ziele.map((zeile, stelle) => (
          <div
            key={zeile.name}
            id={`zusammen-${stelle}`}
            role="option"
            aria-selected={false}
            className={tastatur && stelle === index ? 'wz akt' : 'wz'}
            onClick={() => waehle(stelle)}
          >
            <span className="sym">
              <HashIcon />
            </span>
            <span className="n">{zeile.name}</span>
            <span className="w">{zeile.count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
