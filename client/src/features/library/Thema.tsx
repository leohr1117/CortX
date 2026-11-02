import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { gruppiereNotizen, uhrzeit } from '../../../../shared/features/library/index.ts';
import { INBOX_NAME } from '../../../../shared/kern/grenzen.ts';
import { gleicherName } from '../../../../shared/features/tags/index.ts';
import type { Thema } from '../../../../shared/kern/modell.ts';
import type { Notiz } from '../../../../shared/kern/modell.ts';
import {
  liesGemerkteNotiz,
  loescheNotiz,
  merkeNotiz,
  NotizFehler,
  NotizKnopf,
  NotizToast,
  stelleNotizHer,
  ThemenWahl,
  vergissNotiz,
  type NotizMeldung,
} from '../edit/index.ts';
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
import { ladeThema, LeseFehler, notizPfad, themaPfad } from './api.ts';
import { LeseText } from '../format/index.ts';
import { TerminZeile } from '../termine/index.ts';
import { Kopf } from './Kopf.tsx';

function meldung(fehler: unknown): string {
  if (fehler instanceof LeseFehler && fehler.status === 404) return 'Topic not found.';
  return 'Could not load this topic.';
}

function NotizZeile({
  notiz,
  offen,
  gesperrt,
  onOeffnen,
  onSchliessen,
  onChange,
  onDelete,
}: {
  notiz: Notiz;
  offen: boolean;
  gesperrt: boolean;
  onOeffnen: () => void;
  onSchliessen: () => void;
  onChange: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="notiz" id={`note-${notiz.id}`}>
      <Link className="tx" to={notizPfad(notiz.id)}>
        <LeseText text={notiz.text} />
        <div className="zeit">{uhrzeit(notiz.created)}</div>
        <TerminZeile text={notiz.text} created={notiz.created} />
      </Link>
      <NotizKnopf
        id={notiz.id}
        offen={offen}
        gesperrt={gesperrt}
        onOeffnen={onOeffnen}
        onSchliessen={onSchliessen}
        onChange={onChange}
        onDelete={onDelete}
      />
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
  const [menueId, setMenueId] = useState<number | null>(null);
  const [wechselId, setWechselId] = useState<number | null>(null);
  const [notizMeldung, setNotizMeldung] = useState<NotizMeldung | null>(liesGemerkteNotiz);
  const [undoFehler, setUndoFehler] = useState<string | null>(null);
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
    const roh = params.get('note');
    if (!roh || !notizen || !/^[1-9]\d*$/.test(roh)) return;
    document.getElementById(`note-${roh}`)?.scrollIntoView({ block: 'center' });
  }, [params, notizen]);

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

  function nachWechsel(neu: Notiz) {
    setWechselId(null);
    setNotizen((liste) => {
      if (!liste) return liste;
      return liste.flatMap((eintrag) => {
        if (eintrag.id !== neu.id) return [eintrag];
        return gleicherName(neu.topic, titel) ? [neu] : [];
      });
    });
  }

  async function notizLoeschen(notiz: Notiz) {
    if (sperre.current) return;
    sperre.current = true;
    setBeschaeftigt(true);
    setMenueId(null);
    setDialog(null);
    setUndoFehler(null);
    setAktionFehler(null);
    try {
      const ergebnis = await loescheNotiz(notiz.id);
      const meldung = { token: ergebnis.token, topic: titel };
      merkeNotiz(meldung);
      setNotizMeldung(meldung);
      setNotizen((liste) => (liste ? liste.filter((eintrag) => eintrag.id !== notiz.id) : liste));
    } catch (grund: unknown) {
      setAktionFehler(grund instanceof NotizFehler ? grund.message : 'Could not delete the note.');
    } finally {
      sperre.current = false;
      setBeschaeftigt(false);
    }
  }

  async function notizZurueck() {
    if (!notizMeldung || sperre.current) return;
    sperre.current = true;
    setBeschaeftigt(true);
    setUndoFehler(null);
    try {
      await stelleNotizHer(notizMeldung.token);
      vergissNotiz();
      setNotizMeldung(null);
      const ansicht = await ladeThema(name);
      setTitel(ansicht.topic);
      setNotizen(ansicht.notes);
      setFehler(null);
    } catch (grund: unknown) {
      setUndoFehler(grund instanceof NotizFehler ? grund.message : 'Could not undo.');
    } finally {
      sperre.current = false;
      setBeschaeftigt(false);
    }
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
          setMenueId(null);
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
                <NotizZeile
                  key={notiz.id}
                  notiz={notiz}
                  offen={menueId === notiz.id}
                  gesperrt={beschaeftigt}
                  onOeffnen={() => {
                    setDialog(null);
                    setAktionFehler(null);
                    setMenueId(notiz.id);
                  }}
                  onSchliessen={() => setMenueId((aktuell) => (aktuell === notiz.id ? null : aktuell))}
                  onChange={() => {
                    setDialog(null);
                    setMenueId(null);
                    setAktionFehler(null);
                    setWechselId(notiz.id);
                  }}
                  onDelete={() => void notizLoeschen(notiz)}
                />
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
      {notizMeldung ? (
        <NotizToast fehler={undoFehler} gesperrt={beschaeftigt} onUndo={() => void notizZurueck()} />
      ) : null}
      {wechselId !== null ? (
        <ThemenWahl
          notizId={wechselId}
          aktuell={titel}
          onSchliessen={() => setWechselId(null)}
          onZu={nachWechsel}
        />
      ) : null}
    </div>
  );
}
