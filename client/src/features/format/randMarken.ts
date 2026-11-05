import type { Mark, ResolvedPos } from 'prosemirror-model';
import { isHistoryTransaction } from 'prosemirror-history';
import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import type { EditorView } from 'prosemirror-view';

interface Vorher {
  text: string;
  marks: readonly Mark[];
  offset: number;
}

interface Haltung {
  bild: Vorher | null;
  offen: boolean;
  sperre: boolean;
  tot: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  schluss: ReturnType<typeof setTimeout> | null;
  gehalten: readonly Mark[];
  anfang: number | null;
}

const NACH_KOMPOSITION_MS = 40;
const NACHZUEGE = 6;
const weiterKey = new PluginKey<readonly Mark[] | null>('randMarken');
const haltungen = new WeakMap<EditorView, Haltung>();
let aktiv: Haltung | null = null;

function markenAmRand($pos: ResolvedPos): readonly Mark[] {
  if ($pos.textOffset || !$pos.parent.isTextblock) return $pos.marks();
  const davor = $pos.nodeBefore?.marks ?? [];
  const danach = $pos.nodeAfter?.marks ?? [];
  return davor.filter((mark) => mark.isInSet(danach));
}

function merke(tr: Transaction, wert: readonly Mark[] | null, alt: EditorState): readonly Mark[] | null {
  if (isHistoryTransaction(tr) || tr.getMeta('programm') === true) return null;
  if (tr.selectionSet && !tr.docChanged && !tr.selection.eq(alt.selection)) return null;
  if (tr.storedMarks && tr.storedMarks.length) return tr.storedMarks;
  if (tr.docChanged && alt.storedMarks && alt.storedMarks.length) return alt.storedMarks;
  return wert;
}

function spanne(transactions: readonly Transaction[], index: number, punkt: number): { von: number; bis: number } {
  let von = transactions[index]!.mapping.map(punkt, -1);
  let bis = transactions[index]!.mapping.map(punkt, 1);
  for (let i = index + 1; i < transactions.length; i += 1) {
    von = transactions[i]!.mapping.map(von, -1);
    bis = transactions[i]!.mapping.map(bis, 1);
  }
  return { von, bis };
}

function exklusivAuf(doc: EditorState['doc'], von: number, bis: number): readonly Mark[] {
  let gemeinsam: readonly Mark[] | null = null;
  doc.nodesBetween(von, bis, (node) => {
    if (!node.isText) return;
    const exklusiv = node.marks.filter((mark) => mark.type.spec.inclusive === false);
    gemeinsam = gemeinsam === null ? exklusiv : gemeinsam.filter((mark) => mark.isInSet(exklusiv));
  });
  return gemeinsam ?? [];
}

function stelleZurueck(transactions: readonly Transaction[], neu: EditorState, basis: Transaction): Transaction | null {
  let korrektur: Transaction | null = null;
  transactions.forEach((tr, index) => {
    if (tr.getMeta('composition') == null) return;
    tr.steps.forEach((step) => {
      if (!(step instanceof ReplaceStep) || step.from === step.to) return;
      const altText = tr.before.textBetween(step.from, step.to);
      if (!altText) return;
      const neuText = step.slice.content.textBetween(0, step.slice.content.size);
      const fund = neuText.indexOf(altText);
      if (fund < 0) return;
      const marks = exklusivAuf(tr.before, step.from, step.to);
      if (!marks.length) return;
      let von = tr.mapping.map(step.from, -1) + fund;
      let bis = von + altText.length;
      for (let i = index + 1; i < transactions.length; i += 1) {
        von = transactions[i]!.mapping.map(von, -1);
        bis = transactions[i]!.mapping.map(bis, 1);
      }
      if (bis <= von || bis > neu.doc.content.size) return;
      if (neu.doc.textBetween(von, bis) !== altText) return;
      for (const mark of marks) {
        if (neu.doc.rangeHasMark(von, bis, mark.type)) continue;
        korrektur = (korrektur ?? basis).addMark(von, bis, mark);
      }
    });
  });
  return korrektur;
}

