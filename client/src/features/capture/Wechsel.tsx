import { Fragment, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { neuesThemaZeile, sucheThemen } from '../../../../shared/features/topics/index.ts';
import { gleicherName } from '../../../../shared/features/tags/index.ts';
import { INBOX_NAME } from '../../../../shared/kern/grenzen.ts';
import type { Thema } from '../../../../shared/kern/modell.ts';
import { HakenIcon, HashIcon, LupeIcon, PlusIcon, PosteingangIcon, SchliessenIcon } from '../../ui/icons.tsx';

function zeilenAus(suche: string, themen: Thema[]) {
  const liste = sucheThemen(suche, themen);
  const neu = neuesThemaZeile(suche, themen);
  return {
    liste,
    zeilen: [
      ...liste.map((thema) => ({ key: thema.name, name: thema.name, neu: false, count: thema.count })),
      ...(neu ? [{ key: `neu:${neu}`, name: neu, neu: true, count: null as number | null }] : []),
    ],
  };
}

export function Wechsel({
  themen,
  aktuell,
  hinweis,
  gesperrt,
  onSchliessen,
  onWahl,
}: {
  themen: Thema[];
  aktuell: string;
  hinweis: string | null;
  gesperrt: boolean;
  onSchliessen: () => void;
  onWahl: (name: string) => void;
}) {
  const [suche, setSuche] = useState('');
  const [aktiv, setAktiv] = useState(0);
  const [angefasst, setAngefasst] = useState(false);
  const feld = useRef<HTMLInputElement>(null);
  const { liste, zeilen } = zeilenAus(suche, themen);
  const index = zeilen.length === 0 ? 0 : Math.min(aktiv, zeilen.length - 1);

  useEffect(() => {
    feld.current?.focus();
  }, []);

  useEffect(() => {
    if (suche.length > 0 || angefasst) return;
    const start = sucheThemen('', themen).findIndex((thema) => gleicherName(thema.name, aktuell));
    if (start >= 0) setAktiv(start);
  }, [themen, aktuell, suche, angefasst]);

  useEffect(() => {
    const taste = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onSchliessen();
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [onSchliessen]);

  function beiSuche(wert: string) {
    setSuche(wert);
    setAngefasst(false);
    const treffer = sucheThemen(wert, themen);
    const gefunden = treffer.findIndex((thema) => gleicherName(thema.name, aktuell));
    setAktiv(gefunden >= 0 ? gefunden : 0);
  }

  function waehle(stelle: number) {
    if (gesperrt) return;
    const zeile = zeilen[stelle];
    if (!zeile) return;
    onWahl(zeile.name);
  }

  function taste(event: KeyboardEvent<HTMLInputElement>) {
    if (zeilen.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setAngefasst(true);
      setAktiv(Math.min(zeilen.length - 1, index + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setAngefasst(true);
      setAktiv(Math.max(0, index - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      waehle(index);
    }
  }

  return (
    <section className="blatt" role="dialog" aria-modal="true" aria-labelledby="wechsel-titel">
      <div className="griff" aria-hidden="true" />
      <div className="bk">
        <h2 id="wechsel-titel">Move note to</h2>
        <button type="button" className="ib" aria-label="Close" onClick={onSchliessen}>
          <SchliessenIcon />
        </button>
      </div>
      <label className="suche">
        <LupeIcon />
        <input
          ref={feld}
          value={suche}
          placeholder="Search topics"
          aria-label="Search topics"
          aria-controls="wechsel-liste"
          aria-expanded={zeilen.length > 0}
          aria-activedescendant={zeilen.length > 0 ? `wechsel-${index}` : undefined}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => beiSuche(event.target.value)}
          onKeyDown={taste}
        />
      </label>
      {hinweis ? <p className="hinweis">{hinweis}</p> : null}
      <div className="wl" id="wechsel-liste" role="listbox" aria-label="Topics">
        {zeilen.map((zeile, stelle) => {
          const gewaehlt = !zeile.neu && gleicherName(zeile.name, aktuell);
          const tastatur = angefasst && stelle === index;
          const davorNeu = zeile.neu && liste.length > 0 && stelle === liste.length;
          return (
            <Fragment key={zeile.key}>
              {davorNeu ? <div className="tr" /> : null}
              <div
                id={`wechsel-${stelle}`}
                role="option"
                aria-selected={gewaehlt}
                className={['wz', gewaehlt ? 'sel' : '', tastatur ? 'akt' : ''].filter(Boolean).join(' ')}
                onClick={() => waehle(stelle)}
              >
                <span className="sym">
                  {zeile.neu ? <PlusIcon /> : gleicherName(zeile.name, INBOX_NAME) ? <PosteingangIcon /> : <HashIcon />}
                </span>
                <span className="n">{zeile.neu ? `New topic “${zeile.name}”` : zeile.name}</span>
                {gewaehlt ? <HakenIcon /> : zeile.neu ? null : <span className="w">{zeile.count}</span>}
              </div>
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}
