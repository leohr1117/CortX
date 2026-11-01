import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate, useSearchParams } from 'react-router';
import { ablageZeile, planeNotizText, textGeaendert, textMeldung } from '../../../../shared/features/edit/index.ts';
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
  }, [notiz, blocker.state]);

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
              <label className="lab" htmlFor="notiz-text">
                Note
              </label>
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
                }}
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
