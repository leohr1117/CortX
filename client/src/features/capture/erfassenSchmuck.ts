import type { Node } from 'prosemirror-model';
import { Plugin, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import {
  ART,
  STIL_REGISTER,
  WIDGET,
  leseDokument,
  nurMarker,
  stilAttribut,
  vorschauSchichten,
  vorschauWidget,
  type Beleg,
} from '../../../../shared/features/format/index.ts';
import { rohOffset, rohPos, textAusDokument } from './erfassenDokument.ts';

const SCHICHTEN = vorschauSchichten();
const BIT = new Map(SCHICHTEN.map((schicht) => [schicht.art, schicht.bit]));
const STIL_ART = new Set<string>(STIL_REGISTER.map((eintrag) => eintrag.art));
const SICHTBAR = new Set<string>([ART.fett, ART.kursiv, ART.streich, ART.code, ART.wichtig, ART.link]);

function klasse(bit: number): string {
  const namen: string[] = [];
  for (const schicht of SCHICHTEN) {
    if ((bit & schicht.bit) !== 0) namen.push(schicht.klasse);
  }
  return namen.join(' ');
}

function artenAus(bit: number): string[] {
  const arten: string[] = [];
  for (const schicht of SCHICHTEN) {
    if ((bit & schicht.bit) !== 0 && STIL_ART.has(schicht.art)) arten.push(schicht.art);
  }
  return arten;
}

function spanne(doc: Node, text: string, von: number, bis: number): { from: number; to: number } | null {
  if (bis <= von || von < 0 || bis > text.length) return null;
  let from = 0;
  let to = 0;
  try {
    from = rohPos(doc, text, von);
    to = rohPos(doc, text, bis);
    if (to <= from) return null;
    const start = doc.resolve(from);
    const ende = doc.resolve(to);
    if (start.parent !== ende.parent || !start.parent.isTextblock) return null;
  } catch {
    return null;
  }
  return { from, to };
}

interface Kachel {
  von: number;
  bis: number;
  zeile: string;
  male: () => HTMLElement;
}

function zeilenKlasse(art: string): string {
  if (art === ART.liste) return 'cm-punkt';
  if (art === ART.nummer) return 'cm-nummer';
  return '';
}

function zeileDeko(doc: Node, pos: number, name: string): Decoration | null {
  if (name.length === 0) return null;
  try {
    const stelle = doc.resolve(pos);
    if (stelle.depth < 1) return null;
    return Decoration.node(stelle.before(), stelle.after(), { class: name });
  } catch {
    return null;
  }
}

function widgetKnoten(beleg: Beleg): HTMLElement {
  const span = document.createElement('span');
  span.setAttribute('aria-hidden', 'true');
  const art = vorschauWidget(beleg.art);
  if (art === WIDGET.nummer) {
    span.className = 'cm-marker cm-zahl';
    span.textContent = `${beleg.zahl ?? ''}.`;
    return span;
  }
  if (art === WIDGET.haken) {
    span.className = beleg.abgehakt === true ? 'cm-haken zu' : 'cm-haken';
    span.textContent = beleg.abgehakt === true ? '\u2713' : '';
    return span;
  }
  span.className = 'cm-marker punkt';
  return span;
}

function naechstesVerdeckt(text: string, verdeckt: Uint8Array, start: number): number {
  let j = start + 1;
  while (j < text.length && verdeckt[j] && text[j] !== '\n') j += 1;
  return j;
}

function platzhalter(doc: Node, hinweis: string): Decoration | null {
  if (hinweis.length === 0 || doc.childCount === 0) return null;
  const pos = Math.min(1, doc.content.size);
  return Decoration.widget(pos, () => {
    const knoten = document.createElement('span');
    knoten.className = 'cm-placeholder';
    knoten.setAttribute('aria-hidden', 'true');
    knoten.style.pointerEvents = 'none';
    knoten.textContent = hinweis;
    return knoten;
  }, { side: -1, ignoreSelection: true, key: 'platzhalter' });
}

function baue(state: EditorState, hinweis: string): DecorationSet {
  const text = textAusDokument(state.doc);
  const doc = state.doc;
  if (text.length === 0) {
    const widget = platzhalter(doc, hinweis);
    return DecorationSet.create(doc, widget ? [widget] : []);
  }
  const anchor = rohOffset(doc, text, state.selection.anchor);
  const head = rohOffset(doc, text, state.selection.head);
  const anfang = Math.min(anchor, head);
  const ende = Math.max(anchor, head);
  const stil = new Uint8Array(text.length);
  const verdeckt = new Uint8Array(text.length);
  const gedimmt = new Uint8Array(text.length);
  const kacheln = new Map<number, Kachel>();
  for (const beleg of leseDokument(text).belege) {
    if (vorschauWidget(beleg.art)) {
      const zeigeSchale = nurMarker(text.slice(beleg.von, beleg.bis)) && anfang === ende && anfang >= beleg.ganzVon && anfang <= beleg.ganzBis;
      markiere(beleg, text, anfang, ende, zeigeSchale, verdeckt, gedimmt);
      const marker = beleg.marker[0];
      if (marker && verdeckt[marker[0]]) {
        kacheln.set(marker[0], {
          von: marker[0],
          bis: marker[1],
          zeile: zeilenKlasse(beleg.art),
          male: () => widgetKnoten(beleg),
        });
      }
    }
    if (!SICHTBAR.has(beleg.art)) continue;
    const zeigeSchale = nurMarker(text.slice(beleg.von, beleg.bis)) && anfang === ende && anfang >= beleg.ganzVon && anfang <= beleg.ganzBis;
    markiere(beleg, text, anfang, ende, zeigeSchale, verdeckt, gedimmt);
    const bit = BIT.get(beleg.art) ?? 0;
    if (bit === 0) continue;
    const bis = Math.min(beleg.bis, text.length);
    for (let i = Math.max(0, beleg.von); i < bis; i += 1) {
      if (!verdeckt[i] && !gedimmt[i]) stil[i] |= bit;
    }
  }
  const teile: Decoration[] = [];
  let i = 0;
  while (i < text.length) {
    if (verdeckt[i]) {
      const kachel = kacheln.get(i);
      const bis = kachel ? kachel.bis : naechstesVerdeckt(text, verdeckt, i);
      const bereich = spanne(doc, text, i, bis);
      if (bereich) {
        if (kachel) {
          teile.push(Decoration.widget(bereich.from, kachel.male, {
            side: -1,
            ignoreSelection: true,
            stopEvent: () => true,
            key: `kachel-${kachel.von}`,
          }));
          const zeile = zeileDeko(doc, bereich.from, kachel.zeile);
          if (zeile) teile.push(zeile);
        }
        teile.push(Decoration.inline(bereich.from, bereich.to, { class: 'cm-marker-weg', 'aria-hidden': 'true' }));
      }
      i = bis;
      continue;
    }
    if (gedimmt[i]) {
      let j = i + 1;
      while (j < text.length && gedimmt[j] && text[j] !== '\n') j += 1;
      const bereich = spanne(doc, text, i, j);
      if (bereich) teile.push(Decoration.inline(bereich.from, bereich.to, { class: 'cm-wichtig-marker' }));
      i = j;
      continue;
    }
    const bit = stil[i] ?? 0;
    let j = i + 1;
    while (j < text.length && !verdeckt[j] && !gedimmt[j] && stil[j] === bit && text[j] !== '\n') j += 1;
    if (bit !== 0) {
      const bereich = spanne(doc, text, i, j);
      if (bereich) {
        const namen = klasse(bit);
        const attribut = stilAttribut(artenAus(bit));
        teile.push(Decoration.inline(bereich.from, bereich.to, attribut ? { class: namen, style: attribut } : { class: namen }));
      }
    }
    i = j;
  }
  teile.sort((a, b) => a.from - b.from || a.to - b.to);
  return DecorationSet.create(doc, teile);
}

function markiere(
  beleg: Beleg,
  text: string,
  anfang: number,
  ende: number,
  zeigeSchale: boolean,
  verdeckt: Uint8Array,
  gedimmt: Uint8Array,
): void {
  for (const [von, bis] of beleg.marker) {
    if (bis <= von) continue;
    const stopp = Math.min(bis, text.length);
    if (beleg.art === ART.wichtig && beleg.marker.length === 1) {
      const aktiv = anfang === ende ? anfang >= von && anfang <= stopp : anfang < stopp && ende > von;
      if (aktiv) continue;
      for (let i = Math.max(0, von); i < stopp; i += 1) {
        if (text[i] === '\n') break;
        gedimmt[i] = 1;
      }
      continue;
    }
    const imMarker = anfang === ende && anfang >= von && anfang <= stopp;
    if (zeigeSchale || imMarker) continue;
    for (let i = Math.max(0, von); i < stopp; i += 1) {
      if (text[i] === '\n') break;
      verdeckt[i] = 1;
    }
  }
}

export function erfassenSchmuck(hinweis: () => string): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        return baue(state, hinweis());
      },
    },
  });
}
