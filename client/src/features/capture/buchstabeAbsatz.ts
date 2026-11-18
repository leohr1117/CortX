import type { Node } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { ART } from '../../../../shared/features/format/baum.ts';
import { knotenZuMarkdownOffset } from '../../../../shared/features/format/knotenOffset.ts';
import { schreibStuecke } from '../../../../shared/features/format/knotenSyntax.ts';
import { NUMMER_ART, erkenne } from '../../../../shared/features/format/nummer.ts';

function istBuchstabe(node: Node): boolean {
  if (node.type.name !== 'punkt') return false;
  if (String(node.attrs.art ?? '') !== ART.nummer) return false;
  const schrift = String(node.attrs.nummerArt ?? '');
  return schrift !== '' && schrift !== NUMMER_ART.zahl;
}

export function hatBuchstabenZeile(doc: Node): boolean {
  for (let i = 0; i < doc.childCount; i += 1) {
    if (istBuchstabe(doc.child(i))) return true;
  }
  return false;
}

function ohneBruch(text: string): string {
  return text.replace(/\r?\n$/, '');
}

function zeichen(stueck: { text: string } | undefined): string {
  return ohneBruch(stueck?.text ?? '');
}

function versuch(node: Node) {
  return schreibStuecke(node, 0, [node]);
}

function inhaltAbsatz(node: Node): Node | null {
  const absatz = node.type.schema.nodes.absatz;
  if (!absatz) return null;
  if (node.content.size === 0) return absatz.create();
  return absatz.create(null, node.content);
}

function hatMarken(node: Node): boolean {
  let marken = false;
  node.descendants((kind) => {
    if (kind.isText && kind.marks.length > 0) marken = true;
  });
  return marken;
}

function sichtbar(text: string, syntax: readonly boolean[]): string {
  let aus = '';
  for (let i = 0; i < text.length; i += 1) {
    const z = text[i] ?? '';
    if (syntax[i] || z === '\n' || z === '\r') continue;
    aus += z;
  }
  return aus;
}

function quelleKern(node: Node): string | null {
  const roh = String(node.attrs.quelle ?? '');
  const kern = ohneBruch(roh);
  if (kern.length === 0) return null;
  const fund = erkenne(kern);
  if (!fund || fund.art !== String(node.attrs.nummerArt ?? '')) return null;
  if (Number(node.attrs.nummer) !== 1) return null;
  const doc = node.type.schema.topNodeType.create(null, node);
  if (sichtbar(roh, knotenZuMarkdownOffset(doc, roh).syntax) !== node.textContent) return null;
  const inline = inhaltAbsatz(node);
  if (!inline) return null;
  const rest = kern.slice(fund.laenge);
  const texte = new Set(versuch(inline).alle.map((stueck) => zeichen(stueck)));
  if (texte.has(rest)) return kern;
  if (rest === node.textContent && !hatMarken(node)) return kern;
  return null;
}

function zeilenQuelle(node: Node): string {
  return quelleKern(node) ?? zeichen(versuch(node).bevorzugt[0]);
}

function inlineQuelle(node: Node): string {
  if (node.content.size === 0) return '';
  const inline = inhaltAbsatz(node);
  return inline ? zeichen(versuch(inline).bevorzugt[0]) : '';
}

function alsAbsatz(node: Node): Node | null {
  const schema = node.type.schema;
  const absatz = schema.nodes.absatz;
  if (!absatz) return null;
  const ganz = zeilenQuelle(node);
  const inline = inlineQuelle(node);
  if (inline.length > 0 && !ganz.endsWith(inline)) return null;
  const prefix = ganz.slice(0, ganz.length - inline.length);
  let inhalt = node.content;
  if (prefix.length > 0) inhalt = inhalt.addToStart(schema.text(prefix));
  const ersatz = inhalt.size > 0 ? absatz.create(null, inhalt) : absatz.create();
  if (zeichen(versuch(ersatz).fallback) !== ganz) return null;
  return ersatz;
}

function leererKasten(view: { state: { doc: Node; selection: { from: number } } }, from: number): boolean {
  const stelle = view.state.doc.resolve(from);
  const parent = stelle.parent;
  return parent.type.name === 'punkt'
    && String(parent.attrs.art ?? '') === ART.haken
    && parent.content.size === 0
    && stelle.parentOffset === 0;
}

export function buchstabenBleibenText(): Plugin {
  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== ' ' || from !== to) return false;
        return leererKasten(view, from);
      },
    },
    appendTransaction(trs, _alt, neu) {
      if (trs.some((tr) => tr.getMeta('buchstabeText'))) return null;
      const pruefen = trs.some((tr) => tr.docChanged || tr.getMeta('pruefeBuchstabe') === true);
      if (!pruefen) return null;
      const treffer: { pos: number; node: Node; ersatz: Node }[] = [];
      neu.doc.forEach((node, pos) => {
        if (!istBuchstabe(node)) return;
        const ersatz = alsAbsatz(node);
        if (ersatz) treffer.push({ pos, node, ersatz });
      });
      if (treffer.length === 0) return null;
      let tr = neu.tr;
      for (let i = treffer.length - 1; i >= 0; i -= 1) {
        const eintrag = treffer[i]!;
        tr = tr.replaceWith(eintrag.pos, eintrag.pos + eintrag.node.nodeSize, eintrag.ersatz);
      }
      tr = tr.setMeta('buchstabeText', true);
      if (!trs.some((eintrag) => eintrag.docChanged)) tr = tr.setMeta('addToHistory', false);
      return tr;
    },
  });
}
