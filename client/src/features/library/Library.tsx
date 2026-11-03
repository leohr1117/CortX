import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  bibliothekLeer,
  themaUnterzeile,
  type Bibliothek,
  type BibliothekZeile,
} from '../../../../shared/features/library/index.ts';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import { HashIcon, PosteingangIcon, WeiterIcon } from '../../ui/icons.tsx';
import { aktionRueckgaengig, textThemaWeg, textThemaZusammen, zeigeKarte } from '../../ui/karte.tsx';
import {
  liesGemerktePflege,
  liesPflegeMeldung,
  macheRueckgaengig,
  PflegeFehler,
  vergissPflege,
  type PflegeMeldung,
} from '../topics/index.ts';
import { Suchleiste, Trefferliste, sucheNotizen, type SuchTreffer } from '../suche/index.ts';
import { BibliothekMenue } from '../version/index.ts';
import { AbmeldenKnopf } from '../zugang/index.ts';
import { BIBLIOTHEK_NEU, ladeBibliothek, themaPfad } from './api.ts';
import { klickTipp, losTipp, merkTipp } from '../../ui/tipp.ts';
import { Kopf } from './Kopf.tsx';

function Zeile({ zeile, inbox, jetzt }: { zeile: BibliothekZeile; inbox: boolean; jetzt: Date }) {
  const ne = inbox ? TEXTE.ohneThema : themaUnterzeile(zeile, jetzt);
  return (
    <Link className="zeile" to={themaPfad(zeile.name)} onPointerDown={merkTipp} onPointerUp={losTipp} onClick={klickTipp}>
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
  const navigate = useNavigate();
  const ort = useLocation();
  const ausOrt = liesPflegeMeldung(ort.state);
  const [gemerkt, setGemerkt] = useState<PflegeMeldung | null>(liesGemerktePflege);
  const meldung = ausOrt ?? gemerkt;
  const [stand, setStand] = useState<Bibliothek | null>(null);
  const [fehler, setFehler] = useState(false);
  const [frage, setFrage] = useState('');
  const [treffer, setTreffer] = useState<SuchTreffer[] | null>(null);
  const [suchFehler, setSuchFehler] = useState(false);
  const [undoFehler, setUndoFehler] = useState<string | null>(null);
  const [machtRueck, setMachtRueck] = useState(false);
  const anfrage = useRef(0);
  const suchLauf = useRef(0);
  const jetzt = new Date();
  const sucht = frage.trim().length > 0;

  useEffect(() => {
    const id = anfrage.current + 1;
    anfrage.current = id;
    let aktiv = true;
    ladeBibliothek()
      .then((daten) => {
        if (aktiv && anfrage.current === id) setStand(daten);
      })
      .catch(() => {
        if (aktiv && anfrage.current === id) setFehler(true);
      })
      .finally(() => {
        if (aktiv) document.documentElement.dataset.bereit = '1';
      });
    return () => {
      aktiv = false;
    };
  }, []);

  useEffect(() => {
    function neu() {
      const id = anfrage.current + 1;
      anfrage.current = id;
      ladeBibliothek()
        .then((daten) => {
          if (anfrage.current === id) {
            setStand(daten);
            setFehler(false);
          }
        })
        .catch(() => {
          if (anfrage.current === id) setFehler(true);
        });
    }
    window.addEventListener(BIBLIOTHEK_NEU, neu);
    return () => window.removeEventListener(BIBLIOTHEK_NEU, neu);
  }, []);

  const rueckRef = useRef(rueckgaengig);
  rueckRef.current = rueckgaengig;
  const meldungRef = useRef(meldung);
  meldungRef.current = meldung;
  const token = meldung?.token ?? null;

  useEffect(() => {
    const aktuell = meldungRef.current;
    if (!aktuell || aktuell.token !== token) return;
    const text = undoFehler ?? (aktuell.art === 'deleted' ? textThemaWeg(aktuell.name) : textThemaZusammen(aktuell.name, aktuell.into ?? ''));
    zeigeKarte(text, aktionRueckgaengig(() => void rueckRef.current()), aktuell.token);
  }, [token, undoFehler]);

  useEffect(() => {
    const text = frage.trim();
    if (!text) return;
    const id = suchLauf.current + 1;
    suchLauf.current = id;
    let aktiv = true;
    sucheNotizen(text)
      .then((liste) => {
        if (aktiv && suchLauf.current === id) {
          setTreffer(liste);
          setSuchFehler(false);
        }
      })
      .catch(() => {
        if (aktiv && suchLauf.current === id) setSuchFehler(true);
      });
    return () => {
      aktiv = false;
    };
  }, [frage]);

  function beiSuche(wert: string) {
    setFrage(wert);
    setTreffer(null);
    setSuchFehler(false);
  }

  async function rueckgaengig() {
    if (!meldung || machtRueck) return;
    setMachtRueck(true);
    try {
      await macheRueckgaengig(meldung.token);
    } catch (grund: unknown) {
      setUndoFehler(grund instanceof PflegeFehler ? grund.message : TEXTE.nichtRueck);
      setMachtRueck(false);
      return;
    }
    const id = anfrage.current + 1;
    anfrage.current = id;
    try {
      const daten = await ladeBibliothek();
      if (anfrage.current === id) {
        setStand(daten);
        setFehler(false);
      }
    } catch {
      if (anfrage.current === id) setFehler(true);
    }
    vergissPflege();
    setGemerkt(null);
    setMachtRueck(false);
    navigate('/library', { replace: true, state: null });
  }

  const leer = stand ? bibliothekLeer(stand) : false;
  const themen = stand?.topics ?? [];

  return (
    <div className="app">
      <Kopf
        titel={TEXTE.bibliothek}
        zurueck="/"
        zurueckLabel={TEXTE.zurueckErfassen}
        aktion={
          <span className="kopf-aktion">
            <AbmeldenKnopf />
            <BibliothekMenue />
          </span>
        }
      />
      <main className="inhalt rolle">
        <Suchleiste wert={frage} onChange={beiSuche} />
        {sucht && suchFehler ? <p className="leer1">{TEXTE.suchenFehl}</p> : null}
        {sucht && !suchFehler && treffer ? <Trefferliste treffer={treffer} /> : null}
        {!sucht && fehler ? <p className="leer1">{TEXTE.ladenBibliothek}</p> : null}
        {!sucht && stand && leer ? <p className="leer1">{TEXTE.leer}</p> : null}
        {!sucht && stand && !leer ? (
          <>
            <div className="liste">
              <Zeile zeile={stand.inbox} inbox jetzt={jetzt} />
            </div>
            {themen.length > 0 ? (
              <>
                <h2 className="ab">{TEXTE.themen}</h2>
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
