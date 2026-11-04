import { useEffect, useRef, useState } from 'react';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import { Link } from 'react-router';
import type { EditorView as SpiegelAnsicht } from '@codemirror/view';
import type { EditorView } from 'prosemirror-view';
import { pfadText, seitentitel, type SeiteKurz } from '../../../../shared/features/seiten/index.ts';
import { planeAblage } from '../../../../shared/features/tags/index.ts';
import { type FormatBefehl } from '../../../../shared/features/format/index.ts';
import { NOTE_TEXT_MAX } from '../../../../shared/kern/grenzen.ts';
import type { Thema } from '../../../../shared/kern/modell.ts';
import { aktionRueckgaengig, KARTE_TEXT, schliesseKarte, textHinzugefuegt, zeigeKarte } from '../../ui/karte.tsx';
import { BibliothekIcon } from '../../ui/icons.tsx';
import { Leiste } from '../format/Leiste.tsx';
import { LinkFeld } from '../format/LinkFeld.tsx';
import { legeInWarteschlange, schreibEntwurf, spuele } from '../offline/index.ts';
import { ApiFehler, ladeSeiten, ladeThemen, legeNotizAb, macheRueckgaengig } from './api.ts';
import { ErfassenFeld } from './ErfassenFeld.tsx';
import { rohOffset, rohPos, textAusDokument } from './erfassenDokument.ts';
import { wendeBefehl } from './erfassenBefehl.ts';
import { textNachAblageRueck } from './rueck.ts';
import { leeresAnhaengen, ZielText } from './Ziel.tsx';

type Meldung =
  | { art: 'abgelegt'; id: number; ziel: string; undo: string; text: string }
  | { art: 'offline'; clientId: string };

interface SpiegelKern {
  readonly dom: HTMLElement;
  readonly state: {
    doc: { length: number; toString: () => string };
    selection: { main: { empty: boolean; head: number; anchor: number; from: number; to: number } };
  };
  coordsAtPos: (stelle: number) => { left: number; right: number; top: number; bottom: number } | null;
  focus: () => void;
}

function baueSpiegel(hole: () => EditorView | null): SpiegelKern {
  const textVon = () => {
    const view = hole();
    return view ? textAusDokument(view.state.doc) : '';
  };
  return {
    get dom() {
      return hole()?.dom ?? document.documentElement;
    },
    get state() {
      const view = hole();
      const text = textVon();
      if (!view) {
        return {
          doc: { length: 0, toString: () => '' },
          selection: { main: { empty: true, head: 0, anchor: 0, from: 0, to: 0 } },
        };
      }
      const anchor = rohOffset(view.state.doc, text, view.state.selection.anchor);
      const head = rohOffset(view.state.doc, text, view.state.selection.head);
      const from = Math.min(anchor, head);
      const to = Math.max(anchor, head);
      return {
        doc: { length: text.length, toString: () => textVon() },
        selection: { main: { empty: from === to, head, anchor, from, to } },
      };
    },
    coordsAtPos(stelle: number) {
      const view = hole();
      if (!view) return null;
      try {
        return view.coordsAtPos(rohPos(view.state.doc, textVon(), stelle));
      } catch {
        return null;
      }
    },
    focus() {
      hole()?.focus();
    },
  };
}

