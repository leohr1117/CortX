import { useEffect, useRef, useState } from 'react';
import { gleicherName } from '../../../../shared/features/tags/index.ts';
import type { Notiz, Thema } from '../../../../shared/kern/modell.ts';
import { verschiebeNotiz } from '../capture/api.ts';
import { Wechsel } from '../capture/Wechsel.tsx';
import { ladeThemen } from '../topics/index.ts';

export function ThemenWahl({
  notizId,
  aktuell,
  onZu,
  onSchliessen,
}: {
  notizId: number;
  aktuell: string;
  onZu: (notiz: Notiz) => void;
  onSchliessen: () => void;
}) {
  const [themen, setThemen] = useState<Thema[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gesperrt, setGesperrt] = useState(false);
  const geschoben = useRef(false);
  const zu = useRef(onSchliessen);
  zu.current = onSchliessen;

  useEffect(() => {
    let aktiv = true;
    ladeThemen()
      .then((liste) => {
        if (aktiv) setThemen(liste);
      })
      .catch(() => {
        if (aktiv) setThemen([]);
      });
    return () => {
      aktiv = false;
    };
  }, []);

  useEffect(() => {
    window.history.pushState({ cortxWechsel: true }, '');
    geschoben.current = true;
    const beiPop = () => {
      if (!geschoben.current) return;
      geschoben.current = false;
      zu.current();
    };
    window.addEventListener('popstate', beiPop);
    return () => window.removeEventListener('popstate', beiPop);
  }, []);

  function schliesse() {
    if (gesperrt) return;
    if (geschoben.current) {
      geschoben.current = false;
      window.history.back();
    }
    onSchliessen();
  }

  async function waehle(name: string) {
    if (gesperrt) return;
    if (gleicherName(name, aktuell)) {
      schliesse();
      return;
    }
    setGesperrt(true);
    setFehler(null);
    try {
      const neu = await verschiebeNotiz(notizId, name);
      if (geschoben.current) {
        geschoben.current = false;
        window.history.back();
      }
      onZu(neu);
    } catch {
      setFehler('Could not move the note.');
      setGesperrt(false);
    }
  }

  return (
    <>
      <div className="scrim" onClick={schliesse} />
      <Wechsel
        themen={themen}
        aktuell={aktuell}
        hinweis={fehler}
        gesperrt={gesperrt}
        onSchliessen={schliesse}
        onWahl={(name) => void waehle(name)}
      />
    </>
  );
}