function loeseRand(
  transactions: readonly Transaction[],
  alt: EditorState,
  neu: EditorState,
): Transaction | null {
  if (transactions.some((tr) => isHistoryTransaction(tr) || tr.getMeta('programm') === true)) return null;
  const weiter = weiterKey.getState(alt) ?? [];
  let korrektur: Transaction | null = null;
  transactions.forEach((tr, index) => {
    if (tr.storedMarks || tr.getMeta('uiEvent') || tr.getMeta('composition') != null || tr.steps.length !== 1) return;
    const step = tr.steps[0];
    if (!(step instanceof ReplaceStep) || step.from !== step.to) return;
    const text = step.slice.content.firstChild;
    if (!text?.isText || step.slice.content.childCount !== 1) return;
    const $pos = tr.before.resolve(step.from);
    const erlaubt = markenAmRand($pos);
    const geerbt = $pos.marks();
    const bereich = spanne(transactions, index, step.from);
    if (bereich.bis <= bereich.von || bereich.bis > neu.doc.content.size) return;
    for (const mark of text.marks) {
      if (!mark.isInSet(geerbt) || mark.isInSet(erlaubt) || mark.isInSet(weiter)) continue;
      if (!neu.doc.rangeHasMark(bereich.von, bereich.bis, mark.type)) continue;
      korrektur = (korrektur ?? neu.tr).removeMark(bereich.von, bereich.bis, mark);
    }
  });
  return korrektur;
}

function einseitige(state: EditorState): readonly Mark[] {
  const $pos = state.selection.$from;
  if ($pos.textOffset || !$pos.parent.isTextblock) return [];
  const erlaubt = markenAmRand($pos);
  return $pos.marks().filter((mark) => mark.type.spec.inclusive !== false && !mark.isInSet(erlaubt));
}

function nimmWeg(
  state: EditorState,
  basis: Transaction | null,
  von: number,
  bis: number,
  marks: readonly Mark[],
  weiter: readonly Mark[],
): Transaction | null {
  if (bis <= von) return basis;
  let aus = basis;
  for (const mark of marks) {
    if (mark.isInSet(weiter)) continue;
    if (!state.doc.rangeHasMark(von, bis, mark.type)) continue;
    aus = (aus ?? state.tr).removeMark(von, bis, mark);
  }
  return aus;
}

function textJetzt(state: EditorState): string | null {
  const $pos = state.selection.$from;
  if (!state.selection.empty || !$pos.parent.isTextblock) return null;
  return $pos.parent.textContent;
}

function passt(text: string, gemerkt: Vorher): boolean {
  const kopf = gemerkt.text.slice(0, gemerkt.offset);
  const schwanz = gemerkt.text.slice(gemerkt.offset);
  return text.length >= gemerkt.text.length && text.startsWith(kopf) && text.endsWith(schwanz);
}

function schnappschuss(state: EditorState): Vorher | null {
  const $pos = state.selection.$from;
  if (!state.selection.empty || !$pos.parent.isTextblock) return null;
  if (state.storedMarks && state.storedMarks.length) return null;
  const marks = einseitige(state);
  if (!marks.length) return null;
  return { text: $pos.parent.textContent, marks, offset: $pos.parentOffset };
}

function zusatzAuf(state: EditorState, basis: Transaction | null, gemerkt: Vorher): Transaction | null {
  let text = '';
  let start = -1;
  const $pos = state.selection.$from;
  if (state.selection.empty && $pos.parent.isTextblock) {
    const hier = $pos.parent.textContent;
    if (passt(hier, gemerkt) && hier !== gemerkt.text) {
      text = hier;
      start = $pos.start();
    }
  }
  if (start < 0) {
    state.doc.descendants((node, pos) => {
      if (start >= 0 || !node.isTextblock) return;
      const hier = node.textContent;
      if (!passt(hier, gemerkt) || hier === gemerkt.text) return;
      text = hier;
      start = pos + 1;
    });
  }
  if (start < 0) return basis;
  const schwanz = gemerkt.text.length - gemerkt.offset;
  const bis = text.length - schwanz;
  if (bis <= gemerkt.offset) return basis;
  const weiter = weiterKey.getState(state) ?? [];
  return nimmWeg(state, basis, start + gemerkt.offset, start + bis, gemerkt.marks, weiter);
}

function zusatzMarken(view: EditorView, gemerkt: Vorher): Transaction | null {
  return zusatzAuf(view.state, null, gemerkt);
}

const HALT_EXKLUSIV = 'exklusivGehalten';

