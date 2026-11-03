import { RangeSetBuilder, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { leseDokument, nurMarker, stilAttribut, type Beleg } from '../../../../shared/features/format/index.ts';

const FETT = 1;
const KURSIV = 2;
const STRICH = 4;
const CODE = 8;
const LINK = 16;
const UEBER = 32;
const BLOCK = 64;
const WICHTIG = 128;

const BITS: Partial<Record<Beleg['art'], number>> = {
  fett: FETT,
  kursiv: KURSIV,
  streich: STRICH,
  code: CODE,
  link: LINK,
  ueberschrift: UEBER,
  codeblock: BLOCK,
  wichtig: WICHTIG,
};

const ZEILEN_BALKEN = Decoration.line({ class: 'cm-wichtig-zeile' });
const MARKER_DIMM = Decoration.mark({ class: 'cm-wichtig-marker' });
const MARKER_WEG = Decoration.mark({ class: 'cm-marker-weg', attributes: { 'aria-hidden': 'true' } });

class PunktWidget extends WidgetType {
  eq(other: WidgetType): boolean {
    return other instanceof PunktWidget;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-punkt';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = '• ';
    return span;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

class NummerWidget extends WidgetType {
  zahl: string;
  constructor(zahl: string) {
    super();
    this.zahl = zahl;
  }
  eq(other: WidgetType): boolean {
    return other instanceof NummerWidget && other.zahl === this.zahl;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-nummer';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = `${this.zahl}. `;
    return span;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

class HakenWidget extends WidgetType {
  zu: boolean;
  constructor(zu: boolean) {
    super();
    this.zu = zu;
  }
  eq(other: WidgetType): boolean {
    return other instanceof HakenWidget && other.zu === this.zu;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = this.zu ? 'cm-haken zu' : 'cm-haken';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = this.zu ? '✓' : '';
    return span;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

interface Kachel {
  von: number;
  bis: number;
  widget: WidgetType;
}

function artenAus(bit: number): string[] {
  const arten: string[] = [];
  if (bit & CODE) arten.push('code');
  if (bit & WICHTIG) arten.push('wichtig');
  return arten;
}

function klasse(bit: number): string {
  const namen: string[] = [];
  if (bit & FETT) namen.push('cm-fett');
  if (bit & KURSIV) namen.push('cm-kursiv');
  if (bit & STRICH) namen.push('cm-strich');
  if (bit & CODE) namen.push('cm-code');
  if (bit & LINK) namen.push('cm-link');
  if (bit & UEBER) namen.push('cm-ueberschrift');
  if (bit & BLOCK) namen.push('cm-codeblock');
  if (bit & WICHTIG) namen.push('cm-wichtig');
  return namen.join(' ');
}

function markerAktiv(view: EditorView, von: number, bis: number): boolean {
  return view.state.selection.ranges.some((range) => {
    const anfang = Math.min(range.from, range.to);
    const ende = Math.max(range.from, range.to);
    if (anfang === ende) return anfang >= von && anfang <= bis;
    return anfang < bis && ende > von;
  });
}

function caretImMarker(view: EditorView, von: number, bis: number): boolean {
  return view.state.selection.ranges.some((range) => range.from === range.to && range.from >= von && range.from <= bis);
}

function caretInBeleg(view: EditorView, beleg: Beleg): boolean {
  return view.state.selection.ranges.some(
    (range) => range.from === range.to && range.from >= beleg.ganzVon && range.from <= beleg.ganzBis,
  );
}

function widgetFuer(beleg: Beleg): WidgetType | null {
  if (beleg.art === 'liste') return new PunktWidget();
  if (beleg.art === 'nummer') return new NummerWidget(beleg.zahl ?? '');
  if (beleg.art === 'haken') return new HakenWidget(beleg.abgehakt === true);
  return null;
}

function baue(view: EditorView): DecorationSet {
  const text = view.state.doc.toString();
  if (text.length === 0) return Decoration.none;
  const stil = new Uint8Array(text.length);
  const verdeckt = new Uint8Array(text.length);
  const gedimmt = new Uint8Array(text.length);
  const zeilen = new Set<number>();
  const kacheln = new Map<number, Kachel>();
  for (const beleg of leseDokument(text).belege) {
    const zeilenForm = beleg.art === 'wichtig' && beleg.marker.length === 1;
    if (zeilenForm) zeilen.add(beleg.ganzVon);
    const zeigeSchale = nurMarker(text.slice(beleg.von, beleg.bis)) && caretInBeleg(view, beleg);
    for (const [von, bis] of beleg.marker) {
      if (bis <= von) continue;
      const ende = Math.min(bis, text.length);
      if (beleg.art === 'wichtig') {
        if (!markerAktiv(view, von, ende)) {
          for (let i = Math.max(0, von); i < ende; i += 1) {
            if (text[i] === '\n') break;
            gedimmt[i] = 1;
          }
        }
        continue;
      }
      if (zeigeSchale || caretImMarker(view, von, ende)) continue;
      for (let i = Math.max(0, von); i < ende; i += 1) {
        if (text[i] === '\n') break;
        verdeckt[i] = 1;
      }
      const widget = widgetFuer(beleg);
      if (widget && beleg.marker[0]?.[0] === von) kacheln.set(von, { von, bis: ende, widget });
    }
    const bit = BITS[beleg.art] ?? 0;
    if (bit === 0) continue;
    const ende = Math.min(beleg.bis, text.length);
    for (let i = Math.max(0, beleg.von); i < ende; i += 1) {
      if (!verdeckt[i] && !gedimmt[i]) stil[i] |= bit;
    }
  }
  const bau = new RangeSetBuilder<Decoration>();
  let i = 0;
  while (i < text.length) {
    if (zeilen.has(i)) bau.add(i, i, ZEILEN_BALKEN);
    if (verdeckt[i]) {
      const kachel = kacheln.get(i);
      if (kachel && kachel.bis > kachel.von) {
        bau.add(kachel.von, kachel.bis, Decoration.replace({ widget: kachel.widget }));
        i = kachel.bis;
        continue;
      }
      let j = i + 1;
      while (j < text.length && verdeckt[j] && !kacheln.has(j) && !zeilen.has(j)) j += 1;
      if (j > i) bau.add(i, j, MARKER_WEG);
      i = j;
      continue;
    }
    if (gedimmt[i]) {
      let j = i + 1;
      while (j < text.length && gedimmt[j] && !kacheln.has(j) && !zeilen.has(j)) j += 1;
      if (j > i) bau.add(i, j, MARKER_DIMM);
      i = j;
      continue;
    }
    const bit = stil[i] ?? 0;
    let j = i + 1;
    while (j < text.length && !verdeckt[j] && !gedimmt[j] && stil[j] === bit && !zeilen.has(j)) j += 1;
    if (bit !== 0) {
      const attribut = stilAttribut(artenAus(bit));
      const marke = attribut
        ? Decoration.mark({ class: klasse(bit), attributes: { style: attribut } })
        : Decoration.mark({ class: klasse(bit) });
      bau.add(i, j, marke);
    }
    i = j;
  }
  return bau.finish();
}

export const schmuck: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = baue(view);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet) this.decorations = baue(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
