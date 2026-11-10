import { useEffect, useRef, useState } from 'react';
import { closeHistory } from 'prosemirror-history';
import { TextSelection, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Link } from 'react-router';
import { ART, leistenEintraege, type FormatBefehl } from '../../../../shared/features/format/index.ts';
import { pfadText, seitentitel, type SeiteKurz } from '../../../../shared/features/seiten/index.ts';
import { planeAblage } from '../../../../shared/features/tags/index.ts';
import { NOTE_TEXT_MAX } from '../../../../shared/kern/grenzen.ts';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import type { Thema } from '../../../../shared/kern/modell.ts';
import { aktionRueckgaengig, KARTE_TEXT, schliesseKarte, textHinzugefuegt, zeigeKarte } from '../../ui/karte.tsx';
import { BibliothekIcon } from '../../ui/icons.tsx';
import { Leiste } from '../format/Leiste.tsx';
import { LinkFeld } from '../format/LinkFeld.tsx';
import { setzeZustand, wendeModell } from '../format/modellLauf.ts';
import { legeInWarteschlange, schreibEntwurf, spuele } from '../offline/index.ts';
import { ApiFehler, ladeSeiten, ladeThemen, legeNotizAb, macheRueckgaengig } from './api.ts';
import { packVonEditor, packVonText, textVonDokument } from './entwurfSync.ts';
import { ErfassenFeld } from './ErfassenFeld.tsx';
import { textNachAblageRueck } from './rueck.ts';
import { leeresAnhaengen, ZielText } from './Ziel.tsx';

type Meldung =
  | { art: 'abgelegt'; id: number; ziel: string; undo: string; text: string }
  | { art: 'offline'; clientId: string };

function ganzeAuswahl(state: EditorState): boolean {
  if (state.selection.empty || state.doc.content.size < 2) return false;
  const start = TextSelection.atStart(state.doc).from;
  const ende = TextSelection.atEnd(state.doc).from;
  return state.selection.from <= start && state.selection.to >= ende;
}

function waehleGanz(view: EditorView): void {
  const doc = view.state.doc;
  if (doc.content.size < 2) return;
  const start = TextSelection.atStart(doc).from;
  const ende = TextSelection.atEnd(doc).from;
  if (start >= ende) return;
  const tr = view.state.tr
    .setSelection(TextSelection.between(doc.resolve(start), doc.resolve(ende)))
    .setMeta('addToHistory', false);
  view.dispatch(tr);
}

function sichereSchreibmarke(view: EditorView): void {
  const { state } = view;
  if (state.selection instanceof TextSelection && state.selection.$from.parent.inlineContent) return;
  if (state.doc.childCount > 0) return;
  const absatz = state.schema.nodes.absatz;
  if (!absatz) return;
  const tr = state.tr.replaceWith(0, state.doc.content.size, absatz.create({ quelle: '' }));
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 1)));
}

function schalteLeereWichtig(zustand: EditorState): EditorState {
  const typ = zustand.schema.marks[ART.wichtig];
  if (!typ) return zustand;
  const marks = zustand.storedMarks ?? zustand.selection.$from.marks();
  const tr = zustand.tr;
  if (typ.isInSet(marks)) tr.removeStoredMark(typ);
  else tr.addStoredMark(typ.create());
  if (!tr.storedMarksSet) return zustand;
  return zustand.apply(closeHistory(tr));
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

  function beiModell(name: FormatBefehl) {
    const view = sichtRef.current;
    if (!view) return;
    const eintrag = leistenEintraege().find((kandidat) => kandidat.id === name);
    const schalt = eintrag?.modell;
    if (!schalt) return;
    sichereSchreibmarke(view);
    const ganz = ganzeAuswahl(view.state);
    const leer = view.state.selection.empty && view.state.doc.textContent.length === 0;
    if (name === ART.wichtig && leer) {
      const naechster = schalt.run(view.state);
      if (naechster === view.state) wendeModell(view, { run: schalteLeereWichtig, isActive: schalt.isActive });
      else setzeZustand(view, naechster);
    } else {
      wendeModell(view, schalt);
    }
    if (ganz && view.state.selection.empty) waehleGanz(view);
    setStand((zahl) => zahl + 1);
    view.focus();
  }

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
      void spuele((eintrag) => legeNotizAb(eintrag.doc, eintrag.clientId)).then((standSync) => {
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
                text: textVonDokument(treffer.doc),
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
      await schreibEntwurf(packVonText(wieder));
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
    const roh = rohEingabe ?? textRef.current;
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
      const ergebnis = await legeInWarteschlange(packVonEditor(sichtRef.current, roh), navigator.onLine, (eintrag) =>
        legeNotizAb(eintrag.doc, eintrag.clientId),
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

  function fertig(ziel: string) {
    const editor = sichtRef.current;
    setLink(false);
    if (!editor) return;
    const eintrag = leistenEintraege().find((kandidat) => kandidat.knopf.ziel);
    const naechster = eintrag?.modell?.run(editor.state, ziel);
    if (!naechster || naechster === editor.state) return;
    setzeZustand(editor, naechster);
    setStand((zahl) => zahl + 1);
    editor.focus();
  }

  const plan = text.trim().length === 0 ? null : planeAblage(text, themen, seiten);
  const leer = text.trim().length === 0;
  const gesperrt = leer || speichert || plan?.ungueltig === true;
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
        <Leiste view={ansicht} stand={stand} modell nummern={false} onZiel={() => setLink(true)} onModell={beiModell} />
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
