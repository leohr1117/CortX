import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { EditorView } from '@codemirror/view';
import { legeInWarteschlange, liesEntwurf, schreibEntwurf, spuele } from '../offline/index.ts';
import { ersetzeTag, gleicherName, planeAblage, tagAnCaret, vorschlaege } from '../../../../shared/features/tags/index.ts';
import { NOTE_TEXT_MAX } from '../../../../shared/kern/grenzen.ts';
import type { Thema } from '../../../../shared/kern/modell.ts';
import { BibliothekIcon, WolkeAusIcon } from '../../ui/icons.tsx';
import { Editor } from '../format/index.ts';
import { ladeThemen, legeNotizAb, verschiebeNotiz } from './api.ts';
import { fangStrgEnter, setzeHinweis, tagFeld, tastenWennOffen, type TagAktionen } from './erkennung.ts';
import { useMenuePlatz } from './menuePlatz.ts';
import { Vorschlag } from './Vorschlag.tsx';
import { Wechsel } from './Wechsel.tsx';

type Meldung =
  | { art: 'abgelegt'; id: number; thema: string }
  | { art: 'offline'; clientId: string }
  | { art: 'fehler'; text: string };

const LEER_AKTION: TagAktionen = {
  ablegen: () => undefined,
  hoch: () => undefined,
  runter: () => undefined,
  zu: () => undefined,
  waehlen: () => undefined,
  gesperrt: () => false,
};

