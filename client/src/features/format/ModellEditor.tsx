import { type Ref, useLayoutEffect, useRef } from 'react';
import { baseKeymap } from 'prosemirror-commands';
import { closeHistory, history, isHistoryTransaction, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { EditorView } from 'prosemirror-view';
import 'prosemirror-view/style/prosemirror.css';
import { packeDokument, pruefeDokument } from '../../../../shared/features/format/dokument.ts';
import { lade } from '../../../../shared/features/format/laden.ts';
import { speichere } from '../../../../shared/features/format/speichern.ts';
import { NOTE_TEXT_MAX } from '../../../../shared/kern/grenzen.ts';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import { eingabePlugins } from './eingabeKuerzel.ts';
import { ablageTastePlugin, platzhalterPlugin, type EditorModus } from './editorSchale.ts';
import { imeErsatz } from './imeErsatz.ts';
import { modellAblage } from './modellAblage.ts';
import { modellEingabe } from './modellEingabe.ts';
import { inlinePlugins } from './inlineKuerzel.ts';
import { randPlugins } from './randMarken.ts';
import { zeilenPlugins } from './zeilenKuerzel.ts';
import { haengeGriff, merkeEnde } from './modellGriff.ts';
import { haengeModell, loeseModell } from './modellHaken.ts';
import { zustandNach } from './modellLauf.ts';
import { knotenAnsichten, markenAnsichten, schichtenPlugin } from './modellSicht.ts';
import { formatTasten } from './modellTasten.ts';
import { wichtigTastenPlugin } from './wichtigTaste.ts';
import { buchstabenBleibenText } from '../capture/buchstabeAbsatz.ts';
import { erfassenTasten } from '../capture/erfassenTaste.ts';
import { tagDekoPlugin } from '../capture/tagDeko.ts';

function wortgrenze(tr: Transaction, state: EditorState): boolean {
  if (tr.steps.length !== 1) return false;
  const step = tr.steps[0];
  if (!(step instanceof ReplaceStep) || step.from !== step.to) return false;
  const inhalt = step.slice.content;
  if (inhalt.childCount !== 1) return false;
  const text = inhalt.textBetween(0, inhalt.size);
  const erste = text.match(/^./u)?.[0] ?? '';
  if (!/^[\p{L}\p{N}]$/u.test(erste)) return false;
  const $pos = state.doc.resolve(step.from);
  if (!$pos.parent.isTextblock || $pos.parentOffset <= 0) return false;
  const letzte = $pos.parent.textBetween(0, $pos.parentOffset).at(-1) ?? '';
  return /^\s$/u.test(letzte);
}

function gruppeTastatur(tr: Transaction, state: EditorState, komposition: number): { tr: Transaction; komposition: number } {
  if (!tr.docChanged || tr.getMeta('addToHistory') === false || isHistoryTransaction(tr)) return { tr, komposition };
  const ui = tr.getMeta('uiEvent');
  if (ui === 'paste' || ui === 'drop' || ui === 'cut' || tr.getMeta('paste') === true) return { tr, komposition };
  const laufend = tr.getMeta('composition');
  if (typeof laufend === 'number' && laufend > 0) {
    const wechsel = laufend !== komposition;
    return { tr: wechsel ? closeHistory(tr) : tr, komposition: laufend };
  }
  if (wortgrenze(tr, state)) return { tr: closeHistory(tr), komposition };
  return { tr, komposition };
}

function schreibeRef(ziel: Ref<EditorView | null> | undefined, wert: EditorView | null) {
  if (!ziel) return;
  if (typeof ziel === 'function') ziel(wert);
  else ziel.current = wert;
}

export function ModellEditor({
  text,
  onText,
  dokument,
  onDokument,
  onAuswahl,
  onLink,
  onAblegen,
  modus = 'notiz',
  platzhalter,
  ungueltig = false,
  ref,
}: {
  text: string;
  onText: (text: string) => void;
  dokument?: unknown;
  onDokument?: (doc: unknown) => void;
  onAuswahl?: () => void;
  onLink?: () => void;
  onAblegen?: () => void;
  modus?: EditorModus;
  platzhalter?: string;
  ungueltig?: boolean;
  ref?: Ref<EditorView | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onTextRef = useRef(onText);
  const onDokumentRef = useRef(onDokument);
  const onAuswahlRef = useRef(onAuswahl);
  const onLinkRef = useRef(onLink);
  const onAblegenRef = useRef(onAblegen);
  const textRef = useRef(text);
  const dokumentRef = useRef(dokument);
  const gemeldet = useRef(text);
  const refWeiter = useRef(ref);
  const modusRef = useRef(modus);
  const platzhalterRef = useRef(platzhalter);
  onTextRef.current = onText;
  onDokumentRef.current = onDokument;
  onAuswahlRef.current = onAuswahl;
  onLinkRef.current = onLink;
  onAblegenRef.current = onAblegen;
  textRef.current = text;
  dokumentRef.current = dokument;
  refWeiter.current = ref;
  modusRef.current = modus;
  platzhalterRef.current = platzhalter;

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const anfang = textRef.current;
    const vorgegeben = dokumentRef.current === undefined ? null : pruefeDokument(dokumentRef.current);
    const anfangDoc = vorgegeben ?? lade(anfang);
    const anfangText = speichere(anfangDoc);
    gemeldet.current = anfangText;
    const basis = EditorState.create({
      doc: anfangDoc,
      plugins: [
        ...(modusRef.current === 'erfassen' ? erfassenTasten() : []),
        history(),
        platzhalterPlugin(() => platzhalterRef.current ?? TEXTE.platzhalter, modusRef.current === 'erfassen'),
        ...eingabePlugins(),
        ...zeilenPlugins(),
        ...inlinePlugins(),
        ...randPlugins(),
        keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo }),
        wichtigTastenPlugin(() => onLinkRef.current?.()),
        keymap(formatTasten(() => onLinkRef.current?.())),
        imeErsatz(),
        ...modellEingabe(),
        modellAblage(),
        ...(modusRef.current === 'erfassen' ? [ablageTastePlugin(() => onAblegenRef.current?.()), buchstabenBleibenText(), tagDekoPlugin()] : []),
        keymap(baseKeymap),
        schichtenPlugin(),
      ],
    });
    const ende = TextSelection.atEnd(basis.doc);
    const start = basis.apply(basis.tr.setSelection(ende).setMeta('addToHistory', false));
    let komposition = -1;
    const view = new EditorView(el, {
      state: start,
      nodeViews: knotenAnsichten(),
      markViews: markenAnsichten(modusRef.current === 'erfassen'),
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Note' },
      dispatchTransaction(tr) {
        const gruppe = gruppeTastatur(tr, view.state, komposition);
        const eingehend = gruppe.tr;
        const vorher = view.state;
        const ersetzt = zustandNach(eingehend);
        const next = ersetzt ?? vorher.apply(eingehend);
        const docGeaendert = ersetzt ? !next.doc.eq(vorher.doc) : eingehend.docChanged;
        const auswahlGeaendert = !next.selection.eq(vorher.selection);
        if (!docGeaendert) {
          komposition = gruppe.komposition;
          view.updateState(next);
          if (auswahlGeaendert) onAuswahlRef.current?.();
          return;
        }
        const wert = speichere(next.doc);
        if (wert.length > NOTE_TEXT_MAX) return;
        komposition = gruppe.komposition;
        view.updateState(next);
        gemeldet.current = wert;
        onTextRef.current(wert);
        onDokumentRef.current?.(packeDokument(next.doc));
        onAuswahlRef.current?.();
      },
    });
    viewRef.current = view;
    if (modusRef.current === 'erfassen') view.dom.classList.add('cm-content');
    haengeGriff(view);
    haengeModell(view);
    merkeEnde(view, anfangText);
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
    const view = viewRef.current;
    if (!view || view.composing || dokument === undefined) return;
    const knoten = pruefeDokument(dokument);
    if (!knoten) return;
    const wert = speichere(knoten);
    if (knoten.eq(view.state.doc)) {
      gemeldet.current = wert;
      return;
    }
    gemeldet.current = wert;
    const zustand = EditorState.create({ doc: knoten, plugins: view.state.plugins });
    const ende = TextSelection.atEnd(zustand.doc);
    view.updateState(zustand.apply(zustand.tr.setSelection(ende).setMeta('addToHistory', false)));
    merkeEnde(view, wert);
    onAuswahlRef.current?.();
  }, [dokument]);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view || view.composing || text === gemeldet.current) return;
    gemeldet.current = text;
    const zustand = EditorState.create({ doc: lade(text), plugins: view.state.plugins });
    const ende = TextSelection.atEnd(zustand.doc);
    view.updateState(zustand.apply(zustand.tr.setSelection(ende).setMeta('addToHistory', false)));
    merkeEnde(view, text);
    onAuswahlRef.current?.();
  }, [text]);

  useLayoutEffect(() => {
    const dom = viewRef.current?.dom;
    if (!dom) return;
    if (ungueltig) dom.setAttribute('aria-invalid', 'true');
    else dom.removeAttribute('aria-invalid');
  }, [ungueltig]);

  if (modus === 'erfassen') {
    const hinweis = platzhalter ?? TEXTE.platzhalter;
    return (
      <div className="erfassen">
        <div className="schreib">
          <div ref={host} className="cm-editor modell-host" />
          {text.length === 0 && hinweis.length > 0 ? (
            <span className="cm-placeholder" aria-hidden="true" style={{ pointerEvents: 'none' }}>
              {hinweis}
            </span>
          ) : null}
        </div>
      </div>
    );
  }
  return <div ref={host} className="schreib modell-host" />;
}