function bereichDanach(
  transactions: readonly Transaction[],
  trIndex: number,
  stepIndex: number,
  von: number,
  bis: number,
): { von: number; bis: number } {
  let start = von;
  let ende = bis;
  const schritte = transactions[trIndex]!.steps;
  for (let i = stepIndex + 1; i < schritte.length; i += 1) {
    start = schritte[i]!.getMap().map(start, -1);
    ende = schritte[i]!.getMap().map(ende, 1);
  }
  for (let i = trIndex + 1; i < transactions.length; i += 1) {
    start = transactions[i]!.mapping.map(start, -1);
    ende = transactions[i]!.mapping.map(ende, 1);
  }
  return { von: start, bis: ende };
}
function exklusiv(marks: readonly Mark[] | null | undefined): readonly Mark[] {
  return (marks ?? []).filter((mark) => mark.type.spec.inclusive === false);
}
function merkeGehalten(transactions: readonly Transaction[], alt: EditorState): boolean {
  if (!aktiv) return false;
  const gesetzt = transactions.find((tr) => tr.storedMarksSet && tr.getMeta('composition') == null);
  if (gesetzt) {
    aktiv.gehalten = exklusiv(gesetzt.storedMarks);
    return false;
  }
  if (transactions.some((tr) => tr.getMeta('composition') != null)) {
    const marks = exklusiv(alt.storedMarks);
    if (marks.length) aktiv.gehalten = marks;
    return true;
  }
  if (transactions.some((tr) => !tr.docChanged && tr.selectionSet && !tr.selection.eq(alt.selection))) aktiv.gehalten = [];
  return false;
}
function schliesseExklusiv(view: EditorView, haltung: Haltung): void {
  if (haltung.schluss) clearTimeout(haltung.schluss);
  const von = haltung.anfang;
  haltung.schluss = setTimeout(() => {
    haltung.schluss = null;
    const marks = haltung.gehalten;
    const state = view.state;
    const bis = state.selection.from;
    if (haltung.tot || haltung.sperre || haltung.offen || von == null || !marks.length || !state.selection.empty) return;
    if (bis <= von || bis > state.doc.content.size) return;
    let tr = state.tr.setMeta('addToHistory', false);
    for (const mark of marks) tr = tr.addMark(von, bis, mark);
    const bisher = [...(state.storedMarks ?? [])];
    for (const mark of marks) if (!bisher.some((da) => da.eq(mark))) bisher.push(mark);
    tr.setStoredMarks(bisher).setMeta(HALT_EXKLUSIV, true);
    haltung.sperre = true;
    view.dispatch(tr);
    haltung.sperre = false;
  }, 0);
}
function halteExklusiv(
  transactions: readonly Transaction[],
  alt: EditorState,
  neu: EditorState,
  basis: Transaction | null,
): Transaction | null {
  if (transactions.some((tr) => tr.getMeta(HALT_EXKLUSIV) === true)) return basis;
  if (merkeGehalten(transactions, alt)) return basis;
  if (!alt.selection.empty || !alt.storedMarks?.length) return basis;
  if (!transactions.some((tr) => tr.docChanged)) return basis;
  if (transactions.some((tr) => isHistoryTransaction(tr) || tr.getMeta('programm') === true)) return basis;
  const marks = exklusiv(alt.storedMarks);
  if (!marks.length || !neu.selection.empty) return basis;
  let aus = basis;
  transactions.forEach((tr, trIndex) => {
    tr.steps.forEach((step, stepIndex) => {
      if (!(step instanceof ReplaceStep) || step.slice.size === 0) return;
      let bereich = bereichDanach(transactions, trIndex, stepIndex, step.from, step.from + step.slice.size);
      if (aus?.steps.length) {
        bereich = {
          von: aus.mapping.map(bereich.von, -1),
          bis: aus.mapping.map(bereich.bis, 1),
        };
      }
      const doc = aus?.doc ?? neu.doc;
      if (bereich.von < 0 || bereich.bis > doc.content.size || bereich.bis <= bereich.von) return;
      for (const mark of marks) aus = (aus ?? neu.tr).addMark(bereich.von, bereich.bis, mark);
    });
  });
  const bisher = [...(neu.storedMarks ?? [])];
  for (const mark of marks) {
    if (!bisher.some((da) => da.eq(mark))) bisher.push(mark);
  }
  aus = (aus ?? neu.tr).setStoredMarks(bisher).setMeta(HALT_EXKLUSIV, true);
  return aus;
}

