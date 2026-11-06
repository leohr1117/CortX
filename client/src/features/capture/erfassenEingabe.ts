import { keymap } from 'prosemirror-keymap';
import { Plugin, type Command, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import {
  PUNKT_TASTEN,
  leistenEintraege,
  punktArt,
  punktTaste,
  wandleKuerzel,
  type PunktArt,
} from '../../../../shared/features/format/index.ts';
import { kuerzelAn } from '../format/kuerzelSpeicher.ts';
import { setzeErfassenText, wendeBefehl } from './erfassenBefehl.ts';
import { rohOffset, rohPos, textAusDokument } from './erfassenDokument.ts';
import { erfassenEinfuegen } from './erfassenEinfuegen.ts';
import { tagMarken } from './marken.ts';
import { tastaturIstHandy } from '../../ui/system.ts';

const SPRUNG_MS = 40;

export interface FeldAktion {
  ablegen: () => void;
  offen: () => boolean;
  waehlen: () => void;
  hoch: () => void;
  runter: () => void;
  zu: () => void;
}

interface Eingabe extends Event {
  key?: string;
  inputType?: string;
  data?: string | null;
  isComposing?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

interface Sprung {
  bis: number;
  laenge: number;
  kopf: number;
}

function istAblage(event: Event): boolean {
  const taste = event as Eingabe;
  const steuer = taste.ctrlKey === true || taste.metaKey === true;
  return taste.key === 'Enter' && steuer && taste.altKey !== true && taste.isComposing !== true;
}

function mitSteuerung(event: Event): boolean {
  const taste = event as Eingabe;
  return taste.ctrlKey === true || taste.metaKey === true || taste.altKey === true;
}

function istHandy(): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  try {
    return tastaturIstHandy();
  } catch {
    return false;
  }
}

function textUndCaret(state: EditorState): { text: string; caret: number } {
  const text = textAusDokument(state.doc);
  const caret = state.selection.empty ? rohOffset(state.doc, text, state.selection.head) : -1;
  return { text, caret };
}

function ablagePlugin(aktion: () => FeldAktion): Plugin {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (!istAblage(event)) return false;
        event.preventDefault();
        if (!view.composing) aktion().ablegen();
        return true;
      },
      handleDOMEvents: {
        beforeinput(view, event) {
          const eingabe = event as Eingabe;
          if (view.composing || eingabe.isComposing === true) return false;
          if ((eingabe.ctrlKey !== true && eingabe.metaKey !== true) || eingabe.altKey === true) return false;
          if (eingabe.inputType !== 'insertParagraph' && eingabe.inputType !== 'insertLineBreak') return false;
          event.preventDefault();
          return true;
        },
      },
    },
  });
}

function menuePlugin(aktion: () => FeldAktion): Plugin {
  const lauf = (fn: (feld: FeldAktion) => void): Command => () => {
    const feld = aktion();
    if (!feld.offen()) return false;
    fn(feld);
    return true;
  };
  return keymap({
    Enter: () => {
      const feld = aktion();
      if (!feld.offen() || istHandy()) return false;
      feld.waehlen();
      return true;
    },
    ArrowDown: lauf((feld) => feld.runter()),
    ArrowUp: lauf((feld) => feld.hoch()),
    Escape: lauf((feld) => feld.zu()),
  });
}

function tagDeko(state: EditorState): DecorationSet {
  try {
    const text = textAusDokument(state.doc);
    const caret = rohOffset(state.doc, text, state.selection.head);
    const dekos = [];
    for (const marke of tagMarken(text, caret)) {
      const start = Math.max(0, Math.min(marke.start, text.length));
      const ende = Math.max(0, Math.min(marke.end, text.length));
      if (ende <= start) continue;
      const von = rohPos(state.doc, text, start);
      const bis = rohPos(state.doc, text, ende);
      if (bis <= von) continue;
      const $von = state.doc.resolve(von);
      const $bis = state.doc.resolve(bis);
      if ($von.parent !== $bis.parent) continue;
      dekos.push(Decoration.inline(von, bis, { class: marke.hier ? 'tag hier' : 'tag' }));
    }
    return DecorationSet.create(state.doc, dekos);
  } catch {
    return DecorationSet.empty;
  }
}

