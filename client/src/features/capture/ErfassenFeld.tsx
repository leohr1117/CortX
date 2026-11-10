import { useEffect, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Thema } from '../../../../shared/kern/modell.ts';
import { VORSCHLAG_BREITE } from '../../../../shared/kern/grenzen.ts';
import { lade } from '../../../../shared/features/format/laden.ts';
import { speichere } from '../../../../shared/features/format/speichern.ts';
import { offsetFuer, posFuer } from '../../../../shared/features/format/stelle.ts';
import type { SeiteKurz } from '../../../../shared/features/seiten/pfad.ts';
import { setzeVorschlag, zielAmCursor, type ZielAmCursor } from '../../../../shared/features/seiten/zielvorschlag.ts';
import { HINDERNIS, LAGE, beobachteSicht, liesSicht, listenPlatz } from '../../ui/lage.ts';
import { tastaturIstHandy } from '../../ui/system.ts';
import { ModellEditor } from '../format/ModellEditor.tsx';
import { hatBuchstabenZeile } from './buchstabeAbsatz.ts';
import { useEntwurfSync } from './entwurfSync.ts';
import { Vorschlag } from './Vorschlag.tsx';

const KEINE_SEITEN: SeiteKurz[] = [];

type MitGriff = HTMLElement & { cm?: object };

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
    pos = view.coordsAtPos(posFuer(view.state.doc, text, start));
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

function istHandy(): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  try {
    return tastaturIstHandy();
  } catch {
    return false;
  }
}

function caretVon(view: EditorView, wert: string): number {
  try {
    return offsetFuer(view.state.doc, wert, view.state.selection.head);
  } catch {
    return wert.length;
  }
}

function setzeImFeld(view: EditorView, wert: string, stelle: number) {
  const doc = lade(wert);
  let tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
  const pos = posFuer(tr.doc, wert, stelle);
  const safe = Math.max(0, Math.min(pos, tr.doc.content.size));
  tr = tr.setSelection(TextSelection.near(tr.doc.resolve(safe), 1));
  tr = tr.setMeta('programm', true).setMeta('addToHistory', false);
  view.dispatch(tr);
  view.focus();
}