export function CaptureAnsicht() {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [themen, setThemen] = useState<Thema[]>([]);
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [bereit, setBereit] = useState(false);
  const [wechsel, setWechsel] = useState(false);
  const [wechselFehler, setWechselFehler] = useState<string | null>(null);
  const [bewegt, setBewegt] = useState(false);
  const [zu, setZu] = useState<string | null>(null);
  const [wahlFuer, setWahlFuer] = useState('');
  const [wahl, setWahl] = useState(0);
  const sichtRef = useRef<EditorView | null>(null);
  const aktionen = useRef<TagAktionen>(LEER_AKTION);
  const gebaut = useRef<ReturnType<typeof tagFeld> | null>(null);
  if (gebaut.current === null) gebaut.current = tagFeld(aktionen);
  const feld = gebaut.current;
  const sperre = useRef(false);
  const beruehrt = useRef(false);
  const geschoben = useRef(false);
  const echo = useRef<string | null>(null);
  const zielCaret = useRef<number | null>(null);

  const schliesse = useCallback(() => {
    setWechsel(false);
    setWechselFehler(null);
    if (geschoben.current) {
      geschoben.current = false;
      window.history.back();
    }
    sichtRef.current?.focus();
  }, []);

  function setzeAussen(wert: string, stelle: number) {
    echo.current = wert;
    zielCaret.current = stelle;
    setText(wert);
    setCaret(stelle);
    const editor = sichtRef.current;
    if (!editor || editor.state.doc.toString() !== wert) return;
    zielCaret.current = null;
    const ziel = Math.max(0, Math.min(stelle, wert.length));
    editor.focus();
    if (editor.state.selection.main.head !== ziel) editor.dispatch({ selection: { anchor: ziel } });
  }

  function beiText(wert: string) {
    if (echo.current === wert) {
      echo.current = null;
      setText(wert);
      return;
    }
    echo.current = null;
    beruehrt.current = true;
    setText(wert);
    setMeldung((alt) => (alt?.art === 'fehler' ? null : alt));
  }

  useEffect(() => {
    const beiPop = () => {
      if (!geschoben.current) return;
      geschoben.current = false;
      setWechsel(false);
      setWechselFehler(null);
      sichtRef.current?.focus();
    };
    window.addEventListener('popstate', beiPop);
    return () => window.removeEventListener('popstate', beiPop);
  }, []);

  useEffect(() => {
    sichtRef.current?.focus();
    const los = fangStrgEnter(sichtRef, aktionen);
    let aktiv = true;
    void (async () => {
      const [entwurf, liste] = await Promise.all([
        liesEntwurf().catch(() => ''),
        ladeThemen().catch(() => [] as Thema[]),
      ]);
      if (!aktiv) return;
      setThemen(liste);
      if (!beruehrt.current && entwurf.length > 0) setzeAussen(entwurf, entwurf.length);
      setBereit(true);
    })();
    return () => {
      aktiv = false;
      los();
    };
  }, []);

  useEffect(() => {
    if (!bereit) return;
    document.documentElement.dataset.bereit = '1';
    void schreibEntwurf(text);
  }, [text, bereit]);

  useEffect(() => {
    let aktiv = true;
    const sync = () => {
      void spuele((eintrag) => legeNotizAb(eintrag.text, eintrag.clientId)).then((stand) => {
        if (!aktiv) return;
        if (stand.erledigt.length > 0) {
          void ladeThemen()
            .then((liste) => {
              if (aktiv) setThemen(liste);
            })
            .catch(() => undefined);
        }
        setMeldung((alt) => {
          if (alt?.art === 'offline') {
            const treffer = stand.erledigt.find((eintrag) => eintrag.clientId === alt.clientId);
            if (treffer) return { art: 'abgelegt', id: treffer.notiz.id, thema: treffer.notiz.topic };
            return alt;
          }
          if (!alt && stand.rest.length > 0) {
            const erste = stand.rest[0];
            if (erste) return { art: 'offline', clientId: erste.clientId };
          }
          return alt;
        });
      });
    };
    sync();
    window.addEventListener('online', sync);
    return () => {
      aktiv = false;
      window.removeEventListener('online', sync);
    };
  }, []);

  const tag = tagAnCaret(text, caret);
  const schluessel = tag ? `${tag.start}:${tag.name}` : '';
  const liste = tag && zu !== schluessel ? vorschlaege(tag.name, themen) : null;
  const offen = liste !== null && (liste.treffer.length > 0 || liste.neu);
  const aktiv = wahlFuer === schluessel ? wahl : (liste?.gewaehlt ?? 0);
  const plan = text.trim().length === 0 ? null : planeAblage(text, themen);
  const leer = text.trim().length === 0;
  const pos = useMenuePlatz(offen, tag?.start ?? -1, text, sichtRef);

  useLayoutEffect(() => {
    const editor = sichtRef.current;
    if (!editor) return;
    editor.dispatch({
      effects: [feld.tasten.reconfigure(tastenWennOffen(offen, aktionen)), setzeHinweis.of({ offen, aktiv })],
    });
    if (!offen && !editor.hasFocus && !aktionen.current.gesperrt()) editor.focus();
  }, [offen, aktiv, feld]);

  useLayoutEffect(() => {
    const ziel = zielCaret.current;
    if (ziel === null) return;
    const editor = sichtRef.current;
    if (!editor || editor.state.doc.toString() !== text) return;
    zielCaret.current = null;
    const stelle = Math.max(0, Math.min(ziel, editor.state.doc.length));
    editor.focus();
    if (editor.state.selection.main.head !== stelle || editor.state.selection.main.anchor !== stelle) {
      editor.dispatch({ selection: { anchor: stelle } });
    }
  }, [text]);

  function waehle(index: number) {
    if (!tag || !liste) return;
    beruehrt.current = true;
    const editor = sichtRef.current;
    if (index < liste.treffer.length) {
      const name = liste.treffer[index]?.name;
      if (!name) return;
      const neu = ersetzeTag(text, tag, name);
      setZu(`${tag.start}:${name}`);
      if (!editor) {
        setzeAussen(neu.text, neu.caret);
        return;
      }
      echo.current = neu.text;
      editor.focus();
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: neu.text },
        selection: { anchor: neu.caret },
        userEvent: 'input',
      });
      return;
    }
    setZu(schluessel);
    editor?.focus();
  }

  function oeffneWechsel() {
    if (meldung?.art !== 'abgelegt') return;
    setWechselFehler(null);
    setWechsel(true);
    if (!geschoben.current) {
      window.history.pushState({ cortexWechsel: true }, '');
      geschoben.current = true;
    }
    void ladeThemen()
      .then((neu) => setThemen(neu))
      .catch(() => undefined);
  }

  async function waehleThema(name: string) {
    if (meldung?.art !== 'abgelegt' || bewegt) return;
    if (gleicherName(name, meldung.thema)) {
      schliesse();
      return;
    }
    setBewegt(true);
    setWechselFehler(null);
    try {
      const notiz = await verschiebeNotiz(meldung.id, name);
      setMeldung({ art: 'abgelegt', id: notiz.id, thema: notiz.topic });
      const neu = await ladeThemen().catch(() => null);
      if (neu) setThemen(neu);
      schliesse();
    } catch {
      setWechselFehler('Could not move the note.');
    } finally {
      setBewegt(false);
    }
  }

  async function ablegen() {
    const roh = sichtRef.current?.state.doc.toString() ?? text;
    if (sperre.current || wechsel || roh.trim().length === 0) return;
    if (roh.length > NOTE_TEXT_MAX) {
      setMeldung({ art: 'fehler', text: 'Could not file the note.' });
      return;
    }
    sperre.current = true;
    setSpeichert(true);
    setMeldung(null);
    try {
      const ergebnis = await legeInWarteschlange(roh, navigator.onLine, (eintrag) =>
        legeNotizAb(eintrag.text, eintrag.clientId),
      );
      beruehrt.current = true;
      if (ergebnis.art === 'abgelehnt') {
        setzeAussen(roh, roh.length);
        setMeldung({ art: 'fehler', text: 'Could not file the note.' });
        sichtRef.current?.focus();
        return;
      }
      setZu(null);
      setzeAussen('', 0);
      if (ergebnis.art === 'abgelegt') {
        setMeldung({ art: 'abgelegt', id: ergebnis.notiz.id, thema: ergebnis.notiz.topic });
        const neu = await ladeThemen().catch(() => null);
        if (neu) setThemen(neu);
      } else {
        setMeldung({ art: 'offline', clientId: ergebnis.clientId });
      }
      sichtRef.current?.focus();
    } catch {
      setMeldung({ art: 'fehler', text: 'Could not file the note.' });
    } finally {
      sperre.current = false;
      setSpeichert(false);
    }
  }

  aktionen.current = {
    ablegen: () => {
      void ablegen();
    },
    hoch: () => {
      if (!liste) return;
      setWahlFuer(schluessel);
      setWahl(Math.max(0, aktiv - 1));
    },
    runter: () => {
      if (!liste) return;
      const letzte = liste.treffer.length + (liste.neu ? 1 : 0) - 1;
      setWahlFuer(schluessel);
      setWahl(Math.min(letzte, aktiv + 1));
    },
    zu: () => {
      if (tag) setZu(schluessel);
    },
    waehlen: () => waehle(aktiv),
    gesperrt: () => wechsel,
  };

  return (
    <div className="app">
      <header className="kopf leer">
        <Link className="tlink" to="/library">
          <BibliothekIcon />
          Library
        </Link>
      </header>
      <main className="cap">
        <Editor
          ref={sichtRef}
          text={text}
          leiste
          placeholder="Start typing…"
          extensions={feld.erweiterung}
          onText={beiText}
          onCaret={setCaret}
        />
        {offen && liste ? (
          <Vorschlag
            liste={liste}
            aktiv={aktiv}
            fragment={tag?.name ?? ''}
            top={pos.top}
            left={pos.left}
            fest
            onWahl={waehle}
          />
        ) : null}
      </main>
      <footer className="fuss">
        <div className="ziel">{plan ? <>Goes to <b>{plan.topicName}</b></> : null}</div>
        <div className="kbd" aria-hidden="true">
          <span className="win">Ctrl</span>
          <i className="win">+</i>
          <span className="win">Enter</span>
          <span className="mac">⌘</span>
          <span className="mac">Enter</span>
        </div>
        <button
          type="button"
          className={leer || speichert ? 'btn aus' : 'btn'}
          disabled={leer || speichert}
          onClick={() => void ablegen()}
        >
          File
        </button>
      </footer>
      {meldung?.art === 'abgelegt' && !wechsel ? (
        <div className="toast" role="status">
          <span className="t">
            Filed in <b>{meldung.thema}</b>
          </span>
          <span className="dot">·</span>
          <button type="button" className="a" onClick={oeffneWechsel}>
            Change
          </button>
        </div>
      ) : null}
      {meldung?.art === 'offline' ? (
        <div className="toast ohne" role="status">
          <WolkeAusIcon />
          <span className="t">Filed offline · syncs later</span>
        </div>
      ) : null}
      {meldung?.art === 'fehler' ? (
        <div className="toast ohne" role="status">
          <span className="t">{meldung.text}</span>
        </div>
      ) : null}
      {wechsel && meldung?.art === 'abgelegt' ? (
        <>
          <div className="scrim" onClick={schliesse} />
          <Wechsel
            themen={themen}
            aktuell={meldung.thema}
            hinweis={wechselFehler}
            gesperrt={bewegt}
            onSchliessen={schliesse}
            onWahl={(name) => void waehleThema(name)}
          />
        </>
      ) : null}
    </div>
  );
}
