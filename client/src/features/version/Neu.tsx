import { useEffect } from 'react';
import { AKTUELLE_VERSION, VERSIONEN } from '../../../../shared/versionen.ts';
import { Kopf } from '../library/Kopf.tsx';
import { ladeStand, merkeStand } from './api.ts';

const FORMAT = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function datumText(iso: string): string {
  const [jahr, monat, tag] = iso.split('-').map(Number);
  if (!jahr || !monat || !tag) return iso;
  return FORMAT.format(new Date(Date.UTC(jahr, monat - 1, tag)));
}

export function NeuSeite() {
  useEffect(() => {
    let aktiv = true;
    void ladeStand()
      .then((stand) => {
        if (!aktiv || stand.seen === AKTUELLE_VERSION) return;
        return merkeStand({ seen: AKTUELLE_VERSION });
      })
      .catch(() => undefined);
    return () => {
      aktiv = false;
    };
  }, []);

  return (
    <div className="app">
      <Kopf titel="What's new" zurueck="/library" zurueckLabel="Back to Library" />
      <main className="inhalt">
        <div className="versionen" data-versionen="">
          {VERSIONEN.map((eintrag) => (
            <section key={eintrag.version} aria-label={`Version ${eintrag.version}`}>
              <p className="nr">{eintrag.version}</p>
              <p className="wann">{datumText(eintrag.datum)}</p>
              <ul>
                {eintrag.zeilen.map((zeile) => (
                  <li key={zeile}>{zeile}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