function uebernehmeGriff(view: EditorView) {
  const dom = view.dom as MitGriff;
  const host = dom.parentElement as MitGriff | null;
  if (host && dom.cm) host.cm = dom.cm;
  dom.spellcheck = false;
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
  const viewRef = useRef<EditorView | null>(null);
  const onTextRef = useRef(onText);
  const onAblegenRef = useRef(onAblegen);
  const onAuswahlRef = useRef(onAuswahl);
  const onBereitRef = useRef(onBereit);
  const onZielRef = useRef(onZiel);
  const rohRef = useRef(text);
  const caretRef = useRef(text.length);
  const zuRef = useRef<string | null>(null);
  const gemeldet = useRef(text);
  const beruehrt = useRef(false);
  const geprueft = useRef<object | null>(null);
  const refWeiter = useRef(ref);
  const [sicht, setSicht] = useState<EditorView | null>(null);
  const [roh, setRoh] = useState(text);
  const [caret, setCaret] = useState(text.length);
  const [zu, setZu] = useState<string | null>(null);
  const [wahl, setWahl] = useState(0);
  const [wahlFuer, setWahlFuer] = useState('');
  const [dokument, setDokument] = useState<unknown>(undefined);
  const [lage, setLage] = useState<Lage>({ top: 0, left: 8, maxHoehe: LAGE.listeMaxPx });
  onTextRef.current = onText;
  onAblegenRef.current = onAblegen;
  onAuswahlRef.current = onAuswahl;
  onBereitRef.current = onBereit;
  onZielRef.current = onZiel;
  rohRef.current = roh;
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

  function merke(wert: string, stelle: number) {
    gemeldet.current = wert;
    rohRef.current = wert;
    caretRef.current = stelle;
    setRoh(wert);
    setCaret(stelle);
  }

  function waehle(index: number) {
    const stand = zielStand.current;
    const aktuell = stand?.liste;
    if (!stand?.tag || !aktuell) return;
    beruehrt.current = true;
    const view = viewRef.current;
    if (index < aktuell.treffer.length) {
      const einsetzen = aktuell.treffer[index]?.einsetzen;
      if (!einsetzen) return;
      const neu = setzeVorschlag(rohRef.current, caretRef.current, einsetzen);
      if (!neu) return;
      const naechster = `${stand.tag.start}:${neu.text.slice(stand.tag.start + 1, neu.caret)}`;
      zuRef.current = naechster;
      setZu(naechster);
      if (!view) {
        merke(neu.text, neu.caret);
        onTextRef.current?.(neu.text);
        return;
      }
      setzeImFeld(view, neu.text, neu.caret);
      return;
    }
    zuRef.current = schluesselRef.current;
    setZu(schluesselRef.current);
    view?.focus();
  }

  function beiTaste(event: KeyboardEvent) {
    if (!offenRef.current) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Escape' && event.key !== 'Enter') return;
    if (event.key === 'Enter' && istHandy()) return;
    event.preventDefault();
    event.stopPropagation();
    (event as KeyboardEvent & { sofort?: boolean }).sofort = true;
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    if (event.key === 'ArrowDown') {
      const stand = zielStand.current?.liste;
      if (!stand) return;
      const letzte = stand.treffer.length + (stand.neu ? 1 : 0) - 1;
      setWahlFuer(schluesselRef.current);
      setWahl(Math.min(letzte, aktivRef.current + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      setWahlFuer(schluesselRef.current);
      setWahl(Math.max(0, aktivRef.current - 1));
      return;
    }
    if (event.key === 'Escape') {
      if (!zielStand.current) return;
      zuRef.current = schluesselRef.current;
      setZu(schluesselRef.current);
      return;
    }
    waehle(aktivRef.current);
  }

  function merkeSicht(view: EditorView | null) {
    viewRef.current = view;
    if (view) uebernehmeGriff(view);
    setSicht(view);
    schreibeRef(refWeiter.current, view);
  }

  useLayoutEffect(() => {
    if (text === gemeldet.current) return;
    gemeldet.current = text;
    rohRef.current = text;
    caretRef.current = text.length;
    zuRef.current = null;
    setRoh(text);
    setCaret(text.length);
    setZu(null);
    setDokument(undefined);
  }, [text]);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view || geprueft.current === view.state.doc) return;
    if (!hatBuchstabenZeile(view.state.doc)) {
      geprueft.current = view.state.doc;
      return;
    }
    view.dispatch(view.state.tr.setMeta('pruefeBuchstabe', true).setMeta('addToHistory', false));
    geprueft.current = view.state.doc;
  });

  useLayoutEffect(() => {
    const dom = sicht?.dom;
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
  }, [sicht, offen, aktiv]);

  useEffect(() => {
    const dom = sicht?.dom;
    if (!dom) return;
    dom.addEventListener('keydown', beiTaste, true);
    return () => dom.removeEventListener('keydown', beiTaste, true);
  });

  const anker = ziel?.tag.start ?? -1;
  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!offen || !view || anker < 0) return;
    const setze = () => {
      const naechste = menueLage(view, rohRef.current, anker);
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

  function ladeEntwurf(wert: string, doc: unknown) {
    gemeldet.current = wert;
    rohRef.current = wert;
    caretRef.current = wert.length;
    setRoh(wert);
    setCaret(wert.length);
    setDokument(doc);
    onTextRef.current?.(wert);
  }

  useEntwurfSync(roh, sicht, beruehrt, rohRef, ladeEntwurf, () => onBereitRef.current?.());

  return (
    <>
      <ModellEditor
        modus="erfassen"
        text={text}
        dokument={dokument}
        platzhalter={platzhalter}
        onText={(wert) => {
          beruehrt.current = true;
          const view = viewRef.current;
          merke(wert, view ? caretVon(view, wert) : wert.length);
          onTextRef.current?.(wert);
        }}
        onAuswahl={() => {
          const view = viewRef.current;
          if (view) {
            const wert = speichere(view.state.doc);
            const stelle = caretVon(view, wert);
            caretRef.current = stelle;
            setCaret(stelle);
          }
          onAuswahlRef.current?.();
        }}
        onAblegen={() => {
          const view = viewRef.current;
          const wert = view ? speichere(view.state.doc) : rohRef.current;
          onAblegenRef.current?.(wert);
        }}
        onLink={() => onZielRef.current?.()}
        ref={merkeSicht}
      />
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
    </>
  );
}
