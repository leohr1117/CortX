import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate, useSearchParams } from 'react-router';
import { ablageZeile, planeNotizText, textGeaendert, textMeldung } from '../../../../shared/features/edit/index.ts';
import { schalteUeberschrift, zeileIstUeberschrift } from '../../../../shared/features/format/index.ts';
import { INBOX_NAME, NOTE_TEXT_MAX } from '../../../../shared/kern/grenzen.ts';
import { gleicherName } from '../../../../shared/features/tags/index.ts';
import type { Notiz } from '../../../../shared/kern/modell.ts';
import { AbwaertsIcon, HashIcon, PosteingangIcon } from '../../ui/icons.tsx';
import { themaPfad } from '../library/api.ts';
import { Kopf } from '../library/Kopf.tsx';
import { ladeNotiz, NotizFehler, speichereNotiz } from './api.ts';
import { Verwerfen } from './Verwerfen.tsx';

function nummer(roh: string | null): number | null {
  if (!roh || !/^[1-9]\d*$/.test(roh)) return null;
  return Number(roh);
}

export function BearbeitenAnsicht() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const id = nummer(params.get('id'));
  const [notiz, setNotiz] = useState<Notiz | null>(null);
  const [feld, setFeld] = useState('');
  const [fehler, setFehler] = useState<string | null>(id === null ? 'Note not found.' : null);
  const [speichert, setSpeichert] = useState(false);
  const eingabe = useRef<HTMLTextAreaElement>(null);
  const wahl = useRef({ start: 0, ende: 0 });
  const rueck = useRef<{ start: number; ende: number } | null>(null);
  const [ueberschrift, setUeberschrift] = useState(false);
  const lassen = useRef(false);
  const vergleich = useRef({ bereit: false, ursprung: '', feld: '' });
  vergleich.current = { bereit: notiz !== null, ursprung: notiz?.text ?? '', feld };
  const blocker = useBlocker(
    useCallback(() => {
      const stand = vergleich.current;
      return stand.bereit && !lassen.current && textGeaendert(stand.ursprung, stand.feld);
    }, []),
  );

  useEffect(() => {
    if (id === null) {
      document.documentElement.dataset.bereit = '1';
      return;
    }
    let aktiv = true;
    ladeNotiz(id)
      .then((geladen) => {
        if (!aktiv) return;
        setNotiz(geladen);
        setFeld(geladen.text);
      })
      .catch((grund: unknown) => {
        if (!aktiv) return;
        setFehler(grund instanceof NotizFehler && grund.status === 404 ? 'Note not found.' : 'Could not load the note.');
      })
      .finally(() => {
        if (aktiv) document.documentElement.dataset.bereit = '1';
      });
    return () => {
      aktiv = false;
    };
  }, [id]);

  useEffect(() => {
    if (!notiz || blocker.state === 'blocked') return;
    const el = eingabe.current;
    if (!el) return;
    el.focus();
    const ende = el.value.length;
    el.setSelectionRange(ende, ende);
    wahl.current = { start: ende, ende };
    setUeberschrift(zeileIstUeberschrift(el.value, ende));
  }, [notiz, blocker.state]);

  useEffect(() => {
    const ziel = rueck.current;
    const el = eingabe.current;
    if (!ziel || !el) return;
    rueck.current = null;
    el.focus();
    el.setSelectionRange(ziel.start, ziel.ende);
    wahl.current = ziel;
    setUeberschrift(zeileIstUeberschrift(el.value, ziel.start));
  }, [feld]);

  useEffect(() => {
    function beiAuswahl() {
      const el = eingabe.current;
      if (!el || document.activeElement !== el) return;
      const start = el.selectionStart ?? 0;
      const ende = el.selectionEnd ?? 0;
      wahl.current = { start, ende };
      setUeberschrift(zeileIstUeberschrift(el.value, start));
    }
    document.addEventListener('selectionchange', beiAuswahl);
    return () => document.removeEventListener('selectionchange', beiAuswahl);
  }, []);

  function merkeWahl(el: HTMLTextAreaElement) {
    const start = el.selectionStart ?? 0;
    const ende = el.selectionEnd ?? 0;
    wahl.current = { start, ende };
    setUeberschrift(zeileIstUeberschrift(el.value, start));
  }

  function umschalten() {
    if (speichert) return;
    const el = eingabe.current;
    const live = el !== null && document.activeElement === el;
    const start = live ? (el.selectionStart ?? wahl.current.start) : wahl.current.start;
    const ende = live ? (el.selectionEnd ?? wahl.current.ende) : wahl.current.ende;
    const naechst = schalteUeberschrift(feld, start, ende);
    wahl.current = { start: naechst.start, ende: naechst.ende };
    rueck.current = { start: naechst.start, ende: naechst.ende };
    setUeberschrift(zeileIstUeberschrift(naechst.text, naechst.start));
    setFeld(naechst.text);
    setFehler(null);
  }

  const ziel = notiz ? themaPfad(notiz.topic) : '/library';
  const plan = planeNotizText(feld);
  const dialog = blocker.state === 'blocked';

  function zurueck() {
    if (speichert) return;
    navigate(ziel);
  }

  function behalten() {
    if (blocker.state === 'blocked') blocker.reset();
  }

  function verwerfen() {
    lassen.current = true;
    if (blocker.state === 'blocked') blocker.proceed();
    else navigate(ziel, { replace: true });
  }

  async function speichern() {
    if (!notiz || speichert || lassen.current) return;
    if (!plan.ok) {
      setFehler(textMeldung(plan.grund));
      return;
    }
    if (plan.text === notiz.text) {
      lassen.current = true;
      navigate(ziel, { replace: true });
      return;
    }
    setSpeichert(true);
    setFehler(null);
    try {
      const gespeichert = await speichereNotiz(notiz.id, plan.text);
      lassen.current = true;
      navigate(themaPfad(gespeichert.topic), { replace: true });
    } catch (grund: unknown) {
      setFehler(grund instanceof NotizFehler ? grund.message : 'Could not save the note.');
      setSpeichert(false);
    }
  }

  const hinweis = notiz ? ablageZeile(notiz, new Date()) : '';
  const inbox = notiz ? gleicherName(notiz.topic, INBOX_NAME) : false;

  return (
    <div className="app">
      <Kopf titel="Edit note" zurueck={ziel} zurueckLabel="Back" onZurueck={zurueck} />
      <main className="form">
        <div className="inhalt">
          {fehler && !notiz ? <p className="leer1">{fehler}</p> : null}
          {notiz ? (
            <>
              <div className="notizkopf">
                <label className="lab" htmlFor="notiz-text">
                  Note
                </label>
                <button
                  type="button"
                  className={ueberschrift ? 'schalt an' : 'schalt'}
                  aria-pressed={ueberschrift}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={umschalten}
                >
                  Heading
                </button>
              </div>
              <textarea
                ref={eingabe}
                id="notiz-text"
                className="feld gross"
                value={feld}
                maxLength={NOTE_TEXT_MAX}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                aria-invalid={fehler ? true : undefined}
                onChange={(event) => {
                  setFeld(event.target.value);
                  setFehler(null);
                  merkeWahl(event.target);
                }}
                onSelect={(event) => merkeWahl(event.currentTarget)}
                onKeyUp={(event) => merkeWahl(event.currentTarget)}
                onClick={(event) => merkeWahl(event.currentTarget)}
              />
              {fehler ? (
                <p className="feldfehler" role="alert">
                  {fehler}
                </p>
              ) : null}
              <label className="lab abstand">Topic</label>
              <div className="feld wahl">
                <span className="sym">{inbox ? <PosteingangIcon /> : <HashIcon />}</span>
                <span className="f">{notiz.topic}</span>
                <AbwaertsIcon />
              </div>
              <p className="hilfe">{hinweis}</p>
            </>
          ) : null}
        </div>
      </main>
      <footer className="stickfuss">
        <div className="inhalt">
          <button
            type="button"
            className={notiz && plan.ok ? 'btn voll' : 'btn voll aus'}
            disabled={!notiz || !plan.ok || speichert}
            onClick={() => void speichern()}
          >
            Save
          </button>
        </div>
      </footer>
      {dialog ? <Verwerfen onKeep={behalten} onDiscard={verwerfen} /> : null}
    </div>
  );
}
