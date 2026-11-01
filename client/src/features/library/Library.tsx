import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  bibliothekLeer,
  letzteNotizZeile,
  type Bibliothek,
  type BibliothekZeile,
} from '../../../../shared/features/library/index.ts';
import { HashIcon, PosteingangIcon, WeiterIcon } from '../../ui/icons.tsx';
import { ladeBibliothek, themaPfad } from './api.ts';
import { Kopf } from './Kopf.tsx';

function Zeile({ zeile, inbox, jetzt }: { zeile: BibliothekZeile; inbox: boolean; jetzt: Date }) {
  const ne = inbox ? 'Notes without a topic' : zeile.lastNote ? letzteNotizZeile(zeile.lastNote, jetzt) : '';
  return (
    <Link className="zeile" to={themaPfad(zeile.name)}>
      <span className="sym">{inbox ? <PosteingangIcon /> : <HashIcon />}</span>
      <span className="tx">
        <div className="ti">{zeile.name}</div>
        {ne ? <div className="ne">{ne}</div> : null}
      </span>
      <span className="wert">{zeile.count}</span>
      <WeiterIcon />
    </Link>
  );
}

export function LibraryAnsicht() {
  const [stand, setStand] = useState<Bibliothek | null>(null);
  const [fehler, setFehler] = useState(false);
  const jetzt = new Date();

  useEffect(() => {
    let aktiv = true;
    ladeBibliothek()
      .then((daten) => {
        if (aktiv) setStand(daten);
      })
      .catch(() => {
        if (aktiv) setFehler(true);
      })
      .finally(() => {
        if (aktiv) document.documentElement.dataset.bereit = '1';
      });
    return () => {
      aktiv = false;
    };
  }, []);

  const leer = stand ? bibliothekLeer(stand) : false;
  const themen = stand?.topics ?? [];

  return (
    <div className="app">
      <Kopf titel="Library" zurueck="/" zurueckLabel="Back to Capture" />
      <main className="inhalt">
        {fehler ? <p className="leer1">Could not load the library.</p> : null}
        {stand && leer ? <p className="leer1">No notes yet.</p> : null}
        {stand && !leer ? (
          <>
            <div className="liste anfang">
              <Zeile zeile={stand.inbox} inbox jetzt={jetzt} />
            </div>
            {themen.length > 0 ? (
              <>
                <h2 className="ab">Topics</h2>
                <div className="liste">
                  {themen.map((zeile) => (
                    <Zeile key={zeile.name} zeile={zeile} inbox={false} jetzt={jetzt} />
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
