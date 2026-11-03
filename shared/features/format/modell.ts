import { Schema, type MarkSpec, type NodeSpec } from 'prosemirror-model';
import { ART } from './baum.ts';
import { formatVon, inlineFormate, type FormatId } from './register.ts';

const ZEILE = 'zeile';

interface AttributQuelle {
  standard?: string | number | boolean;
  format?: FormatId;
}

interface ZeileAngabe {
  name: string;
  inhalt?: string;
  code?: boolean;
  attribute?: Readonly<Record<string, AttributQuelle>>;
}

const ZEILEN: readonly ZeileAngabe[] = [
  { name: 'absatz', inhalt: 'inline*' },
  {
    name: 'ueberschrift',
    inhalt: 'inline*',
    attribute: {
      stufe: { standard: 0 },
      zeichen: { format: ART.ueberschrift },
    },
  },
  { name: 'wichtigZeile', inhalt: 'inline*' },
  {
    name: 'punkt',
    inhalt: 'inline*',
    attribute: {
      art: { standard: ART.liste },
      abgehakt: { standard: false },
      zeichen: { format: ART.liste },
      einzug: { standard: 0 },
    },
  },
  {
    name: 'codeblock',
    inhalt: 'text*',
    code: true,
    attribute: { zaun: { format: ART.codeblock } },
  },
  { name: 'leerzeile' },
];

function erstesZeichen(id: FormatId): string {
  const zeichen = formatVon(id).zeichen[0];
  if (!zeichen) throw new Error('missing character');
  return zeichen;
}

function verlangt(wert: unknown): void {
  if (wert == null) throw new RangeError('missing attribute');
}

function attrsVon(angaben: Readonly<Record<string, AttributQuelle>>): NonNullable<NodeSpec['attrs']> {
  const attrs: NonNullable<NodeSpec['attrs']> = {};
  for (const [name, angabe] of Object.entries(angaben)) {
    if (angabe.format) {
      attrs[name] = { default: erstesZeichen(angabe.format) };
      continue;
    }
    if (angabe.standard !== undefined) attrs[name] = { default: angabe.standard };
    else attrs[name] = { validate: verlangt };
  }
  return attrs;
}

function zeilenKnoten(): Record<string, NodeSpec> {
  const spec: Record<string, NodeSpec> = {
    doc: { content: `${ZEILE}*` },
    text: { group: 'inline' },
  };
  for (const zeile of ZEILEN) {
    const knoten: NodeSpec = { group: ZEILE };
    if (zeile.inhalt) knoten.content = zeile.inhalt;
    if (zeile.code) {
      knoten.code = true;
      knoten.marks = '';
    }
    if (zeile.attribute) knoten.attrs = attrsVon(zeile.attribute);
    spec[zeile.name] = knoten;
  }
  return spec;
}

function marken(): Record<string, MarkSpec> {
  const spec: Record<string, MarkSpec> = {};
  for (const format of inlineFormate()) {
    spec[format.id] = format.marken ? { attrs: attrsVon(format.marken) } : {};
  }
  return spec;
}

export const modell = new Schema({
  nodes: zeilenKnoten(),
  marks: marken(),
  topNode: 'doc',
});
