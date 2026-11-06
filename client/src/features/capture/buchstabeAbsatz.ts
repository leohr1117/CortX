import type { Node } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { ART } from '../../../../shared/features/format/baum.ts';
import { NUMMER_ART } from '../../../../shared/features/format/nummer.ts';
import { speichere } from '../../../../shared/features/format/speichern.ts';

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

function zeilenQuelle(node: Node): string {
  const doc = node.type.schema.topNodeType.create(null, node);
  return ohneBruch(speichere(doc));
}

function inlineQuelle(node: Node): string {
  const absatz = node.type.schema.nodes.absatz;
  if (!absatz || node.content.size === 0) return '';
  const doc = node.type.schema.topNodeType.create(null, absatz.create(null, node.content));
  return ohneBruch(speichere(doc));
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
  const probe = schema.topNodeType.create(null, ersatz);
  if (ohneBruch(speichere(probe)) !== ganz) return null;
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
