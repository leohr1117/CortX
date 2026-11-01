import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { gruppiereNotizen, uhrzeit } from '../../../../shared/features/library/index.ts';
import { INBOX_NAME } from '../../../../shared/kern/grenzen.ts';
import { gleicherName } from '../../../../shared/features/tags/index.ts';
import type { Thema } from '../../../../shared/kern/modell.ts';
import type { Notiz } from '../../../../shared/kern/modell.ts';
import { PunkteIcon } from '../../ui/icons.tsx';
import {
  fuehreZusammen,
  ladeThemen,
  loescheThema,
  merkePflege,
  PflegeFehler,
  ThemenKnopf,
  Umbenennen,
  Zusammen,
} from '../topics/index.ts';
import { ladeThema, LeseFehler, themaPfad } from './api.ts';
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
  const navigate = useNavigate();
  const name = params.get('name')?.trim() ?? '';
  const [titel, setTitel] = useState(name);
  const [notizen, setNotizen] = useState<Notiz[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(name ? null : 'Topic not found.');
  const [dialog, setDialog] = useState<'menu' | 'rename' | 'merge' | null>(null);
  const [themen, setThemen] = useState<Thema[]>([]);
  const [aktionFehler, setAktionFehler] = useState<string | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const sperre = useRef(false);

  useEffect(() => {
    if (!name) return;
    let aktiv = true;
    setFehler(null);
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

  useEffect(() => {
    if (dialog !== 'rename' && dialog !== 'merge') return;
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
  }, [dialog]);

  function schliesse() {
    if (sperre.current) return;
    setDialog(null);
    setAktionFehler(null);
  }

  function umbenannt(neu: string) {
    setDialog(null);
    if (neu === titel) return;
    setTitel(neu);
    navigate(themaPfad(neu), { replace: true });
  }

  async function loeschen() {
    if (sperre.current) return;
    sperre.current = true;
    setDialog(null);
    setAktionFehler(null);
    try {
      const ergebnis = await loescheThema(titel);
      merkePflege({ art: 'deleted', name: ergebnis.topic, token: ergebnis.token });
      navigate('/library', {
        replace: true,
        state: { pflege: { art: 'deleted', name: ergebnis.topic, token: ergebnis.token } },
      });
    } catch (grund: unknown) {
      sperre.current = false;
      setAktionFehler(grund instanceof PflegeFehler ? grund.message : 'Could not delete the topic.');
    }
  }

  async function zusammen(into: string) {
    if (sperre.current) return;
    sperre.current = true;
    setBeschaeftigt(true);
    setAktionFehler(null);
    try {
      const ergebnis = await fuehreZusammen(titel, into);
      merkePflege({
        art: 'merged',
        name: ergebnis.from,
        into: ergebnis.into,
        token: ergebnis.token,
      });
      navigate('/library', {
        replace: true,
        state: {
          pflege: { art: 'merged', name: ergebnis.from, into: ergebnis.into, token: ergebnis.token },
        },
      });
    } catch (grund: unknown) {
      sperre.current = false;
      setBeschaeftigt(false);
      setAktionFehler(grund instanceof PflegeFehler ? grund.message : 'Could not merge the topic.');
    }
  }

  const inbox = gleicherName(titel, INBOX_NAME);
  const gruppen = notizen ? gruppiereNotizen(notizen, new Date()) : [];
  const aktion =
    notizen && !inbox ? (
      <ThemenKnopf
        offen={dialog === 'menu'}
        gesperrt={beschaeftigt}
        onOeffnen={() => {
          setAktionFehler(null);
          setDialog('menu');
        }}
        onSchliessen={schliesse}
        onRename={() => {
          setAktionFehler(null);
          setDialog('rename');
        }}
        onMerge={() => {
          setAktionFehler(null);
          setDialog('merge');
        }}
        onDelete={() => void loeschen()}
      />
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
      {aktionFehler && dialog !== 'merge' ? (
        <div className="toast ruhe ohne" role="status">
          <span className="t">{aktionFehler}</span>
        </div>
      ) : null}
      {dialog === 'rename' || dialog === 'merge' ? <div className="scrim" onClick={schliesse} /> : null}
      {dialog === 'rename' ? (
        <Umbenennen name={titel} themen={themen} onClose={schliesse} onSaved={umbenannt} />
      ) : null}
      {dialog === 'merge' ? (
        <Zusammen
          name={titel}
          anzahl={notizen?.length ?? 0}
          themen={themen}
          fehler={aktionFehler}
          gesperrt={beschaeftigt}
          onClose={schliesse}
          onWahl={(ziel) => void zusammen(ziel)}
        />
      ) : null}
    </div>
  );
}
