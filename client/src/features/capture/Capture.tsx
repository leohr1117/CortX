import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { planeAblage, tagAnCaret, vorschlaege, ersetzeTag } from '../../../../shared/features/tags/index.ts';
import { VORSCHLAG_BREITE } from '../../../../shared/kern/grenzen.ts';
import type { Thema } from '../../../../shared/kern/modell.ts';
import { BibliothekIcon } from '../../ui/icons.tsx';
import { tastaturIstHandy } from '../../ui/system.ts';
import { ladeThemen, legeNotizAb } from './api.ts';
import { Spiegel } from './Spiegel.tsx';
import { Vorschlag } from './Vorschlag.tsx';

export function CaptureAnsicht() {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [themen, setThemen] = useState<Thema[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [zu, setZu] = useState<string | null>(null);
  const [wahlFuer, setWahlFuer] = useState('');
  const [wahl, setWahl] = useState(0);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const feld = useRef<HTMLTextAreaElement>(null);
  const spiegel = useRef<HTMLDivElement>(null);
  const kasten = useRef<HTMLDivElement>(null);
  const sperre = useRef(false);

  useEffect(() => {
    feld.current?.focus();
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

  async function ablegen() {
    if (sperre.current || text.trim().length === 0) return;
    sperre.current = true;
    setSpeichert(true);
    setFehler(null);
    try {
      const notiz = await legeNotizAb(text);
      setText('');
      setCaret(0);
      setZu(null);
      setToast(notiz.topic);
      const neu = await ladeThemen();
      setThemen(neu);
      feld.current?.focus();
    } catch {
      setToast(null);
      setFehler('Could not file the note.');
    } finally {
      sperre.current = false;
      setSpeichert(false);
    }
  }

  function taste(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
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
              setText(event.target.value);
              merke(event.target);
              setFehler(null);
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
      {toast ? (
        <div className="toast" role="status">
          <span className="t">
            Filed in <b>{toast}</b>
          </span>
          <span className="dot">·</span>
          <button type="button" className="a">
            Change
          </button>
        </div>
      ) : null}
      {fehler ? (
        <div className="toast ohne" role="status">
          <span className="t">{fehler}</span>
        </div>
      ) : null}
    </div>
  );
}
