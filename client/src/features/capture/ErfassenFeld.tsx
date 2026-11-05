import { useEffect, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { baseKeymap } from 'prosemirror-commands';
import { closeHistory, history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import 'prosemirror-view/style/prosemirror.css';
import type { Thema } from '../../../../shared/kern/modell.ts';
import { VORSCHLAG_BREITE } from '../../../../shared/kern/grenzen.ts';
import type { SeiteKurz } from '../../../../shared/features/seiten/pfad.ts';
import { setzeVorschlag, zielAmCursor, type ZielAmCursor } from '../../../../shared/features/seiten/zielvorschlag.ts';
import { haengeModell, loeseModell } from '../format/modellHaken.ts';
import { knotenAnsichten, markenAnsichten } from '../format/modellSicht.ts';
import { HINDERNIS, LAGE, beobachteSicht, liesSicht, listenPlatz } from '../../ui/lage.ts';
import { liesEntwurf, schreibEntwurf } from '../offline/index.ts';
import { zustandOhneHistorie } from './erfassenBefehl.ts';
import { auswahlAn, dokumentFuer, rohOffset, rohPos, textAusDokument } from './erfassenDokument.ts';
import { feldPlugins, kuerzelWahl, wuchsUmEins, type FeldAktion } from './erfassenEingabe.ts';
import { haengeErfassenGriff } from './erfassenGriff.ts';
import { erfassenSchmuck } from './erfassenSchmuck.ts';
import { Vorschlag } from './Vorschlag.tsx';

const KEINE_SEITEN: SeiteKurz[] = [];

function schreibeRef(ziel: Ref<EditorView | null> | undefined, wert: EditorView | null) {
  if (!ziel) return;
  if (typeof ziel === 'function') ziel(wert);
  else ziel.current = wert;
}

interface Lage {
  top: number;
  left: number;
  maxHoehe: number;
}

function leisteKante(sichtVersatz: number, sichtHoehe: number): number {
  if (typeof document.querySelector !== 'function') return sichtVersatz + sichtHoehe;
  const leiste = document.querySelector(HINDERNIS.leiste);
  if (leiste instanceof HTMLElement && leiste.getBoundingClientRect().height > 0) {
    return leiste.getBoundingClientRect().top;
  }
  return sichtVersatz + sichtHoehe;
}

function menueLage(view: EditorView, text: string, start: number): Lage | null {
  let pos: { top: number; bottom: number; left: number } | null = null;
  try {
    pos = view.coordsAtPos(rohPos(view.state.doc, text, start));
  } catch {
    return null;
  }
  if (!pos) return null;
  const sicht = liesSicht();
  const platz = listenPlatz(
    sicht.sichtVersatz,
    leisteKante(sicht.sichtVersatz, sicht.sichtHoehe),
    pos.top,
    pos.bottom,
    LAGE.listeMaxPx,
    LAGE.listeMinPx,
    LAGE.listeLueckePx,
  );
  const breite = typeof window.innerWidth === 'number' ? window.innerWidth : 0;
  const left = Math.round(Math.min(Math.max(8, pos.left), Math.max(8, breite - VORSCHLAG_BREITE - 8)));
  return { top: platz.top, left, maxHoehe: platz.maxHoehe };
}

export function ErfassenFeld({
  text,
  themen,
  seiten = KEINE_SEITEN,
  platzhalter,
  onText,
  onAblegen,
  onAuswahl,
  onBereit,
  onZiel,
  ref,
}: {
  text: string;
  themen: readonly Thema[];
  seiten?: readonly SeiteKurz[];
  platzhalter?: string;
  onText?: (text: string) => void;
  onAblegen?: (text: string) => void;
  onAuswahl?: () => void;
  onBereit?: () => void;
  onZiel?: () => void;
  ref?: Ref<EditorView | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onTextRef = useRef(onText);
  const onAblegenRef = useRef(onAblegen);
  const onAuswahlRef = useRef(onAuswahl);
  const onBereitRef = useRef(onBereit);
  const onZielRef = useRef(onZiel);
  const textRef = useRef(text);
  const caretRef = useRef(text.length);
  const zuRef = useRef<string | null>(null);
  const gemeldet = useRef(text);
  const beruehrt = useRef(false);
  const zuletztGeschrieben = useRef<string | null>(null);
  const refWeiter = useRef(ref);
  const platzhalterRef = useRef(platzhalter);
  platzhalterRef.current = platzhalter;
  const aktionRef = useRef<FeldAktion>({
    ablegen: () => undefined,
    offen: () => false,
    waehlen: () => undefined,
    hoch: () => undefined,
    runter: () => undefined,
    zu: () => undefined,
  });
  const [roh, setRoh] = useState(text);
  const [caret, setCaret] = useState(text.length);
  const [zu, setZu] = useState<string | null>(null);
  const [wahl, setWahl] = useState(0);
  const [wahlFuer, setWahlFuer] = useState('');
  const [bereit, setBereit] = useState(false);
  const [lage, setLage] = useState<Lage>({ top: 0, left: 8, maxHoehe: LAGE.listeMaxPx });
  onTextRef.current = onText;
  onAblegenRef.current = onAblegen;
  onAuswahlRef.current = onAuswahl;
  onBereitRef.current = onBereit;
  onZielRef.current = onZiel;
  textRef.current = roh;
  zuRef.current = zu;
  refWeiter.current = ref;

  const ziel: ZielAmCursor | null = zielAmCursor(roh, caret, themen, seiten, zu);
  const liste = ziel?.liste ?? null;
  const schluessel = ziel?.schluessel ?? '';
  const offen = liste !== null && (liste.treffer.length > 0 || liste.neu);
  const aktiv = wahlFuer === schluessel ? wahl : (liste?.gewaehlt ?? 0);
  const offenRef = useRef(offen);
  const aktivRef = useRef(aktiv);
  const schluesselRef = useRef(schluessel);
  const zielStand = useRef(ziel);
  offenRef.current = offen;
  aktivRef.current = aktiv;
  schluesselRef.current = schluessel;
  zielStand.current = ziel;

  function veroeffentliche(wert: string, stelle: number) {
    textRef.current = wert;
    gemeldet.current = wert;
    caretRef.current = stelle;
    setRoh(wert);
    setCaret(stelle);
    onTextRef.current?.(wert);
    onAuswahlRef.current?.();
  }

  function wende(wert: string, stelle: number, melden: boolean) {
    const view = viewRef.current;
    textRef.current = wert;
    gemeldet.current = wert;
    caretRef.current = stelle;
    setRoh(wert);
    setCaret(stelle);
    if (melden) onTextRef.current?.(wert);
    if (!view) return;
    zustandOhneHistorie(view, wert, stelle);
    view.focus();
  }

  function waehle(index: number) {
    const stand = zielStand.current;
    const aktuell = stand?.liste;
    if (!stand?.tag || !aktuell) return;
    beruehrt.current = true;
    if (index < aktuell.treffer.length) {
      const einsetzen = aktuell.treffer[index]?.einsetzen;
      if (!einsetzen) return;
      const neu = setzeVorschlag(textRef.current, caretRef.current, einsetzen);
      if (!neu) return;
      const naechster = `${stand.tag.start}:${neu.text.slice(stand.tag.start + 1, neu.caret)}`;
      zuRef.current = naechster;
      setZu(naechster);
      wende(neu.text, neu.caret, true);
      return;
    }
    zuRef.current = schluesselRef.current;
    setZu(schluesselRef.current);
    viewRef.current?.focus();
  }

  aktionRef.current = {
    ablegen: () => {
      onAblegenRef.current?.(textRef.current);
    },
    offen: () => offenRef.current,
    waehlen: () => waehle(aktivRef.current),
    hoch: () => {
      if (!offenRef.current) return;
      setWahlFuer(schluesselRef.current);
      setWahl(Math.max(0, aktivRef.current - 1));
    },
    runter: () => {
      const stand = zielStand.current?.liste;
      if (!stand || !offenRef.current) return;
      const letzte = stand.treffer.length + (stand.neu ? 1 : 0) - 1;
      setWahlFuer(schluesselRef.current);
      setWahl(Math.min(letzte, aktivRef.current + 1));
    },
    zu: () => {
      if (!zielStand.current) return;
      zuRef.current = schluesselRef.current;
      setZu(schluesselRef.current);
    },
  };

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const anfang = textRef.current;
    const doc = dokumentFuer(anfang);
    const basis = EditorState.create({
      doc,
      plugins: [
        history(),
        erfassenSchmuck(() => platzhalterRef.current ?? ''),
        keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo }),
        ...feldPlugins(() => aktionRef.current, () => onZielRef.current?.()),
        keymap(baseKeymap),
      ],
    });
    const sel = auswahlAn(doc, anfang, anfang.length);
    const view = new EditorView(el, {
      state: basis.apply(basis.tr.setSelection(sel).setMeta('addToHistory', false)),
      nodeViews: knotenAnsichten(),
      markViews: markenAnsichten(),
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Note',
        spellcheck: 'false',
      },
      dispatchTransaction(tr) {
        const next = view.state.apply(tr);
        view.updateState(next);
        const wert = textAusDokument(next.doc);
        const stelle = rohOffset(next.doc, wert, next.selection.head);
        if (!tr.docChanged) {
          caretRef.current = stelle;
          setCaret(stelle);
          onAuswahlRef.current?.();
          return;
        }
        beruehrt.current = true;
        if (!tr.getMeta('programm') && !tr.getMeta('convert') && wuchsUmEins(textRef.current, wert)) {
          const wahl = kuerzelWahl(wert, stelle);
          if (wahl) {
            textRef.current = wert;
            caretRef.current = stelle;
            queueMicrotask(() => {
              if (!view.dom.isConnected) {
                veroeffentliche(wert, stelle);
                return;
              }
              if (textAusDokument(view.state.doc) !== wert) return;
              const zielDoc = dokumentFuer(wahl.text);
              let naechste = view.state.tr.replaceWith(0, view.state.doc.content.size, zielDoc.content);
              const zielSel = auswahlAn(naechste.doc, wahl.text, wahl.ende);
              naechste = closeHistory(naechste.setSelection(zielSel).setMeta('convert', true));
              view.dispatch(naechste);
            });
            return;
          }
        }
        veroeffentliche(wert, stelle);
      },
    });
    caretRef.current = anfang.length;
    view.dom.classList.add('cm-content');
    if (host.current) haengeErfassenGriff(view, host.current);
    haengeModell(view);
    viewRef.current = view;
    schreibeRef(refWeiter.current, view);
    view.focus();
    return () => {
      loeseModell(view);
      view.destroy();
      viewRef.current = null;
      schreibeRef(refWeiter.current, null);
    };
  }, []);

  useLayoutEffect(() => {
    if (text === gemeldet.current) return;
    gemeldet.current = text;
    zuRef.current = null;
    setZu(null);
    wende(text, text.length, false);
  }, [text]);

  useLayoutEffect(() => {
    const dom = viewRef.current?.dom;
    if (!dom) return;
    dom.setAttribute('aria-autocomplete', 'list');
    dom.setAttribute('aria-expanded', offen ? 'true' : 'false');
    if (!offen) {
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-activedescendant');
      return;
    }
    dom.setAttribute('aria-controls', 'vorschlaege');
    dom.setAttribute('aria-activedescendant', `vorschlag-${aktiv}`);
  }, [offen, aktiv]);

  const anker = ziel?.tag.start ?? -1;
  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!offen || !view || anker < 0) return;
    const setze = () => {
      const naechste = menueLage(view, textRef.current, anker);
      if (!naechste) return;
      setLage((alt) =>
        alt.top === naechste.top && alt.left === naechste.left && alt.maxHoehe === naechste.maxHoehe ? alt : naechste,
      );
    };
    setze();
    const stoppe = typeof window.addEventListener === 'function' ? beobachteSicht(setze) : () => undefined;
    if (typeof view.dom.addEventListener === 'function') view.dom.addEventListener('scroll', setze);
    return () => {
      stoppe();
      if (typeof view.dom.removeEventListener === 'function') view.dom.removeEventListener('scroll', setze);
    };
  }, [offen, roh, anker, caret]);

  useEffect(() => {
    let aktivLauf = true;
    void liesEntwurf()
      .then((entwurf) => {
        if (!aktivLauf) return;
        if (!beruehrt.current && textRef.current.length === 0 && entwurf.length > 0) wende(entwurf, entwurf.length, true);
        setBereit(true);
        onBereitRef.current?.();
      })
      .catch(() => {
        if (!aktivLauf) return;
        setBereit(true);
        onBereitRef.current?.();
      });
    return () => {
      aktivLauf = false;
    };
  }, []);

  useEffect(() => {
    if (!bereit || zuletztGeschrieben.current === roh) return;
    zuletztGeschrieben.current = roh;
    void schreibEntwurf(roh).catch(() => undefined);
  }, [roh, bereit]);

  return (
    <div className="erfassen">
      <div className="schreib">
        <div ref={host} className="cm-editor modell-host" />
      </div>
      {offen && liste ? (
        <Vorschlag
          liste={liste}
          aktiv={aktiv}
          fragment={ziel?.fragment ?? ''}
          top={lage.top}
          left={lage.left}
          maxHeight={lage.maxHoehe}
          fest
          onWahl={waehle}
        />
      ) : null}
    </div>
  );
}