export function CaptureAnsicht() {
  const [text, setText] = useState('');
  const textRef = useRef('');
  const [themen, setThemen] = useState<Thema[]>([]);
  const [seiten, setSeiten] = useState<SeiteKurz[]>([]);
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [feldBereit, setFeldBereit] = useState(false);
  const [katalogBereit, setKatalogBereit] = useState(false);
  const [ansicht, setAnsicht] = useState<EditorView | null>(null);
  const [stand, setStand] = useState(0);
  const [link, setLink] = useState(false);
  const sichtRef = useRef<EditorView | null>(null);
  const sperre = useRef(false);
  const spiegel = useRef<SpiegelKern | null>(null);
  if (spiegel.current === null) spiegel.current = baueSpiegel(() => sichtRef.current);

  function setzeText(wert: string) {
    textRef.current = wert;
    setText(wert);
  }

  function beiText(wert: string) {
    textRef.current = wert;
    setText(wert);
    setFehler(null);
    setStand((zahl) => zahl + 1);
  }

  useEffect(() => {
    let aktiv = true;
    void (async () => {
      const [liste, katalog] = await Promise.all([
        ladeThemen().catch(() => [] as Thema[]),
        ladeSeiten().catch(() => [] as SeiteKurz[]),
      ]);
      if (!aktiv) return;
      setThemen(liste);
      setSeiten(katalog);
      setKatalogBereit(true);
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  useEffect(() => {
    if (!feldBereit || !katalogBereit) return;
    document.documentElement.dataset.bereit = '1';
  }, [feldBereit, katalogBereit]);

  useEffect(() => {
    let aktiv = true;
    const sync = () => {
      void spuele((eintrag) => legeNotizAb(eintrag.text, eintrag.clientId)).then((standSync) => {
        if (!aktiv) return;
        if (standSync.erledigt.length > 0) {
          void Promise.all([ladeThemen().catch(() => null), ladeSeiten().catch(() => null)]).then(([liste, katalog]) => {
            if (!aktiv) return;
            if (liste) setThemen(liste);
            if (katalog) setSeiten(katalog);
          });
        }
        setMeldung((alt) => {
          if (alt?.art === 'offline') {
            const treffer = standSync.erledigt.find((eintrag) => eintrag.clientId === alt.clientId);
            if (treffer) {
              return {
                art: 'abgelegt',
                id: treffer.notiz.id,
                ziel: treffer.notiz.ziel ?? treffer.notiz.topic,
                undo: treffer.notiz.undo ?? '',
                text: treffer.text,
              };
            }
            return alt;
          }
          if (!alt && standSync.rest.length > 0) {
            const erste = standSync.rest[0];
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

  async function katalogNeu() {
    const [liste, katalog] = await Promise.all([ladeThemen().catch(() => null), ladeSeiten().catch(() => null)]);
    if (liste) setThemen(liste);
    if (katalog) setSeiten(katalog);
  }

  async function rueckMit(token: string, gemerkt: string) {
    if (token.length === 0 || sperre.current) return;
    sperre.current = true;
    try {
      const wieder = textNachAblageRueck(await macheRueckgaengig(token), gemerkt);
      if (wieder === null) {
        setMeldung(null);
        zeigeKarte(KARTE_TEXT.nichtRueckgaengig);
        return;
      }
      setMeldung(null);
      setFehler(null);
      setzeText(wieder);
      await schreibEntwurf(wieder);
      await katalogNeu();
      sichtRef.current?.focus();
    } catch (grund: unknown) {
      setMeldung(null);
      zeigeKarte(grund instanceof ApiFehler ? grund.message : KARTE_TEXT.nichtRueckgaengig);
    } finally {
      sperre.current = false;
    }
  }

  useEffect(() => {
    if (!meldung) return;
    if (meldung.art === 'offline') {
      zeigeKarte(KARTE_TEXT.offline, undefined, `offline:${meldung.clientId}`);
      return;
    }
    const token = meldung.undo;
    const gemerkt = meldung.text;
    zeigeKarte(
      textHinzugefuegt(meldung.ziel),
      token.length > 0 ? aktionRueckgaengig(() => void rueckMit(token, gemerkt)) : undefined,
      token.length > 0 ? token : `note:${meldung.id}`,
    );
  }, [meldung]);

  async function ablegen(rohEingabe?: string) {
    const view = sichtRef.current;
    const roh = rohEingabe ?? (view ? textAusDokument(view.state.doc) : textRef.current);
    const zielPlan = planeAblage(roh, themen, seiten);
    if (sperre.current || roh.trim().length === 0) return;
    if (zielPlan?.ungueltig) {
      setFehler(zielPlan.hinweis ?? TEXTE.nichtAblegen);
      return;
    }
    if (zielPlan && leeresAnhaengen(zielPlan)) {
      setFehler(TEXTE.leerAblegen);
      return;
    }
    if (roh.length > NOTE_TEXT_MAX) {
      setFehler(TEXTE.nichtAblegen);
      return;
    }
    const vorher = meldung;
    sperre.current = true;
    setSpeichert(true);
    setFehler(null);
    setMeldung(null);
    schliesseKarte('aktion');
    try {
      const ergebnis = await legeInWarteschlange(roh, navigator.onLine, (eintrag) =>
        legeNotizAb(eintrag.text, eintrag.clientId),
      );
      if (ergebnis.art === 'abgelehnt') {
        setzeText(roh);
        setFehler(ergebnis.grund ?? TEXTE.nichtAblegen);
        if (vorher) setMeldung(vorher);
        sichtRef.current?.focus();
        return;
      }
      setzeText('');
      if (ergebnis.art === 'abgelegt') {
        const abgelegt = ergebnis.notiz;
        setMeldung({
          art: 'abgelegt',
          id: abgelegt.id,
          ziel: abgelegt.ziel ?? pfadText(abgelegt.topic, seitentitel(abgelegt.text)),
          undo: abgelegt.undo ?? '',
          text: roh,
        });
        await katalogNeu();
      } else {
        setMeldung({ art: 'offline', clientId: ergebnis.clientId });
      }
      sichtRef.current?.focus();
    } catch {
      setFehler(TEXTE.nichtAblegen);
      if (vorher) setMeldung(vorher);
    } finally {
      sperre.current = false;
      setSpeichert(false);
    }
  }

  function befehl(name: FormatBefehl) {
    const editor = sichtRef.current;
    if (!editor) return;
    if (wendeBefehl(editor, name, null) === 'ziel') setLink(true);
    setStand((zahl) => zahl + 1);
  }

  function fertig(ziel: string) {
    const editor = sichtRef.current;
    setLink(false);
    if (!editor) return;
    wendeBefehl(editor, 'link', ziel);
    setStand((zahl) => zahl + 1);
  }

  const plan = text.trim().length === 0 ? null : planeAblage(text, themen, seiten);
  const leer = text.trim().length === 0;
  const gesperrt = leer || speichert || plan?.ungueltig === true;
  const leiste = ansicht ? (spiegel.current as unknown as SpiegelAnsicht) : null;

  return (
    <div className="app">
      <header className="kopf leer">
        <Link className="tlink" to="/library">
          <BibliothekIcon />
          {TEXTE.bibliothek}
        </Link>
      </header>
      <main className="cap">
        <ErfassenFeld
          text={text}
          themen={themen}
          seiten={seiten}
          platzhalter={TEXTE.platzhalter}
          onText={beiText}
          onAblegen={(wert) => {
            void ablegen(wert);
          }}
          onAuswahl={() => setStand((zahl) => zahl + 1)}
          onBereit={() => setFeldBereit(true)}
          onZiel={() => setLink(true)}
          ref={(view) => {
            sichtRef.current = view;
            setAnsicht(view);
          }}
        />
        <Leiste view={leiste} stand={stand} onBefehl={befehl} />
        {link ? <LinkFeld onClose={() => setLink(false)} onFertig={fertig} /> : null}
      </main>
      <footer className="fuss">
        <div className="ziel">
          {fehler ? (
            <span className="feldfehler" role="alert">
              {fehler}
            </span>
          ) : plan ? (
            <ZielText plan={plan} />
          ) : null}
        </div>
        <div className="kbd" aria-hidden="true">
          <span className="win">{TEXTE.strg}</span>
          <i className="win">+</i>
          <span className="win">{TEXTE.eingabe}</span>
          <span className="mac">⌘</span>
          <span className="mac">{TEXTE.eingabe}</span>
        </div>
        <button
          type="button"
          className={gesperrt ? 'btn aus' : 'btn'}
          disabled={gesperrt}
          onClick={() => void ablegen()}
        >
          {TEXTE.datei}
        </button>
      </footer>
    </div>
  );
}
