import {
  CODE_INLINE,
  FETT_MARKER,
  FETT_UNTER,
  KURSIV_MARKER,
  KURSIV_UNTER,
  LISTEN_EINFUEGEN,
  STREICH_MARKER,
  UEBERSCHRIFT_MARKER,
  WICHTIG_INLINE,
  WICHTIG_ZEILE,
} from './zeile.ts';

export type InlineArt = 'fett' | 'kursiv' | 'streich' | 'wichtig' | 'code';

interface InlineEintrag {
  art: InlineArt;
  marker: string;
  knopf: boolean;
}

export type FormatBefehl =
  | 'fett'
  | 'kursiv'
  | 'strich'
  | 'wichtig'
  | 'code'
  | 'ueberschrift'
  | 'liste'
  | 'haken'
  | 'link';

export type FormatId = FormatBefehl | 'codeblock' | 'nummer';

export type VorschauTag = 'strong' | 'em' | 's' | 'code' | 'mark';
export type VorschauWidget = 'punkt' | 'nummer' | 'haken';

interface SyntaxPaar extends InlineEintrag {
  folge: number;
}

export interface FormatKnopf {
  zeichen: string;
  beschriftung: string;
  klasse?: string;
  pfade?: readonly string[];
  gedrueckt: boolean;
  ziel?: boolean;
  taste?: string;
}

export interface FormatSyntax {
  paare?: readonly SyntaxPaar[];
  einsetzen?: string;
  zeile?: string;
  zaun?: string;
  geruest?: string;
}

export interface FormatVorschau {
  art: string;
  klasse?: string;
  rang?: number;
  tag?: VorschauTag;
  widget?: VorschauWidget;
}

export type FormatKuerzel =
  | { art: 'wort'; ende: string }
  | { art: 'zeile'; genau: string; ersatz: string };

export interface FormatEintrag {
  id: FormatId;
  syntax?: FormatSyntax;
  knopf?: FormatKnopf;
  vorschau?: FormatVorschau;
  kuerzel?: FormatKuerzel;
}

const HAKEN_EINFUEGEN = '[] ';
const HAKEN_KUERZEL = '[ ]';
const CODE_ZAUN = '```';
const LINK_GERUEST = '[{text}]({ziel})';
const WICHTIG_PFAD = ['M12 5v9', 'M12 19h.01'] as const;
const LISTE_PFAD = ['M3 6h.01', 'M3 12h.01', 'M3 18h.01', 'M8 6h13', 'M8 12h13', 'M8 18h13'] as const;
const HAKEN_PFAD = ['m3 7 2 2 4-4', 'm3 17 2 2 4-4', 'M13 6h8', 'M13 12h8', 'M13 18h8'] as const;

