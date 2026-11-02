import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
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
        let meldung = 'Could not sign in.';
        try {
          const daten = (await antwort.json()) as { error?: unknown };
          if (typeof daten.error === 'string' && daten.error.length > 0) meldung = daten.error;
        } catch {
          meldung = 'Could not sign in.';
        }
        setFehler(meldung);
        setSendet(false);
        return;
      }
      await navigate('/');
      anmelden();
    } catch {
      setFehler('Stride is not reachable. Try again later.');
      setSendet(false);
    }
  }

  return (
    <div className="app">
      <main className="login">
        <form noValidate onSubmit={(event) => void sende(event)}>
          <div className="marke">
            <svg className="logo" viewBox="0 0 28 28" aria-hidden="true">
              <rect x="1" y="1" width="26" height="26" rx="8" fill="#f2f2f2" />
              <path
                d="M9 9.5h10M9 14h10M9 18.5h6"
                fill="none"
                stroke="#141414"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            CortX
          </div>
          <p className="sub">Sign in with your Stride account.</p>
          <label className="lab" htmlFor="username">
            Username
          </label>
          <input
            ref={nameFeld}
            id="username"
            className="feld"
            type="text"
            name="username"
            autoComplete="username"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <label className="lab" htmlFor="password">
            Password
          </label>
          <div className="pw">
            <input
              id="password"
              className="feld"
              type={sichtbar ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              value={passwort}
              onChange={(event) => setPasswort(event.target.value)}
            />
            <button
              type="button"
              className="zeig"
              aria-controls="password"
              aria-pressed={sichtbar}
              onClick={() => setSichtbar((wert) => !wert)}
            >
              {sichtbar ? 'Hide' : 'Show'}
            </button>
          </div>
          {fehler ? (
            <p className="alarm" role="alert">
              {fehler}
            </p>
          ) : null}
          <button className="btn voll" type="submit">
            Sign in
          </button>
          <p className="hinweis">Change your password in Stride.</p>
        </form>
      </main>
    </div>
  );
}
