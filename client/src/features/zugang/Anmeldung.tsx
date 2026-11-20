import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { NAME_MAX, PASSWORT_MAX } from '../../../../shared/features/zugang/index.ts';
import { RECHT_LISTE } from '../../../../shared/kern/recht.ts';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import { useSitzung } from './Sitzung.tsx';

export function Anmeldung() {
  const { anmelden } = useSitzung();
  const navigate = useNavigate();
  const nameFeld = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [passwort, setPasswort] = useState('');
  const [sichtbar, setSichtbar] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.bereit = '1';
    nameFeld.current?.focus();
  }, []);

  async function sende(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendet) return;
    setSendet(true);
    setFehler(null);
    try {
      const antwort = await fetch('/api/zugang', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, passwort }),
      });
      if (!antwort.ok) {
        let meldung: string = TEXTE.anmeldenKaputt;
        try {
          const daten = (await antwort.json()) as { error?: unknown };
          if (typeof daten.error === 'string' && daten.error.length > 0) meldung = daten.error;
        } catch {
          meldung = TEXTE.anmeldenKaputt;
        }
        setFehler(meldung);
        setPasswort('');
        setSendet(false);
        return;
      }
      await navigate('/');
      anmelden();
    } catch {
      setFehler(TEXTE.strideWeg);
      setPasswort('');
      setSendet(false);
    }
  }

  return (
    <div className="app">
      <main className="login">
        <form method="post" noValidate onSubmit={(event) => void sende(event)}>
          <div className="marke">
            <svg className="logo" xmlns="http://www.w3.org/2000/svg" viewBox="11 10 42 42" width="28" height="28" aria-hidden="true">
              <path d="M19.1 14.5H44.9A3.6 3.6 0 0 1 48.5 18.1V35.5L35.5 48.5H19.1A3.6 3.6 0 0 1 15.5 44.9V18.1A3.6 3.6 0 0 1 19.1 14.5Z" fill="#f2f2f2" />
              <path d="M37.4 35.5H48.5L35.5 48.5V37.4A1.9 1.9 0 0 1 37.4 35.5Z" fill="#707070" />
            </svg>
            {TEXTE.marke || 'Styra'}
          </div>
          <p className="sub">{TEXTE.anmeldenUntertitel}</p>
          <label className="lab" htmlFor="username">
            {TEXTE.benutzer}
          </label>
          <input
            ref={nameFeld}
            id="username"
            className="feld"
            type="text"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={NAME_MAX}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <label className="lab" htmlFor="password">
            {TEXTE.passwort}
          </label>
          <div className="pw">
            <input
              id="password"
              className="feld"
              type={sichtbar ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={PASSWORT_MAX}
              value={passwort}
              onChange={(event) => setPasswort(event.target.value)}
            />
            <button
              type="button"
              className="zeig"
              aria-controls="password"
              aria-pressed={sichtbar}
              aria-label={sichtbar ? TEXTE.passwortVerbergen : TEXTE.passwortZeigen}
              onClick={() => setSichtbar((wert) => !wert)}
            >
              {sichtbar ? TEXTE.verbergen : TEXTE.zeigen}
            </button>
          </div>
          {fehler ? (
            <p className="alarm" role="alert">
              {fehler}
            </p>
          ) : null}
          <button className="btn voll" type="submit">
            {TEXTE.anmelden}
          </button>
          <p className="hinweis">{TEXTE.passwortHinweis}</p>
        </form>
        <a className="absender" href={TEXTE.absenderUrl}>
          {TEXTE.absender}
        </a>
        <nav className="recht-zeile" aria-label={TEXTE.rechtNav}>
          {RECHT_LISTE.map((seite) => (
            <Link key={seite.pfad} to={seite.pfad}>
              {seite.titel}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