export const FORMAT_REGISTER: readonly FormatEintrag[] = [
  {
    id: 'fett',
    syntax: {
      paare: [
        { art: 'fett', marker: FETT_MARKER, knopf: true, folge: 3 },
        { art: 'fett', marker: FETT_UNTER, knopf: false, folge: 4 },
      ],
    },
    knopf: { zeichen: 'B', beschriftung: 'Bold', klasse: 'fett', gedrueckt: true, taste: 'Mod-b' },
    vorschau: { art: 'fett', klasse: 'cm-fett', rang: 1, tag: 'strong' },
    kuerzel: { art: 'wort', ende: FETT_MARKER },
  },
  {
    id: 'kursiv',
    syntax: {
      paare: [
        { art: 'kursiv', marker: KURSIV_MARKER, knopf: true, folge: 5 },
        { art: 'kursiv', marker: KURSIV_UNTER, knopf: false, folge: 6 },
      ],
    },
    knopf: { zeichen: 'I', beschriftung: 'Italic', klasse: 'kursiv', gedrueckt: true, taste: 'Mod-i' },
    vorschau: { art: 'kursiv', klasse: 'cm-kursiv', rang: 2, tag: 'em' },
  },
  {
    id: 'strich',
    syntax: { paare: [{ art: 'streich', marker: STREICH_MARKER, knopf: true, folge: 2 }] },
    knopf: { zeichen: 'S', beschriftung: 'Strikethrough', klasse: 'strich', gedrueckt: true, taste: 'Mod-Shift-x' },
    vorschau: { art: 'streich', klasse: 'cm-strich', rang: 3, tag: 's' },
  },
  {
    id: 'wichtig',
    syntax: {
      paare: [{ art: 'wichtig', marker: WICHTIG_INLINE, knopf: true, folge: 1 }],
      zeile: WICHTIG_ZEILE,
    },
    knopf: { zeichen: '', beschriftung: 'Important', pfade: WICHTIG_PFAD, gedrueckt: true },
    vorschau: { art: 'wichtig', klasse: 'cm-wichtig', rang: 8, tag: 'mark' },
  },
  {
    id: 'code',
    syntax: { paare: [{ art: 'code', marker: CODE_INLINE, knopf: true, folge: 0 }], zaun: CODE_ZAUN },
    knopf: { zeichen: '</>', beschriftung: 'Code', gedrueckt: true, taste: 'Mod-e' },
    vorschau: { art: 'code', klasse: 'cm-code', rang: 4, tag: 'code' },
  },
  {
    id: 'ueberschrift',
    syntax: { einsetzen: UEBERSCHRIFT_MARKER },
    knopf: { zeichen: 'H', beschriftung: 'Heading', gedrueckt: true, taste: 'Mod-Shift-h' },
    vorschau: { art: 'ueberschrift', klasse: 'cm-ueberschrift', rang: 6 },
  },
  {
    id: 'liste',
    syntax: { einsetzen: LISTEN_EINFUEGEN },
    knopf: { zeichen: '', beschriftung: 'Bulleted list', pfade: LISTE_PFAD, gedrueckt: true, taste: 'Mod-Shift-l' },
    vorschau: { art: 'liste', widget: 'punkt' },
  },
  {
    id: 'haken',
    syntax: { einsetzen: HAKEN_EINFUEGEN },
    knopf: { zeichen: '', beschriftung: 'Checklist', pfade: HAKEN_PFAD, gedrueckt: true, taste: 'Mod-Shift-u' },
    vorschau: { art: 'haken', widget: 'haken' },
    kuerzel: { art: 'zeile', genau: HAKEN_KUERZEL, ersatz: HAKEN_EINFUEGEN },
  },
  {
    id: 'link',
    syntax: { geruest: LINK_GERUEST },
    knopf: { zeichen: 'Link', beschriftung: 'Link', klasse: 'breit', gedrueckt: false, ziel: true, taste: 'Mod-k' },
    vorschau: { art: 'link', klasse: 'cm-link', rang: 5 },
  },
  {
    id: 'codeblock',
    vorschau: { art: 'codeblock', klasse: 'cm-codeblock', rang: 7 },
  },
  {
    id: 'nummer',
    vorschau: { art: 'nummer', widget: 'nummer' },
  },
];

export const INLINE_REGISTER: readonly InlineEintrag[] = FORMAT_REGISTER.flatMap((eintrag) => eintrag.syntax?.paare ?? [])
  .slice()
  .sort((a, b) => a.folge - b.folge)
  .map(({ art, marker, knopf }) => ({ art, marker, knopf }));

export function formatVon(id: FormatId): FormatEintrag {
  const fund = FORMAT_REGISTER.find((eintrag) => eintrag.id === id);
  if (!fund) throw new Error('unknown format');
  return fund;
}

export function leistenEintraege(): readonly (FormatEintrag & { id: FormatBefehl; knopf: FormatKnopf })[] {
  const aus: (FormatEintrag & { id: FormatBefehl; knopf: FormatKnopf })[] = [];
  for (const eintrag of FORMAT_REGISTER) {
    if (!eintrag.knopf || eintrag.id === 'codeblock' || eintrag.id === 'nummer') continue;
    aus.push(eintrag as FormatEintrag & { id: FormatBefehl; knopf: FormatKnopf });
  }
  return aus;
}