function wende(view: EditorView, haltung: Haltung, tr: Transaction | null): void {
  if (haltung.sperre || haltung.tot || !tr?.docChanged) return;
  haltung.sperre = true;
  view.dispatch(tr);
  haltung.sperre = false;
}

function nachziehen(view: EditorView, haltung: Haltung, gemerkt: Vorher, rest: number): void {
  if (haltung.timer) clearTimeout(haltung.timer);
  haltung.timer = setTimeout(() => {
    haltung.timer = null;
    if (haltung.tot) return;
    const text = textJetzt(view.state);
    const frueh = !text || text === gemerkt.text;
    if (!frueh && passt(text, gemerkt)) wende(view, haltung, zusatzMarken(view, gemerkt));
    if (rest > 0 && (frueh || view.composing)) nachziehen(view, haltung, gemerkt, rest - 1);
  }, rest === NACHZUEGE ? 0 : NACH_KOMPOSITION_MS);
}

export function randPlugins(): Plugin[] {
  return [
    new Plugin<readonly Mark[] | null>({
      key: weiterKey,
      state: {
        init(): readonly Mark[] | null {
          return null;
        },
        apply(tr, wert, alt) {
          return merke(tr, wert, alt);
        },
      },
      appendTransaction(transactions, alt, neu) {
        const geloest = loeseRand(transactions, alt, neu);
        const basis = geloest ?? neu.tr;
        const zurueck = stelleZurueck(transactions, neu, basis);
        let ergebnis = zurueck ?? geloest;
        const bild = aktiv?.bild;
        const historie = transactions.some((tr) => isHistoryTransaction(tr) || tr.getMeta('programm') === true);
        if (bild && aktiv && !aktiv.offen && !historie) {
          ergebnis = zusatzAuf(neu, ergebnis, bild);
        }
        if (!historie) ergebnis = halteExklusiv(transactions, alt, neu, ergebnis);
        if (!ergebnis) return null;
        if (ergebnis.steps.length > 0 || ergebnis.storedMarksSet) return ergebnis;
        return null;
      },
      view(editorView) {
        const haltung: Haltung = {
          bild: null, offen: false, sperre: false, tot: false, timer: null, schluss: null, gehalten: [], anfang: null,
        };
        haltungen.set(editorView, haltung);
        aktiv = haltung;
        return {
          update(view, prev) {
            if (haltung.sperre || haltung.offen || view.composing) return;
            if (prev && !view.state.doc.eq(prev.doc)) {
              const gemerkt = haltung.bild;
              if (!gemerkt) return;
              const text = textJetzt(view.state);
              if (!text || text === gemerkt.text || !passt(text, gemerkt)) return;
              wende(view, haltung, zusatzMarken(view, gemerkt));
              return;
            }
            if (!prev || !view.state.selection.eq(prev.selection) || !haltung.bild) {
              haltung.bild = schnappschuss(view.state);
            }
          },
          destroy() {
            haltung.tot = true;
            if (haltung.timer) clearTimeout(haltung.timer);
            haltung.timer = null;
            if (haltung.schluss) clearTimeout(haltung.schluss);
            haltung.schluss = null;
            haltungen.delete(editorView);
            if (aktiv === haltung) aktiv = null;
          },
        };
      },
      props: {
        handleDOMEvents: {
          compositionstart(view) {
            const haltung = haltungen.get(view);
            if (!haltung) return false;
            if (!haltung.bild) haltung.bild = schnappschuss(view.state);
            haltung.offen = true;
            const marks = exklusiv(view.state.storedMarks);
            if (marks.length) haltung.gehalten = marks;
            if (haltung.gehalten.length && view.state.selection.empty) haltung.anfang = view.state.selection.from;
            return false;
          },
          compositionend(view) {
            const haltung = haltungen.get(view);
            if (!haltung) return false;
            haltung.offen = false;
            if (haltung.bild) nachziehen(view, haltung, haltung.bild, NACHZUEGE);
            schliesseExklusiv(view, haltung);
            return false;
          },
        },
      },
    }),
  ];
}
