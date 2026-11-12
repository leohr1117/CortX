import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ablageZeile, planeNotizText, textMeldung } from '../../../../shared/features/edit/index.ts';
import { abschnittNamen } from '../../../../shared/features/seiten/index.ts';
import type { Notiz } from '../../../../shared/kern/modell.ts';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import { AugeIcon, StiftIcon } from '../../ui/icons.tsx';
import { LeseText } from '../format/index.ts';
import { themaPfad } from '../library/api.ts';
import { Kopf } from '../library/Kopf.tsx';
import { liesNotizEntwurf, schreibNotizEntwurf } from '../offline/index.ts';
import { TerminZeile } from '../termine/index.ts';
import { ladeNotiz, legeKopieAn, loescheNotiz, NotizFehler, speichereNotiz } from './api.ts';
import {
  entwurfZumSpeichern,
  gleicherStand,
  LEERER_STAND,
  standAusAntwort,
  standAusEntwurf,
  standAusPack,
  standNachKasten,
  type DokumentStand,
} from './dokumentStand.ts';
import { merkeNotiz } from './Meldung.tsx';
import { NotizKnopf } from './Menue.tsx';
import { dateinameZumExport, ladeBlob, markdownZumExport, teileOderLade } from './exportMarkdown.ts';
import { kopieDokument, useSofort } from './sofort.ts';
import { ThemenWahl } from './ThemenWahl.tsx';

const SPEICHER_PAUSE_MS = 400;

type SchreibFeld = ComponentType<{
  text: string;
  dokument?: unknown;
  ungueltig?: boolean;
  onText: (text: string) => void;
  onDokument?: (doc: unknown) => void;
}>;

let schreibLaden: Promise<SchreibFeld> | null = null;

function ladeSchreibfeld(): Promise<SchreibFeld> {
  schreibLaden ??= import('../format/NotizEditor.tsx').then((mod) => mod.NotizEditor);
  return schreibLaden;
}

type Modus = 'lesen' | 'schreiben';
type Ausgang = 'ok' | 'leer' | 'netz' | 'fehler' | 'konflikt';

function nummer(roh: string | null): number | null {
  if (!roh || !/^[1-9]\d*$/.test(roh)) return null;
  return Number(roh);
}

