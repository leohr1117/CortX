import { type ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { SitzungsModus } from './ansicht.ts';

interface SitzungWert {
  modus: SitzungsModus;
  online: boolean;
  anmelden: () => void;
  abmelden: () => void;
}

const SitzungKontext = createContext<SitzungWert | null>(null);

let ablauf: (() => void) | null = null;

export function meldeAblauf(status: number | null): void {
  if (status === 401) ablauf?.();
}

export function useSitzung(): SitzungWert {
  const wert = useContext(SitzungKontext);
  if (!wert) throw new Error('Missing session.');
  return wert;
}

export function SitzungProvider({ children }: { children: ReactNode }) {
  const [modus, setModus] = useState<SitzungsModus>(() => (navigator.onLine ? 'wartet' : 'aus'));
  const [online, setOnline] = useState(() => navigator.onLine);
  const lauf = useRef(0);

  useEffect(() => {
    ablauf = () => {
      lauf.current += 1;
      setModus('aus');
    };
    return () => {
      ablauf = null;
    };
  }, []);

  useEffect(() => {
    const verbunden = () => setOnline(true);
    const getrennt = () => setOnline(false);
    window.addEventListener('online', verbunden);
    window.addEventListener('offline', getrennt);
    return () => {
      window.removeEventListener('online', verbunden);
      window.removeEventListener('offline', getrennt);
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    const id = lauf.current + 1;
    lauf.current = id;
    let aktiv = true;
    void fetch('/api/zugang', { cache: 'no-store' })
      .then((antwort) => {
        if (!aktiv || lauf.current !== id) return;
        setModus(antwort.ok ? 'an' : 'aus');
      })
      .catch(() => {
        if (!aktiv || lauf.current !== id) return;
        setModus('aus');
      });
    return () => {
      aktiv = false;
    };
  }, [online]);

  const wert = useMemo<SitzungWert>(
    () => ({
      modus,
      online,
      anmelden: () => {
        lauf.current += 1;
        setModus('an');
      },
      abmelden: () => {
        lauf.current += 1;
        setModus('aus');
      },
    }),
    [modus, online],
  );

  return <SitzungKontext.Provider value={wert}>{children}</SitzungKontext.Provider>;
}

export function AbmeldenKnopf() {
  const navigate = useNavigate();
  const { abmelden } = useSitzung();
  const [laeuft, setLaeuft] = useState(false);

  async function aus() {
    if (laeuft) return;
    setLaeuft(true);
    try {
      const antwort = await fetch('/api/abmelden', { method: 'POST' });
      if (!antwort.ok) {
        setLaeuft(false);
        return;
      }
    } catch {
      setLaeuft(false);
      return;
    }
    abmelden();
    await navigate('/');
  }

  return (
    <button type="button" className="abmelden" onClick={() => void aus()}>
      Sign out
    </button>
  );
}
