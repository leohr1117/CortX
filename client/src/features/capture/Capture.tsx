import { type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { legeInWarteschlange, liesEntwurf, schreibEntwurf, spuele } from '../offline/index.ts';
import { ersetzeTag, gleicherName, planeAblage, tagAnCaret, vorschlaege } from '../../../../shared/features/tags/index.ts';
import { NOTE_TEXT_MAX, VORSCHLAG_BREITE } from '../../../../shared/kern/grenzen.ts';
import type { Thema } from '../../../../shared/kern/modell.ts';
import { BibliothekIcon, WolkeAusIcon } from '../../ui/icons.tsx';
import { tastaturIstHandy } from '../../ui/system.ts';
import { ladeThemen, legeNotizAb, verschiebeNotiz } from './api.ts';
import { Spiegel } from './Spiegel.tsx';
import { Vorschlag } from './Vorschlag.tsx';
import { Wechsel } from './Wechsel.tsx';

type Meldung =
  | { art: 'abgelegt'; id: number; thema: string }
  | { art: 'offline'; clientId: string }
  | { art: 'fehler'; text: string };

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
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const feld = useRef<HTMLTextAreaElement>(null);
  const spiegel = useRef<HTMLDivElement>(null);
  const kasten = useRef<HTMLDivElement>(null);
  const sperre = useRef(false);
  const beruehrt = useRef(false);
  const geschoben = useRef(false);

  const schliesse = useCallback(() => {
    setWechsel(false);
    setWechselFehler(null);
    if (geschoben.current) {
      geschoben.current = false;
      window.history.back();
    }
    feld.current?.focus();
  }, []);

  useEffect(() => {
    const beiPop = () => {
      if (!geschoben.current) return;
      geschoben.current = false;
      setWechsel(false);
      setWechselFehler(null);
      feld.current?.focus();
    };
    window.addEventListener('popstate', beiPop);
    return () => window.removeEventListener('popstate', beiPop);
  }, []);

  useEffect(() => {
    feld.current?.focus();
    let aktiv = true;
    void (async () => {
      const [entwurf, liste] = await Promise.all([
        liesEntwurf().catch(() => ''),
        ladeThemen().catch(() => [] as Thema[]),
      ]);
      if (!aktiv) return;
      setThemen(liste);
      if (!beruehrt.current && entwurf.length > 0) {
        setText(entwurf);
        setCaret(entwurf.length);
        requestAnimationFrame(() => {
          const el = feld.current;
          if (!el) return;
          el.focus();
          const ende = el.value.length;
          el.setSelectionRange(ende, ende);
        });
      }
      setBereit(true);
    })();
    return () => {
      aktiv = false;
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

  useLayoutEffect(() => {
    if (!offen) return;
    const marke = spiegel.current?.querySelector('.hier');
    const rahmen = kasten.current;
    if (!marke || !rahmen) return;
    const a = marke.getBoundingClientRect();
    const r = rahmen.getBoundingClientRect();
    const left = Math.min(Math.max(0, a.left - r.left), Math.max(0, rahmen.clientWidth - VORSCHLAG_BREITE));
    const top = a.bottom - r.top + 6;
    setPos((alt) => (alt.top === top && alt.left === left ? alt : { top, left }));
  }, [offen, text, caret, themen, schluessel]);

  function merke(el: HTMLTextAreaElement) {
    setCaret(el.selectionStart ?? 0);
  }

  function waehle(index: number) {
    if (!tag || !liste) return;
    beruehrt.current = true;
    if (index < liste.treffer.length) {
      const name = liste.treffer[index]?.name;
      if (!name) return;
      const neu = ersetzeTag(text, tag, name);
      setText(neu.text);
      setCaret(neu.caret);
      setZu(`${tag.start}:${name}`);
      requestAnimationFrame(() => {
        feld.current?.focus();
        feld.current?.setSelectionRange(neu.caret, neu.caret);
      });
      return;
    }
    setZu(schluessel);
    feld.current?.focus();
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
    if (sperre.current || wechsel || text.trim().length === 0) return;
    if (text.length > NOTE_TEXT_MAX) {
      setMeldung({ art: 'fehler', text: 'Could not file the note.' });
      return;
    }
    const roh = text;
    sperre.current = true;
    setSpeichert(true);
    setMeldung(null);
    try {
      const ergebnis = await legeInWarteschlange(roh, navigator.onLine, (eintrag) =>
        legeNotizAb(eintrag.text, eintrag.clientId),
      );
      beruehrt.current = true;
      if (ergebnis.art === 'abgelehnt') {
        setText(roh);
        setCaret(roh.length);
        setMeldung({ art: 'fehler', text: 'Could not file the note.' });
        feld.current?.focus();
        return;
      }
      setText('');
      setCaret(0);
      setZu(null);
      if (ergebnis.art === 'abgelegt') {
        setMeldung({ art: 'abgelegt', id: ergebnis.notiz.id, thema: ergebnis.notiz.topic });
        const neu = await ladeThemen().catch(() => null);
        if (neu) setThemen(neu);
      } else {
        setMeldung({ art: 'offline', clientId: ergebnis.clientId });
      }
      feld.current?.focus();
    } catch {
      setMeldung({ art: 'fehler', text: 'Could not file the note.' });
    } finally {
      sperre.current = false;
      setSpeichert(false);
    }
  }

  function taste(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || wechsel) return;
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void ablegen();
      return;
    }
    if (!offen || !liste) return;
    const letzte = liste.treffer.length + (liste.neu ? 1 : 0) - 1;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setWahlFuer(schluessel);
      setWahl(Math.min(letzte, aktiv + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setWahlFuer(schluessel);
      setWahl(Math.max(0, aktiv - 1));
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setZu(schluessel);
      return;
    }
    if (event.key === 'Enter' && !tastaturIstHandy()) {
      event.preventDefault();
      waehle(aktiv);
    }
  }

  return (
    <div className="app">
      <header className="kopf leer">
        <Link className="tlink" to="/library">
          <BibliothekIcon />
          Library
        </Link>
      </header>
      <main className="cap">
        <div className="schreib" ref={kasten}>
          <Spiegel text={text} tag={offen ? tag : null} spiegel={spiegel} />
          <textarea
            ref={feld}
            value={text}
            placeholder="Start typing…"
            aria-label="Note"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={offen}
            aria-controls={offen ? 'vorschlaege' : undefined}
            aria-activedescendant={offen ? `vorschlag-${aktiv}` : undefined}
            onChange={(event) => {
              beruehrt.current = true;
              setText(event.target.value);
              merke(event.target);
              setMeldung((alt) => (alt?.art === 'fehler' ? null : alt));
            }}
            onSelect={(event) => merke(event.currentTarget)}
            onKeyUp={(event) => merke(event.currentTarget)}
            onClick={(event) => merke(event.currentTarget)}
            onKeyDown={taste}
            onScroll={(event) => {
              if (spiegel.current) spiegel.current.scrollTop = event.currentTarget.scrollTop;
            }}
          />
          {offen && liste ? (
            <Vorschlag
              liste={liste}
              aktiv={aktiv}
              fragment={tag?.name ?? ''}
              top={pos.top}
              left={pos.left}
              onWahl={waehle}
            />
          ) : null}
        </div>
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