export function NotizSeite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const id = nummer(params.get('id'));
  const [notiz, setNotiz] = useState<Notiz | null>(null);
  const [stand, setStand] = useState<DokumentStand>(LEERER_STAND);
  const [basis, setBasis] = useState<DokumentStand>(LEERER_STAND);
  const [modus, setModus] = useState<Modus>('lesen');
  const [fehler, setFehler] = useState<string | null>(id === null ? TEXTE.notizFehlt : null);
  const [bereit, setBereit] = useState(false);
  const [menue, setMenue] = useState(false);
  const [wechsel, setWechsel] = useState(false);
  const [schreibFeld, setSchreibFeld] = useState<SchreibFeld | null>(null);
  const [konflikt, setKonflikt] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const kette = useRef(Promise.resolve());
  const basisRef = useRef(basis);
  const standRef = useRef(stand);
  const notizRef = useRef<Notiz | null>(null);
  const da = useRef(true);
  const weg = useRef(false);
  const konfliktRef = useRef(false);
  const abbruch = useRef<AbortController | null>(null);
  const kopieId = useRef('');
  const sichereRef = useRef<(zeigen: boolean) => Promise<Ausgang>>(async () => 'ok');
  basisRef.current = basis;
  standRef.current = stand;
  notizRef.current = notiz;

  useEffect(() => {
    da.current = true;
    return () => {
      da.current = false;
    };
  }, []);

  useEffect(() => {
    if (id === null || bereit) document.documentElement.dataset.bereit = '1';
  }, [bereit, id]);

  useEffect(() => {
    if (id === null) return;
    let aktiv = true;
    setBereit(false);
    setModus('lesen');
    setFehler(null);
    setMenue(false);
    setWechsel(false);
    setKonflikt(false);
    weg.current = false;
    konfliktRef.current = false;
    ladeNotiz(id)
      .then(async (geladen) => {
        const entwurf = await liesNotizEntwurf(geladen.id).catch(() => '');
        if (!aktiv) return;
        const basisStand = standAusAntwort(geladen);
        const start = standAusEntwurf(entwurf, basisStand);
        if (start.leeren) void schreibNotizEntwurf(geladen.id, '');
        basisRef.current = basisStand;
        standRef.current = start.stand;
        setNotiz(geladen);
        setBasis(basisStand);
        setStand(start.stand);
      })
      .catch((grund: unknown) => {
        if (!aktiv) return;
        setNotiz(null);
        setFehler(grund instanceof NotizFehler && grund.status === 404 ? TEXTE.notizFehlt : TEXTE.notizLaden);
      })
      .finally(() => {
        if (aktiv) setBereit(true);
      });
    return () => {
      aktiv = false;
    };
  }, [id]);

  useEffect(() => {
    if (!notiz) return;
    void ladeSchreibfeld();
  }, [notiz]);

  useEffect(() => {
    if (!bereit || !notiz) return;
    void schreibNotizEntwurf(notiz.id, entwurfZumSpeichern(stand, basis));
  }, [bereit, basis, stand, notiz]);

  useEffect(() => {
    if (!bereit) return;
    const timer = window.setTimeout(() => {
      void sichereRef.current(false);
    }, SPEICHER_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [bereit, stand]);

  useSofort({ notiz: notizRef, stand: standRef, basis: basisRef, weg, konflikt: konfliktRef, da, abbruch }, {
    beiOnline: () => void sichereRef.current(false),
    beiKonflikt: () => markiereKonflikt(),
    beiUebernahme: (beleg, neu) => {
      setBasis(beleg);
      setNotiz(neu);
    },
  });

  function markiereKonflikt() {
    konfliktRef.current = true;
    kopieId.current = crypto.randomUUID();
    setKonflikt(true);
    setFehler(null);
  }

  async function schreibeEinmal(zeigen: boolean): Promise<Ausgang> {
    const aktuell = notizRef.current;
    const jetzt = standRef.current;
    if (!aktuell || weg.current) return 'ok';
    if (konfliktRef.current) return 'konflikt';
    const plan = planeNotizText(jetzt.text);
    if (!plan.ok) {
      if (zeigen && da.current) setFehler(textMeldung(plan.grund));
      return 'leer';
    }
    if (gleicherStand(jetzt, basisRef.current)) {
      if (zeigen && da.current) setFehler(null);
      return 'ok';
    }
    const steuer = new AbortController();
    abbruch.current = steuer;
    try {
      const gespeichert = await speichereNotiz(aktuell.id, jetzt.doc, aktuell.version, steuer.signal);
      if (!da.current || weg.current) return 'ok';
      basisRef.current = jetzt;
      notizRef.current = gespeichert;
      setBasis(jetzt);
      setNotiz(gespeichert);
      if (zeigen) setFehler(null);
      return 'ok';
    } catch (grund: unknown) {
      if (grund instanceof NotizFehler && grund.status === 409) {
        if (da.current && !weg.current) markiereKonflikt();
        return 'konflikt';
      }
      if (!da.current || weg.current) return 'netz';
      const netz = grund instanceof NotizFehler && grund.status === null;
      if (zeigen) setFehler(grund instanceof NotizFehler ? grund.message : TEXTE.speichernNotiz);
      return netz ? 'netz' : 'fehler';
    } finally {
      if (abbruch.current === steuer) abbruch.current = null;
    }
  }

  async function speichereKopie() {
    const aktuell = notizRef.current;
    if (!aktuell || kopiert) return;
    setKopiert(true);
    try {
      const kopie = await legeKopieAn(aktuell.id, kopieDokument(standRef.current, new Date()), kopieId.current);
      weg.current = true;
      await schreibNotizEntwurf(aktuell.id, '');
      navigate(`/library/note?id=${kopie.id}`);
    } catch {
      weg.current = false;
      if (da.current) setFehler(TEXTE.kopieFehl);
    } finally {
      if (da.current) setKopiert(false);
    }
  }

  function sichere(zeigen: boolean): Promise<Ausgang> {
    const arbeit = kette.current.then(async () => {
      let aus: Ausgang = 'ok';
      for (let runde = 0; runde < 4; runde += 1) {
        aus = await schreibeEinmal(zeigen && runde === 0);
        const plan = planeNotizText(standRef.current.text);
        if (!plan.ok || gleicherStand(standRef.current, basisRef.current) || aus !== 'ok') return aus;
      }
      return aus;
    });
    kette.current = arbeit.then(
      () => undefined,
      () => undefined,
    );
    return arbeit;
  }
  sichereRef.current = sichere;

  function beiKasten(pos: number) {
    const neu = standNachKasten(standRef.current, pos);
    if (!neu) return;
    standRef.current = neu;
    setStand(neu);
    setFehler(null);
  }

  async function oeffneSchreiben() {
    const feldKomponente = await ladeSchreibfeld();
    if (!da.current) return;
    setSchreibFeld(() => feldKomponente);
    setModus('schreiben');
  }

  async function zeigeLesen() {
    const aus = await sichere(true);
    if (aus === 'leer' || aus === 'fehler' || !da.current) return;
    setModus('lesen');
  }

  async function zurueck() {
    const aktuell = notizRef.current;
    if (!aktuell) {
      navigate('/library');
      return;
    }
    const aus = await sichere(true);
    if (aus === 'leer' || aus === 'fehler' || !da.current) return;
    navigate(themaPfad(notizRef.current?.topic ?? aktuell.topic));
  }

  async function entfernen() {
    const aktuell = notizRef.current;
    if (!aktuell || weg.current) return;
    weg.current = true;
    setMenue(false);
    try {
      const ergebnis = await loescheNotiz(aktuell.id);
      merkeNotiz({ token: ergebnis.token, topic: aktuell.topic });
      await schreibNotizEntwurf(aktuell.id, '').catch(() => undefined);
      navigate(themaPfad(aktuell.topic), { replace: true });
    } catch (grund: unknown) {
      weg.current = false;
      if (da.current) setFehler(grund instanceof NotizFehler ? grund.message : TEXTE.loeschenNotiz);
    }
  }

  const zeile = notiz ? ablageZeile(notiz, new Date()) : '';
  const namen = notiz && modus === 'lesen' ? abschnittNamen(stand.text) : [];
  const EditorFeld = schreibFeld;
  const aktion = notiz ? (
    <div className="kopf-aktion">
      <button
        type="button"
        className="ib"
        aria-label={modus === 'schreiben' ? TEXTE.lesen : TEXTE.schreiben}
        onClick={() => void (modus === 'schreiben' ? zeigeLesen() : oeffneSchreiben())}
      >
        {modus === 'schreiben' ? <AugeIcon /> : <StiftIcon />}
      </button>
      <NotizKnopf
        id={notiz.id}
        offen={menue}
        gesperrt={weg.current}
        onOeffnen={() => setMenue(true)}
        onSchliessen={() => setMenue(false)}
        onChange={() => {
          setMenue(false);
          setWechsel(true);
        }}
        onExport={() => { setMenue(false); void teileOderLade(markdownZumExport(standRef.current.knoten), dateinameZumExport(standRef.current.knoten), navigator, ladeBlob); }}
        onDelete={() => void entfernen()}
      />
    </div>
  ) : null;

  return (
    <div className="app">
      <Kopf
        titel={notiz?.topic}
        zurueck="/library"
        zurueckLabel={TEXTE.zurueck}
        onZurueck={() => void zurueck()}
        aktion={aktion}
      />
      <main className={modus === 'schreiben' ? 'inhalt rolle notizblatt schreiben' : 'inhalt rolle notizblatt'}>
        {fehler && !notiz ? <p className="leer1">{fehler}</p> : null}
        {notiz && modus === 'lesen' ? (
          <>
            {namen.length > 0 ? (
              <nav className="verzeichnis" aria-label={TEXTE.aufSeite}>
                {namen.map((name, index) => (
                  <a
                    key={`${index}-${name}`}
                    href={`#abschnitt-${index}`}
                    onClick={(event) => {
                      event.preventDefault();
                      document.getElementById(`abschnitt-${index}`)?.scrollIntoView({ block: 'start' });
                    }}
                  >
                    {name}
                  </a>
                ))}
              </nav>
            ) : null}
            <LeseText doc={stand.knoten} verlinken onKasten={beiKasten} />
            <TerminZeile text={stand.text} created={notiz.created} />
          </>
        ) : null}
        {notiz && modus === 'schreiben' && EditorFeld ? (
          <EditorFeld
            text={stand.text}
            dokument={stand.doc}
            ungueltig={Boolean(fehler)}
            onText={(wert) => {
              const neu = { ...standRef.current, text: wert };
              standRef.current = neu;
              setStand(neu);
              setFehler(null);
            }}
            onDokument={(pack) => {
              const neu = standAusPack(pack, standRef.current.text);
              if (!neu) return;
              standRef.current = neu;
              setStand(neu);
            }}
          />
        ) : null}
        {fehler && notiz ? (
          <p className="feldfehler" role="alert">
            {fehler}
          </p>
        ) : null}
        {konflikt ? (
          <>
            <p className="ablage" role="status">
              {TEXTE.seiteNeuGeladen}
            </p>
            <button type="button" className="btn" disabled={kopiert} onClick={() => void speichereKopie()}>
              {TEXTE.alsKopie}
            </button>
          </>
        ) : null}
        {notiz ? <p className="ablage">{zeile}</p> : null}
      </main>
      {wechsel && notiz ? (
        <ThemenWahl
          notizId={notiz.id}
          aktuell={notiz.topic}
          onSchliessen={() => setWechsel(false)}
          onZu={(neu) => {
            setWechsel(false);
            setNotiz(neu);
          }}
        />
      ) : null}
    </div>
  );
}
