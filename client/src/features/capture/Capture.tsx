import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { EditorView } from '@codemirror/view';
import { EBENEN, PFAD_TRENNER, seitentitel, type SeiteKurz } from '../../../../shared/features/seiten/index.ts';
import { caretEbene, ersetzeSegment, ersetzeTag, planeAblage, tagAnCaret, vorschlaege } from '../../../../shared/features/tags/index.ts';
import { NOTE_TEXT_MAX } from '../../../../shared/kern/grenzen.ts';
import type { Thema } from '../../../../shared/kern/modell.ts';
import { BibliothekIcon, WolkeAusIcon } from '../../ui/icons.tsx';
import { Editor } from '../format/index.ts';
import { legeInWarteschlange, liesEntwurf, schreibEntwurf, spuele } from '../offline/index.ts';
import { ApiFehler, ladeSeiten, ladeThemen, legeNotizAb, macheRueckgaengig } from './api.ts';
import { fangStrgEnter, setzeHinweis, tagFeld, tastenWennOffen, type TagAktionen } from './erkennung.ts';
import { useMenuePlatz } from './menuePlatz.ts';
import { Vorschlag } from './Vorschlag.tsx';
import { leeresAnhaengen, ZielText } from './Ziel.tsx';

type Meldung =
  | { art: 'abgelegt'; id: number; ziel: string; undo: string }
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
  const [seiten, setSeiten] = useState<SeiteKurz[]>([]);
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [bereit, setBereit] = useState(false);
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
  const echo = useRef<string | null>(null);
  const zielCaret = useRef<number | null>(null);

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
    sichtRef.current?.focus();
    const los = fangStrgEnter(sichtRef, aktionen);
    let aktiv = true;
    void (async () => {
      const [entwurf, liste, katalog] = await Promise.all([
        liesEntwurf().catch(() => ''),
        ladeThemen().catch(() => [] as Thema[]),
        ladeSeiten().catch(() => [] as SeiteKurz[]),
      ]);
      if (!aktiv) return;
      setThemen(liste);
      setSeiten(katalog);
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
          void Promise.all([ladeThemen().catch(() => null), ladeSeiten().catch(() => null)]).then(([liste, katalog]) => {
            if (!aktiv) return;
            if (liste) setThemen(liste);
            if (katalog) setSeiten(katalog);
          });
        }
        setMeldung((alt) => {
          if (alt?.art === 'offline') {
            const treffer = stand.erledigt.find((eintrag) => eintrag.clientId === alt.clientId);
            if (treffer) {
              return {
                art: 'abgelegt',
                id: treffer.notiz.id,
                ziel: treffer.notiz.ziel ?? treffer.notiz.topic,
                undo: treffer.notiz.undo ?? '',
              };
            }
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
  const relativ = tag ? caret - tag.start - 1 : 0;
  const lage = tag ? caretEbene(tag.name, relativ) : null;
  const schluessel = tag ? `${tag.start}:${tag.name}` : '';
  const liste = tag && lage && lage.ebene < EBENEN.length && zu !== schluessel ? vorschlaege(tag.name, themen, seiten, relativ) : null;
  const offen = liste !== null && (liste.treffer.length > 0 || liste.neu);
  const aktiv = wahlFuer === schluessel ? wahl : (liste?.gewaehlt ?? 0);
  const plan = text.trim().length === 0 ? null : planeAblage(text, themen, seiten);
  const leer = text.trim().length === 0;
  const gesperrt = leer || speichert || plan?.ungueltig === true;
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
      const einsetzen = liste.treffer[index]?.einsetzen;
      if (!einsetzen) return;
      const neu = tag.name.includes(PFAD_TRENNER) ? ersetzeSegment(text, tag, einsetzen, relativ) : ersetzeTag(text, tag, einsetzen);
      setZu(`${tag.start}:${neu.text.slice(tag.start + 1, neu.caret)}`);
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

  async function katalogNeu() {
    const [liste, katalog] = await Promise.all([ladeThemen().catch(() => null), ladeSeiten().catch(() => null)]);
    if (liste) setThemen(liste);
    if (katalog) setSeiten(katalog);
  }

  async function rueckgaengig() {
    if (meldung?.art !== 'abgelegt' || meldung.undo.length === 0 || sperre.current) return;
    sperre.current = true;
    try {
      await macheRueckgaengig(meldung.undo);
      setMeldung(null);
      await katalogNeu();
      sichtRef.current?.focus();
    } catch (grund: unknown) {
      setMeldung({ art: 'fehler', text: grund instanceof ApiFehler ? grund.message : 'Could not undo.' });
    } finally {
      sperre.current = false;
    }
  }

  async function ablegen() {
    const roh = sichtRef.current?.state.doc.toString() ?? text;
    const zielPlan = planeAblage(roh, themen, seiten);
    if (sperre.current || roh.trim().length === 0) return;
    if (zielPlan?.ungueltig) {
      setMeldung({ art: 'fehler', text: zielPlan.hinweis ?? 'Could not file the note.' });
      return;
    }
    if (zielPlan && leeresAnhaengen(zielPlan)) {
      setMeldung({ art: 'fehler', text: 'Write something to add.' });
      return;
    }
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
        setMeldung({ art: 'fehler', text: ergebnis.grund ?? 'Could not file the note.' });
        sichtRef.current?.focus();
        return;
      }
      setZu(null);
      setzeAussen('', 0);
      if (ergebnis.art === 'abgelegt') {
        const abgelegt = ergebnis.notiz;
        setMeldung({
          art: 'abgelegt',
          id: abgelegt.id,
          ziel: abgelegt.ziel ?? `${abgelegt.topic} > ${seitentitel(abgelegt.text)}`,
          undo: abgelegt.undo ?? '',
        });
        await katalogNeu();
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
    gesperrt: () => false,
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
            fragment={lage?.fragment ?? ''}
            top={pos.top}
            left={pos.left}
            fest
            onWahl={waehle}
          />
        ) : null}
      </main>
      <footer className="fuss">
        <div className="ziel">{plan ? <ZielText plan={plan} /> : null}</div>
        <div className="kbd" aria-hidden="true">
          <span className="win">Ctrl</span>
          <i className="win">+</i>
          <span className="win">Enter</span>
          <span className="mac">⌘</span>
          <span className="mac">Enter</span>
        </div>
        <button
          type="button"
          className={gesperrt ? 'btn aus' : 'btn'}
          disabled={gesperrt}
          onClick={() => void ablegen()}
        >
          File
        </button>
      </footer>
      {meldung?.art === 'abgelegt' ? (
        <div className="toast" role="status">
          <span className="t">
            Added to <b>{meldung.ziel}</b>
          </span>
          {meldung.undo.length > 0 ? (
            <>
              <span className="dot">·</span>
              <button type="button" className="a" onClick={() => void rueckgaengig()}>
                Undo
              </button>
            </>
          ) : null}
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
    </div>
  );
}