export function kuerzelEintraege(): readonly FormatEintrag[] {
  const zeile = FORMAT_REGISTER.filter((eintrag) => eintrag.kuerzel?.art === 'zeile');
  const wort = FORMAT_REGISTER.filter((eintrag) => eintrag.kuerzel?.art === 'wort');
  return [...zeile, ...wort];
}

export interface VorschauSchicht {
  art: string;
  klasse: string;
  bit: number;
}

export function vorschauSchichten(): readonly VorschauSchicht[] {
  const roh = FORMAT_REGISTER.flatMap((eintrag) => {
    const sicht = eintrag.vorschau;
    if (!sicht?.klasse) return [];
    return [{ art: sicht.art, klasse: sicht.klasse, rang: sicht.rang ?? 0 }];
  });
  roh.sort((a, b) => a.rang - b.rang);
  return roh.map((eintrag, index) => ({ art: eintrag.art, klasse: eintrag.klasse, bit: 1 << index }));
}

export function vorschauTag(art: string): VorschauTag | undefined {
  for (const eintrag of FORMAT_REGISTER) {
    if (eintrag.vorschau?.art === art) return eintrag.vorschau.tag;
  }
  return undefined;
}

export function vorschauWidget(art: string): VorschauWidget | undefined {
  for (const eintrag of FORMAT_REGISTER) {
    if (eintrag.vorschau?.art === art) return eintrag.vorschau.widget;
  }
  return undefined;
}

export const MARKER_ZEICHEN = new Set(['*', '_', '~', '!', '`']);

export function nurMarker(text: string): boolean {
  if (text.length === 0) return false;
  for (const zeichen of text) {
    if (!MARKER_ZEICHEN.has(zeichen)) return false;
  }
  return true;
}

export function cursorInSchale(text: string, index: number): boolean {
  const links = text[index - 1];
  const rechts = text[index];
  return links !== undefined && rechts !== undefined && MARKER_ZEICHEN.has(links) && MARKER_ZEICHEN.has(rechts);
}

export function klemme(text: string, start: number, ende: number): { start: number; ende: number } {
  const links = Number.isFinite(start) ? Math.floor(start) : 0;
  const rechts = Number.isFinite(ende) ? Math.floor(ende) : links;
  const von = Math.max(0, Math.min(links, text.length));
  const bis = Math.max(0, Math.min(rechts, text.length));
  return von <= bis ? { start: von, ende: bis } : { start: bis, ende: von };
}

export const STIL_VAR = '--stil-hintergrund';

export interface FormatStil {
  schrift?: string;
  hintergrund?: string;
  farbe?: string;
}

interface StilEintrag {
  art: 'code' | 'wichtig';
  stil: FormatStil;
}

const STIL_FELDER = ['schrift', 'hintergrund', 'farbe'] as const;

export const STIL_REGISTER: readonly StilEintrag[] = [
  {
    art: 'code',
    stil: {
      schrift: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
      hintergrund: 'var(--flaeche-2)',
    },
  },
  {
    art: 'wichtig',
    stil: { hintergrund: '#f3e2a8', farbe: '#1a1a1a' },
  },
];

export function kombiniereStil(arten: readonly string[]): FormatStil {
  const dabei = new Set(arten);
  const ergebnis: FormatStil = {};
  for (const eintrag of STIL_REGISTER) {
    if (!dabei.has(eintrag.art)) continue;
    for (const feld of STIL_FELDER) {
      const wert = eintrag.stil[feld];
      if (wert !== undefined) ergebnis[feld] = wert;
    }
  }
  return ergebnis;
}

export function stilAttribut(arten: readonly string[]): string | undefined {
  if (!arten.includes('code') || !arten.includes('wichtig')) return undefined;
  const hintergrund = kombiniereStil(arten).hintergrund;
  if (!hintergrund) return undefined;
  return `${STIL_VAR}:${hintergrund}`;
}

export { hatInlineWichtig, inlineAn, schalteInline } from './befehl.ts';

export interface InlineStand {
  fett: boolean;
  kursiv: boolean;
  streich: boolean;
  wichtig: boolean;
  code: boolean;
}
