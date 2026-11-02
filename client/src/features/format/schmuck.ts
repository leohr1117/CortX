import { RangeSetBuilder, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { leseDokument, type Beleg } from '../../../../shared/features/format/index.ts';

const FETT = 1;
const KURSIV = 2;
const STRICH = 4;
const CODE = 8;
const LINK = 16;
const UEBER = 32;
const BLOCK = 64;

const BITS: Partial<Record<Beleg['art'], number>> = {
  fett: FETT,
  kursiv: KURSIV,
  streich: STRICH,
  code: CODE,
  link: LINK,
  ueberschrift: UEBER,
  codeblock: BLOCK,
};

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

function klasse(bit: number): string {
  const namen: string[] = [];
  if (bit & FETT) namen.push('cm-fett');
  if (bit & KURSIV) namen.push('cm-kursiv');
  if (bit & STRICH) namen.push('cm-strich');
  if (bit & CODE) namen.push('cm-code');
  if (bit & LINK) namen.push('cm-link');
  if (bit & UEBER) namen.push('cm-ueberschrift');
  if (bit & BLOCK) namen.push('cm-codeblock');
  return namen.join(' ');
}

function zeileAktiv(view: EditorView, von: number): boolean {
  const doc = view.state.doc;
  if (doc.length === 0) return true;
  const stelle = Math.max(0, Math.min(von, doc.length));
  const zeile = doc.lineAt(stelle === doc.length ? stelle - 1 : stelle);
  return view.state.selection.ranges.some((range) => {
    const anfang = doc.lineAt(range.from);
    const ende = doc.lineAt(Math.min(range.to, doc.length));
    return zeile.from < ende.to && zeile.to > anfang.from;
  });
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
  const kacheln = new Map<number, Kachel>();
  for (const beleg of leseDokument(text).belege) {
    for (const [von, bis] of beleg.marker) {
      if (bis <= von || zeileAktiv(view, von)) continue;
      const ende = Math.min(bis, text.length);
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
      if (!verdeckt[i]) stil[i] |= bit;
    }
  }
  const bau = new RangeSetBuilder<Decoration>();
  let i = 0;
  while (i < text.length) {
    if (verdeckt[i]) {
      const kachel = kacheln.get(i);
      if (kachel && kachel.bis > kachel.von) {
        bau.add(kachel.von, kachel.bis, Decoration.replace({ widget: kachel.widget }));
        i = kachel.bis;
        continue;
      }
      let j = i + 1;
      while (j < text.length && verdeckt[j] && !kacheln.has(j)) j += 1;
      if (j > i) bau.add(i, j, Decoration.replace({}));
      i = j;
      continue;
    }
    const bit = stil[i] ?? 0;
    let j = i + 1;
    while (j < text.length && !verdeckt[j] && stil[j] === bit) j += 1;
    if (bit !== 0) bau.add(i, j, Decoration.mark({ class: klasse(bit) }));
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
