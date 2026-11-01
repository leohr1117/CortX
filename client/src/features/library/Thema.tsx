import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { gruppiereNotizen, uhrzeit } from '../../../../shared/features/library/index.ts';
import { INBOX_NAME } from '../../../../shared/kern/grenzen.ts';
import { gleicherName } from '../../../../shared/features/tags/index.ts';
import type { Notiz } from '../../../../shared/kern/modell.ts';
import { PunkteIcon } from '../../ui/icons.tsx';
import { ladeThema, LeseFehler } from './api.ts';
import { Kopf } from './Kopf.tsx';

function meldung(fehler: unknown): string {
  if (fehler instanceof LeseFehler && fehler.status === 404) return 'Topic not found.';
  return 'Could not load this topic.';
}

function NotizZeile({ notiz }: { notiz: Notiz }) {
  return (
    <article className="notiz">
      <div className="tx">
        <p>{notiz.text}</p>
        <div className="zeit">{uhrzeit(notiz.created)}</div>
      </div>
      <button type="button" className="ib" aria-label="Note actions">
        <PunkteIcon />
      </button>
    </article>
  );
}

export function ThemaAnsicht() {
  const [params] = useSearchParams();
  const name = params.get('name')?.trim() ?? '';
  const [titel, setTitel] = useState(name);
  const [notizen, setNotizen] = useState<Notiz[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(name ? null : 'Topic not found.');

  useEffect(() => {
    if (!name) return;
    let aktiv = true;
    ladeThema(name)
      .then((ansicht) => {
        if (!aktiv) return;
        setTitel(ansicht.topic);
        setNotizen(ansicht.notes);
      })
      .catch((grund: unknown) => {
        if (aktiv) setFehler(meldung(grund));
      })
      .finally(() => {
        if (aktiv) document.documentElement.dataset.bereit = '1';
      });
    return () => {
      aktiv = false;
    };
  }, [name]);

  const inbox = gleicherName(titel, INBOX_NAME);
  const gruppen = notizen ? gruppiereNotizen(notizen, new Date()) : [];
  const aktion =
    notizen && !inbox ? (
      <button type="button" className="ib" aria-label="Topic actions">
        <PunkteIcon />
      </button>
    ) : null;

  return (
    <div className="app">
      <Kopf titel={titel || 'Topic'} zurueck="/library" zurueckLabel="Back to Library" aktion={aktion} />
      <main className="inhalt">
        {fehler ? <p className="leer1">{fehler}</p> : null}
        {notizen && notizen.length === 0 && inbox ? <p className="leer1">Inbox is empty.</p> : null}
        {gruppen.map((gruppe) => (
          <section key={gruppe.label}>
            <h2 className="ab">{gruppe.label}</h2>
            <div className="liste">
              {gruppe.notizen.map((notiz) => (
                <NotizZeile key={notiz.id} notiz={notiz} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
