import { expect } from '@playwright/test';

// Heute steht der Text als Markdown in `text`. Ab dem Dokument-JSON liest derselbe Weg `doc`.
type PmKnoten = { type: string; text?: string; marks?: { type: string }[]; content?: PmKnoten[] };

export interface NotizAntwort {
  text?: string;
  doc?: PmKnoten;
}

export type MarkName = 'fett' | 'kursiv' | 'strich' | 'code';

export interface ServerBild {
  klartext: string;
  roh: string;
  marks: Record<MarkName, string[]>;
}

const MARKEN: readonly MarkName[] = ['fett', 'kursiv', 'strich', 'code'];

const MARK_TYP: Record<MarkName, RegExp> = {
  fett: /fett|strong|bold/i,
  kursiv: /kursiv|italic|\bem\b/i,
  strich: /strich|streich|strike/i,
  code: /^code$|mono/i,
};

function leereMarks(): Record<MarkName, string[]> {
  return { fett: [], kursiv: [], strich: [], code: [] };
}

function markenAus(roh: string): Record<MarkName, string[]> {
  const marks = leereMarks();
  let rest = roh;
  marks.code = [...rest.matchAll(/`([^`\n]+)`/g)].map((treffer) => treffer[1] ?? '');
  rest = rest.replace(/`([^`\n]+)`/g, ' ');
  marks.strich = [...rest.matchAll(/~~([^~\n]+)~~/g)].map((treffer) => treffer[1] ?? '');
  rest = rest.replace(/~~([^~\n]+)~~/g, ' ');
  marks.fett = [...rest.matchAll(/\*\*([^*\n]+)\*\*/g)].map((treffer) => treffer[1] ?? '');
  rest = rest.replace(/\*\*([^*\n]+)\*\*/g, ' ');
  marks.kursiv = [...rest.matchAll(/(^|[^*])\*([^*\n]+)\*(?!\*)/g)].map((treffer) => treffer[2] ?? '');
  return marks;
}

function ohneMarker(roh: string): string {
  return roh
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2');
}

function ohneZeilenSyntax(roh: string): string {
  return ohneMarker(roh)
    .split('\n')
    .map((zeile) => zeile.replace(/^(?:#{1,6} |= |\[] |\[x\] |[-*+] )/, ''))
    .join('\n');
}

function ausDoc(doc: PmKnoten): ServerBild {
  const zeilen: string[] = [];
  const marks = leereMarks();
  const lauf = (knoten: PmKnoten, zeile: string[]): void => {
    if (knoten.type === 'text') {
      const text = knoten.text ?? '';
      zeile.push(text);
      if (text.length === 0) return;
      for (const name of MARKEN) {
        if (knoten.marks?.some((mark) => MARK_TYP[name].test(mark.type))) marks[name].push(text);
      }
      return;
    }
    for (const kind of knoten.content ?? []) lauf(kind, zeile);
  };
  for (const block of doc.content ?? []) {
    const zeile: string[] = [];
    lauf(block, zeile);
    zeilen.push(zeile.join(''));
  }
  return { klartext: zeilen.join('\n'), roh: JSON.stringify(doc), marks };
}

export function ausServer(notiz: NotizAntwort): ServerBild {
  if (notiz.doc) return ausDoc(notiz.doc);
  const roh = notiz.text ?? '';
  return { klartext: ohneZeilenSyntax(roh), roh, marks: markenAus(roh) };
}

export function normSicht(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/[•\u200b]/g, '').replace(/\n+$/g, '');
}

export function serverUnverfaelscht(
  server: ServerBild,
  sichtbarText: string,
  marks: Partial<Record<MarkName, string[]>> = {},
): void {
  expect(server.roh, 'keine maskierten Sternchen im Speicher').not.toContain('\\*');
  expect(server.roh, 'keine maskierte Tilde im Speicher').not.toContain('\\~');
  expect(server.roh, 'kein maskiertes Gleich im Speicher').not.toContain('\\=');
  expect(normSicht(server.klartext), 'Klartext gleich sichtbarem Text').toBe(normSicht(sichtbarText));
  for (const name of MARKEN) {
    const erwartet = marks[name];
    if (erwartet !== undefined) expect(server.marks[name], name).toEqual(erwartet);
  }
}

export function keineDoppelteLeerstelle(roh: string): void {
  expect(roh, 'keine doppelte Leerstelle nach Listenstrich').not.toMatch(/^- {2,}/m);
  expect(roh, 'keine doppelte Leerstelle nach Kasten').not.toMatch(/^\[\] {2,}/m);
}

export function nur(name: MarkName, wort: string): Record<MarkName, string[]> {
  const marks = leereMarks();
  marks[name] = [wort];
  return marks;
}

export function ohneSchemaVersion(wert: unknown): unknown {
  if (wert === null || typeof wert !== 'object' || Array.isArray(wert)) return wert;
  const kopie = { ...(wert as Record<string, unknown>) };
  delete kopie.schema_version;
  return kopie;
}
