import type { Node } from 'prosemirror-model';
import { TextSelection, type Selection } from 'prosemirror-state';
import { lade } from '../../../../shared/features/format/laden.ts';
import { modell } from '../../../../shared/features/format/modell.ts';
import { posFuer } from '../../../../shared/features/format/stelle.ts';

function absatzTyp() {
  const typ = modell.nodes.absatz;
  if (!typ) throw new Error('missing block');
  return typ;
}

function absatzMit(text: string, quelle = ''): Node {
  const attrs = { quelle, flucht: false };
  if (text.length === 0) return absatzTyp().create(attrs);
  return absatzTyp().create(attrs, modell.text(text));
}

function kernQuelle(quelle: string): string {
  const ohne = quelle.endsWith('\n') ? quelle.slice(0, -1) : quelle;
  return ohne.endsWith('\r') ? ohne.slice(0, -1) : ohne;
}

export function textAusDokument(doc: Node): string {
  if (doc.childCount === 0) return '';
  const zeilen: string[] = [];
  for (let i = 0; i < doc.childCount; i += 1) {
    const knoten = doc.child(i);
    zeilen.push(knoten.type.name === 'leerzeile' ? '' : knoten.textContent);
  }
  return zeilen.join('\n');
}

function ohneUeberschrift(doc: Node): Node {
  let anders = false;
  const kinder: Node[] = [];
  doc.forEach((knoten) => {
    if (knoten.type.name !== 'ueberschrift') {
      kinder.push(knoten);
      return;
    }
    anders = true;
    const quelle = String(knoten.attrs.quelle ?? '');
    kinder.push(absatzMit(kernQuelle(quelle), quelle));
  });
  if (!anders) return doc;
  return modell.node('doc', null, kinder);
}

function literal(text: string): Node {
  if (text.length === 0) return modell.node('doc', null, [absatzMit('')]);
  return modell.node('doc', null, text.split('\n').map((zeile) => absatzMit(zeile)));
}

export function dokumentFuer(text: string): Node {
  try {
    const doc = ohneUeberschrift(lade(text));
    if (textAusDokument(doc) === text) {
      if (doc.childCount === 0) return literal('');
      return doc;
    }
  } catch {
    return literal(text);
  }
  return literal(text);
}

export function auswahlAn(doc: Node, text: string, stelle: number): Selection {
  const pos = posFuer(doc, text, Math.max(0, Math.min(stelle, text.length)));
  const safe = Math.max(0, Math.min(pos, doc.content.size));
  return TextSelection.near(doc.resolve(safe));
}

export function hatUeberschrift(doc: Node): boolean {
  let gefunden = false;
  doc.descendants((knoten) => {
    if (knoten.type.name === 'ueberschrift') gefunden = true;
  });
  return gefunden;
}