function sprungGleich(view: EditorView, sprung: Sprung): boolean {
  if (Date.now() > sprung.bis) return false;
  const stand = textUndCaret(view.state);
  const gleich = stand.caret === sprung.kopf && stand.text.length === sprung.laenge;
  sprung.bis = 0;
  return gleich;
}

function merkeSprung(view: EditorView, sprung: Sprung): void {
  const stand = textUndCaret(view.state);
  if (stand.caret < 0) return;
  sprung.bis = Date.now() + SPRUNG_MS;
  sprung.laenge = stand.text.length;
  sprung.kopf = stand.caret;
}

function wendePunkt(view: EditorView, art: PunktArt, sprung: Sprung): boolean {
  if (view.composing || !view.state.selection.empty) return false;
  const stand = textUndCaret(view.state);
  if (stand.caret < 0) return false;
  const wahl = punktTaste(stand.text, stand.caret, stand.caret, art);
  if (!wahl) return false;
  setzeErfassenText(view, wahl.text, wahl.start, wahl.ende);
  merkeSprung(view, sprung);
  return true;
}

function wendePaar(_view: EditorView, _rueckwaerts: boolean): boolean {
  return false;
}

function listenTasten(sprung: Sprung): Record<string, Command> {
  const tasten: Record<string, Command> = {};
  for (const eintrag of PUNKT_TASTEN) {
    tasten[eintrag.taste] = (_state, _dispatch, view) => {
      if (!view) return false;
      if (sprungGleich(view, sprung)) return true;
      return wendePunkt(view, eintrag.art, sprung);
    };
  }
  tasten.Backspace = (_state, _dispatch, view) => {
    if (!view) return false;
    if (sprungGleich(view, sprung)) return true;
    if (wendePunkt(view, 'zurueck', sprung)) return true;
    return wendePaar(view, true);
  };
  tasten.Delete = (_state, _dispatch, view) => {
    if (!view) return false;
    return wendePaar(view, false);
  };
  return tasten;
}

function formatTasten(onZiel: () => void): Record<string, Command> {
  const tasten: Record<string, Command> = {};
  for (const eintrag of leistenEintraege()) {
    const taste = eintrag.knopf.taste;
    if (!taste) continue;
    tasten[taste] = (_state, _dispatch, view) => {
      if (!view) return true;
      if (wendeBefehl(view, eintrag.id, null) === 'ziel') onZiel();
      return true;
    };
  }
  return tasten;
}

function vorEingabe(view: EditorView, event: Event, sprung: Sprung): boolean {
  const eingabe = event as Eingabe;
  if (view.composing || eingabe.isComposing === true || mitSteuerung(event)) return false;
  if (sprungGleich(view, sprung)) {
    event.preventDefault();
    return true;
  }
  const art = punktArt(eingabe.inputType ?? '', eingabe.data ?? null);
  if (art && wendePunkt(view, art, sprung)) {
    event.preventDefault();
    return true;
  }
  if (eingabe.inputType === 'deleteContentBackward' && wendePaar(view, true)) {
    event.preventDefault();
    return true;
  }
  if (eingabe.inputType === 'deleteContentForward' && wendePaar(view, false)) {
    event.preventDefault();
    return true;
  }
  return false;
}

export function wuchsUmEins(alt: string, neu: string): boolean {
  if (neu.length !== alt.length + 1) return false;
  let index = 0;
  while (index < alt.length && alt[index] === neu[index]) index += 1;
  return alt.slice(index) === neu.slice(index + 1);
}

export function kuerzelWahl(text: string, caret: number): { text: string; ende: number } | null {
  if (!kuerzelAn()) return null;
  const wahl = wandleKuerzel(text, caret);
  if (!wahl || wahl.text === text) return null;
  return { text: wahl.text, ende: wahl.ende };
}

export function feldPlugins(aktion: () => FeldAktion, onZiel: () => void): Plugin[] {
  const sprung: Sprung = { bis: 0, laenge: -1, kopf: -1 };
  return [
    erfassenEinfuegen(),
    ablagePlugin(aktion),
    menuePlugin(aktion),
    keymap(listenTasten(sprung)),
    keymap(formatTasten(onZiel)),
    new Plugin({
      props: {
        handleDOMEvents: {
          beforeinput(view, event) {
            return vorEingabe(view, event, sprung);
          },
        },
        decorations(state) {
          return tagDeko(state);
        },
      },
    }),
  ];
}
