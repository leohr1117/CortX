import { readFileSync } from 'node:fs';
import { type Mark, type Node } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { ART } from './baum.ts';
import { schalteCode, schalteFett, schalteKursiv, schalteStrich, schalteWichtig } from './befehl.ts';
import { lade } from './laden.ts';
import { modell } from './modell.ts';
import { formatVon, type InlineArt } from './register.ts';
import { speichere } from './speichern.ts';

const PAARE: readonly InlineArt[] = ['fett', 'kursiv', 'streich', 'wichtig', 'code'];

const schalter = {
  fett: schalteFett,
  kursiv: schalteKursiv,
  streich: schalteStrich,
  wichtig: schalteWichtig,
  code: schalteCode,
} as const;

function unescape(roh: string): string {
  return roh.replace(/\\n|\\r|\\t|\\'|\\"|\\\\/g, (treffer) => {
    if (treffer === '\\n') return '\n';
    if (treffer === '\\r') return '\r';
    if (treffer === '\\t') return '\t';
    if (treffer === "\\'") return "'";
    if (treffer === '\\"') return '"';
    return '\\';
  });
}

function beispiele(pfad: string): string[] {
  const quelle = readFileSync(pfad, 'utf8');
  const aus: string[] = [];
  for (const fund of quelle.matchAll(/(?:leseBaum|belege)\(\s*(['"])([\s\S]*?)\1/g)) aus.push(unescape(fund[2] ?? ''));
  return aus;
}

function ohneQuelle(wert: unknown): unknown {
  if (Array.isArray(wert)) return wert.map(ohneQuelle);
  if (!wert || typeof wert !== 'object') return wert;
  const aus: Record<string, unknown> = {};
  for (const [key, eintrag] of Object.entries(wert)) {
    if (key === 'quelle') continue;
    aus[key] = ohneQuelle(eintrag);
  }
  return aus;
}

function doc(kinder: Node[]): Node {
  return modell.node('doc', null, kinder);
}

function absatz(text: string, marks: readonly Mark[] = [], quelle = ''): Node {
  const inhalt = text.length > 0 ? modell.text(text, marks) : null;
  return modell.nodes.absatz!.createChecked({ quelle }, inhalt);
}

function marken(...namen: string[]): Mark[] {
  return namen.map((name) => {
    const typ = modell.marks[name];
    if (!typ) throw new Error('missing mark');
    if (name === ART.link) return typ.create({ ziel: 'https://example.com/a' });
    return typ.create();
  });
}

function runde(knoten: Node): void {
  const zurueck = lade(speichere(knoten));
  expect(ohneQuelle(zurueck.toJSON())).toEqual(ohneQuelle(knoten.toJSON()));
}

function zufall(seed: number): () => number {
  let stand = seed >>> 0;
  return () => {
    stand = (Math.imul(1664525, stand) + 1013904223) >>> 0;
    return stand / 4294967296;
  };
}

function wort(rng: () => number, texte: readonly string[]): string {
  return texte[Math.floor(rng() * texte.length)] ?? 'a';
}

function inline(rng: () => number): Node[] {
  const texte = ['Anna', '5 * 3', 'Milch', 'a_b', '100%'];
  const namen = ['fett', 'kursiv', 'strich', 'wichtig', 'code'] as const;
  const aus: Node[] = [];
  const teile = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < teile; i += 1) {
    if (i > 0 && rng() < 0.4) aus.push(modell.text(' '));
    const marks = namen.filter(() => rng() < 0.35).map((name) => modell.marks[name]!.create());
    const rahmen = marks.some((mark) => mark.type.name === 'fett' || mark.type.name === 'kursiv' || mark.type.name === 'strich');
    if (marks.some((mark) => mark.type.name === 'wichtig') && !rahmen) marks.push(modell.marks.fett!.create());
    if (rng() < 0.15) marks.push(modell.marks.link!.create({ ziel: 'https://example.com/a' }));
    aus.push(modell.text(wort(rng, texte), marks));
  }
  return aus;
}

function baue(seed: number): Node {
  const rng = zufall(seed);
  const kinder: Node[] = [];
  const bloecke = 1 + Math.floor(rng() * 5);
  for (let i = 0; i < bloecke; i += 1) {
    const art = Math.floor(rng() * 8);
    const inhalt = inline(rng);
    if (art === 0) kinder.push(modell.nodes.leerzeile!.createChecked());
    else if (art === 1) kinder.push(modell.nodes.ueberschrift!.createChecked({ stufe: 0, zeichen: '=' }, inhalt));
    else if (art === 2) kinder.push(modell.nodes.ueberschrift!.createChecked({ stufe: 2, zeichen: '#' }, inhalt));
    else if (art === 3) kinder.push(modell.nodes.wichtigZeile!.createChecked(null, inhalt));
    else if (art === 4) kinder.push(modell.nodes.punkt!.createChecked(null, inhalt));
    else if (art === 5) kinder.push(modell.nodes.punkt!.createChecked({ art: ART.nummer, zeichen: '1.' }, inhalt));
    else if (art === 6) {
      const abgehakt = rng() < 0.5;
      kinder.push(modell.nodes.punkt!.createChecked({ art: ART.haken, abgehakt, zeichen: abgehakt ? '[x]' : '[]' }, inhalt));
    } else {
      const zaun = rng() < 0.5 ? '```' : '~~~';
      kinder.push(
        modell.nodes.codeblock!.createChecked({ zaun }),
        modell.nodes.codeblock!.createChecked({ zaun }, modell.text('const a = 1')),
        modell.nodes.codeblock!.createChecked({ zaun }, modell.text('**not** = #tag')),
        modell.nodes.codeblock!.createChecked({ zaun }),
      );
    }
  }
  return doc(kinder);
}

describe('save a line document back to text', () => {
  const corpus = [
    ...beispiele('shared/features/format/lesen.test.ts'),
    ...beispiele('shared/features/format/mehr.test.ts'),
    ...beispiele('shared/features/format/verschachtelt.test.ts'),
    ...beispiele('shared/features/format/wichtig.test.ts'),
    '',
    '****',
    '= Title',
    '# Title',
    '## Section',
    '= **Anna**',
    '[] open',
    '[x] done',
    '- [ ] open',
    '- [x] done',
    '__fett__',
    '_kursiv_',
    '+ milk',
    '* bread',
    '**abc',
    '5 * 3',
    'siehe \\*stern\\*',
    'a\r\nb',
    'ende  \n',
    '```\n**not**\n= no\n#nope\n```',
    '~~~js\n**not**\n~~~',
    '#thema/seite',
    '#thema/seite/abschnitt',
    '#tag',
    'morgen 15 Uhr',
    '03.11.2026 15:30',
    '[] call\n   later',
    '- **milk** and bread\r\n- eggs',
  ];

  it('writes an untouched document back byte for byte', () => {
    expect(globalThis.document).toBeUndefined();
    expect(corpus.length).toBeGreaterThan(20);
    for (const text of corpus) expect(speichere(lade(text)), JSON.stringify(text)).toBe(text);
  });

  it('rewrites only the edited line in register spelling', () => {
    const text = 'oben\r\n__fett__\n_unten_\n';
    const geladen = lade(text);
    const mitte = geladen.child(1);
    const neu = mitte.type.create({ ...mitte.attrs, quelle: '' }, mitte.content);
    const kinder: Node[] = [];
    geladen.forEach((knoten, _offset, index) => kinder.push(index === 1 ? neu : knoten));
    const fett = formatVon(ART.fett).zeichen[0] ?? '';
    expect(speichere(doc(kinder))).toBe(`oben\r\n${fett}fett${fett}\n_unten_\n`);
  });

  it('keeps neighbouring lines when the edited line keeps its source', () => {
    const text = 'eins\n__zwei__\ndrei';
    const geladen = lade(text);
    const mitte = geladen.child(1);
    const fett = modell.marks.fett!.create();
    const neu = mitte.type.create(mitte.attrs, modell.text('Zwei', [fett]));
    const kinder: Node[] = [];
    geladen.forEach((knoten, _offset, index) => kinder.push(index === 1 ? neu : knoten));
    const zeichen = formatVon(ART.fett).zeichen[0] ?? '';
    expect(speichere(doc(kinder))).toBe(`eins\n${zeichen}Zwei${zeichen}\ndrei`);
  });

  it('moves edge spaces out, merges a marked gap, and leaves a plain gap', () => {
    const fett = modell.marks.fett!.create();
    expect(speichere(doc([absatz('a ', [fett])]))).toBe(`**a** `);
    expect(speichere(doc([absatz('a b', [fett])]))).toBe('**a b**');
    const gemischt = modell.nodes.absatz!.createChecked(null, [
      modell.text('a', [fett]),
      modell.text(' '),
      modell.text('b', [fett]),
    ]);
    expect(speichere(doc([gemischt]))).toBe('**a** **b**');
  });

  it('escapes only characters that would become a format', () => {
    expect(speichere(doc([absatz('5 * 3')]))).toBe('5 * 3');
    expect(speichere(doc([absatz('**abc')]))).toBe('**abc');
    expect(speichere(doc([absatz('*hello*')]))).toBe('\\*hello\\*');
    expect(speichere(doc([absatz('~~done~~')]))).toBe('\\~\\~done\\~\\~');
  });

  it('escapes a line shortcut typed with shortcuts off and keeps the old bytes otherwise', () => {
    const liste = modell.nodes.absatz!.createChecked({ flucht: true }, modell.text('- Milch'));
    const kopf = modell.nodes.absatz!.createChecked({ flucht: true }, modell.text('# Titel'));
    expect(speichere(doc([liste]))).toBe('\\- Milch');
    expect(speichere(doc([kopf]))).toBe('\\# Titel');
    expect(lade('\\- Milch').textContent).toBe('- Milch');
    expect(lade('\\- Milch').child(0).type.name).toBe('absatz');
    expect(lade('\\# Titel').textContent).toBe('# Titel');
    expect(speichere(lade('\\- Milch'))).toBe('\\- Milch');
    expect(speichere(lade('\\# Titel'))).toBe('\\# Titel');
    expect(speichere(doc([absatz('- Milch')]))).toBe('- Milch');
    expect(speichere(doc([absatz('# Titel')]))).toBe('# Titel');
  });

  it('round-trips each inline format and each pair from the nesting examples', () => {
    for (const name of ['fett', 'kursiv', 'strich', 'wichtig', 'code'] as const) runde(doc([absatz('Hi', marken(name))]));
    runde(doc([absatz('Hi', marken(ART.link))]));
    for (const a of PAARE) {
      for (const b of PAARE) {
        if (a >= b) continue;
        for (const reihe of [
          [a, b],
          [b, a],
        ] as const) {
          const einmal = schalter[reihe[0]]('Hi', 0, 2);
          const beide = schalter[reihe[1]](einmal.text, einmal.start, einmal.ende);
          expect(speichere(lade(beide.text)), beide.text).toBe(beide.text);
        }
        runde(doc([absatz('Hi', marken(a === 'streich' ? 'strich' : a, b === 'streich' ? 'strich' : b))]));
      }
    }
  });

  it('reloads a saved random document as the same document', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const knoten = baue(seed);
      const text = speichere(knoten);
      const ist = JSON.stringify(ohneQuelle(lade(text).toJSON()));
      const soll = JSON.stringify(ohneQuelle(knoten.toJSON()));
      if (ist !== soll) throw new Error(`${seed}\n${text}`);
    }
  });
});
