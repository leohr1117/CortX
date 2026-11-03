import { TEXTE } from '../../kern/texte.ts';
import { ART } from './baum.ts';
import {
  aktivCode,
  aktivFett,
  aktivHaken,
  aktivKopf,
  aktivKursiv,
  aktivLink,
  aktivListe,
  aktivStrich,
  aktivWichtig,
} from './aktiv.ts';
import {
  inlineAn,
  loeschePaar,
  schalteCode,
  schalteFett,
  schalteHaken,
  schalteKopf,
  schalteKursiv,
  schalteListe,
  schalteStrich,
  schalteVerknuepfung,
  schalteWichtig,
} from './befehl.ts';
import type { ModellSchalt } from './modellbefehl.ts';
import type { TextWahl } from './ueberschrift.ts';
import { alsBefehl } from './zeilen.ts';
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

export type InlineArt =
  | typeof ART.fett
  | typeof ART.kursiv
  | typeof ART.streich
  | typeof ART.wichtig
  | typeof ART.code;

interface InlineEintrag {
  art: InlineArt;
  marker: string;
  knopf: boolean;
}

export type FormatBefehl =
  | typeof ART.fett
  | typeof ART.kursiv
  | 'strich'
  | typeof ART.wichtig
  | typeof ART.code
  | typeof ART.ueberschrift
  | typeof ART.liste
  | typeof ART.haken
  | typeof ART.link;

export type FormatId = FormatBefehl | typeof ART.codeblock | typeof ART.nummer;

interface AttributAngabe {
  standard?: string | number | boolean;
}

export type VorschauTag = 'strong' | 'em' | 's' | 'code' | 'mark';
export const WIDGET = {
  punkt: 'punkt',
  nummer: 'nummer',
  haken: 'haken',
} as const;

export const KUERZEL_ART = {
  wort: 'wort',
  zeile: 'zeile',
} as const;

type VorschauWidget = (typeof WIDGET)[keyof typeof WIDGET];

interface SyntaxPaar extends InlineEintrag {
  folge: number;
}

interface FormatKnopf {
  zeichen: string;
  beschriftung: string;
  klasse?: string;
  pfade?: readonly string[];
  gedrueckt: boolean;
  ziel?: boolean;
  taste?: string;
}

interface FormatSyntax {
  paare?: readonly SyntaxPaar[];
  einsetzen?: string;
  zeile?: string;
  zaun?: string;
  geruest?: string;
}

interface FormatVorschau {
  art: string;
  klasse?: string;
  rang?: number;
  tag?: VorschauTag;
  widget?: VorschauWidget;
}

type FormatKuerzel =
  | { art: typeof KUERZEL_ART.wort; ende: string }
  | { art: typeof KUERZEL_ART.zeile; genau: string; ersatz: string };

export type BefehlRun = (text: string, start: number, ende: number, ziel?: string) => TextWahl;
export type BefehlAktiv = (text: string, start: number, ende: number) => boolean;

interface FormatEintrag {
  id: FormatId;
  zeichen: readonly string[];
  reihenfolge: number;
  inline?: true;
  einschliessend?: false;
  knoten?: 'punkt' | 'ueberschrift' | 'wichtigZeile' | 'codeblock';
  marken?: Readonly<Record<string, AttributAngabe>>;
  syntax?: FormatSyntax;
  knopf?: FormatKnopf;
  vorschau?: FormatVorschau;
  kuerzel?: FormatKuerzel;
  readonly run?: BefehlRun;
  readonly isActive?: BefehlAktiv;
  readonly modell?: ModellSchalt;
}

function laufLink(text: string, start: number, ende: number, ziel = ''): TextWahl {
  return schalteVerknuepfung(text, start, ende, ziel);
}

const HAKEN_ZEICHEN = ['[]', '[x]'] as const;
const HAKEN_EINFUEGEN = `${HAKEN_ZEICHEN[0]} `;
const HAKEN_KUERZEL = '[ ]';
const CODE_ZAUN = '```';
const LINK_ZEICHEN = ['[', '](', ')'] as const;
const LINK_GERUEST = `${LINK_ZEICHEN[0]}{text}${LINK_ZEICHEN[1]}{ziel}${LINK_ZEICHEN[2]}`;
const LISTE_ZEICHEN = ['-', '*', '+'] as const;
const KOPF_ZEICHEN = ['=', '#'] as const;
const WICHTIG_PFAD = ['M12 5v9', 'M12 19h.01'] as const;
const LISTE_PFAD = ['M3 6h.01', 'M3 12h.01', 'M3 18h.01', 'M8 6h13', 'M8 12h13', 'M8 18h13'] as const;
const HAKEN_PFAD = ['m3 7 2 2 4-4', 'm3 17 2 2 4-4', 'M13 6h8', 'M13 12h8', 'M13 18h8'] as const;

const ZEICHEN: Record<FormatId, Pick<FormatEintrag, 'zeichen' | 'reihenfolge' | 'inline' | 'einschliessend' | 'knoten' | 'marken'>> = {
  [ART.code]: { inline: true, einschliessend: false, zeichen: [CODE_INLINE], reihenfolge: 0 },
  [ART.wichtig]: { inline: true, knoten: 'wichtigZeile', zeichen: [WICHTIG_INLINE, WICHTIG_ZEILE], reihenfolge: 1 },
  strich: { inline: true, zeichen: [STREICH_MARKER], reihenfolge: 2 },
  [ART.fett]: { inline: true, zeichen: [FETT_MARKER, FETT_UNTER], reihenfolge: 3 },
  [ART.kursiv]: { inline: true, zeichen: [KURSIV_MARKER, KURSIV_UNTER], reihenfolge: 4 },
  [ART.link]: { inline: true, einschliessend: false, zeichen: LINK_ZEICHEN, reihenfolge: 5, marken: { ziel: {} } },
  [ART.ueberschrift]: { knoten: 'ueberschrift', zeichen: KOPF_ZEICHEN, reihenfolge: 6 },
  [ART.liste]: { knoten: 'punkt', zeichen: LISTE_ZEICHEN, reihenfolge: 7 },
  [ART.haken]: { knoten: 'punkt', zeichen: HAKEN_ZEICHEN, reihenfolge: 8 },
  [ART.codeblock]: { knoten: 'codeblock', zeichen: [CODE_ZAUN, '~~~'], reihenfolge: 9 },
  [ART.nummer]: { knoten: 'punkt', zeichen: ['1.'], reihenfolge: 10 },
};

type RohEintrag = Omit<FormatEintrag, 'zeichen' | 'reihenfolge' | 'inline' | 'marken'>;

const FORMAT_ROH: readonly RohEintrag[] = [
  {
    id: ART.fett,
    syntax: {
      paare: [
        { art: ART.fett, marker: FETT_MARKER, knopf: true, folge: 3 },
        { art: ART.fett, marker: FETT_UNTER, knopf: false, folge: 4 },
      ],
    },
    knopf: { zeichen: 'B', beschriftung: TEXTE.fett, klasse: 'fett', gedrueckt: true, taste: 'Mod-b' },
    vorschau: { art: ART.fett, klasse: 'cm-fett', rang: 1, tag: 'strong' },
    kuerzel: { art: KUERZEL_ART.wort, ende: FETT_MARKER },
    get run() { return alsBefehl(ART.fett, schalteFett); },
    get isActive() { return aktivFett; },
  },
  {
    id: ART.kursiv,
    syntax: {
      paare: [
        { art: ART.kursiv, marker: KURSIV_MARKER, knopf: true, folge: 5 },
        { art: ART.kursiv, marker: KURSIV_UNTER, knopf: false, folge: 6 },
      ],
    },
    knopf: { zeichen: 'I', beschriftung: TEXTE.kursiv, klasse: 'kursiv', gedrueckt: true, taste: 'Mod-i' },
    vorschau: { art: ART.kursiv, klasse: 'cm-kursiv', rang: 2, tag: 'em' },
    get run() { return alsBefehl(ART.kursiv, schalteKursiv); },
    get isActive() { return aktivKursiv; },
  },
  {
    id: 'strich',
    syntax: { paare: [{ art: ART.streich, marker: STREICH_MARKER, knopf: true, folge: 2 }] },
    knopf: { zeichen: 'S', beschriftung: TEXTE.strich, klasse: 'strich', gedrueckt: true, taste: 'Mod-Shift-x' },
    vorschau: { art: ART.streich, klasse: 'cm-strich', rang: 3, tag: 's' },
    get run() { return alsBefehl('strich', schalteStrich); },
    get isActive() { return aktivStrich; },
  },
  {
    id: ART.wichtig,
    syntax: {
      paare: [{ art: ART.wichtig, marker: WICHTIG_INLINE, knopf: true, folge: 1 }],
      zeile: WICHTIG_ZEILE,
    },
    knopf: { zeichen: '', beschriftung: TEXTE.wichtigKnopf, pfade: WICHTIG_PFAD, gedrueckt: true },
    vorschau: { art: ART.wichtig, klasse: 'cm-wichtig', rang: 8, tag: 'mark' },
    get run() { return alsBefehl(ART.wichtig, schalteWichtig); },
    get isActive() { return aktivWichtig; },
  },
  {
    id: ART.code,
    syntax: { paare: [{ art: ART.code, marker: CODE_INLINE, knopf: true, folge: 0 }], zaun: CODE_ZAUN },
    knopf: { zeichen: '</>', beschriftung: TEXTE.code, gedrueckt: true, taste: 'Mod-e' },
    vorschau: { art: ART.code, klasse: 'cm-code', rang: 4, tag: 'code' },
    get run() { return alsBefehl(ART.code, schalteCode); },
    get isActive() { return aktivCode; },
  },
  {
    id: ART.ueberschrift,
    syntax: { einsetzen: UEBERSCHRIFT_MARKER },
    knopf: { zeichen: 'H', beschriftung: TEXTE.ueberschrift, gedrueckt: true, taste: 'Mod-Shift-h' },
    vorschau: { art: ART.ueberschrift, klasse: 'cm-ueberschrift', rang: 6 },
    get run() { return alsBefehl(ART.ueberschrift, schalteKopf); },
    get isActive() { return aktivKopf; },
  },
  {
    id: ART.liste,
    syntax: { einsetzen: LISTEN_EINFUEGEN },
    knopf: { zeichen: '', beschriftung: TEXTE.liste, pfade: LISTE_PFAD, gedrueckt: true, taste: 'Mod-Shift-l' },
    vorschau: { art: ART.liste, widget: WIDGET.punkt },
    get run() { return alsBefehl(ART.liste, schalteListe); },
    get isActive() { return aktivListe; },
  },
  {
    id: ART.haken,
    syntax: { einsetzen: HAKEN_EINFUEGEN },
    knopf: { zeichen: '', beschriftung: TEXTE.haken, pfade: HAKEN_PFAD, gedrueckt: true, taste: 'Mod-Shift-u' },
    vorschau: { art: ART.haken, widget: WIDGET.haken },
    kuerzel: { art: KUERZEL_ART.zeile, genau: HAKEN_KUERZEL, ersatz: HAKEN_EINFUEGEN },
    get run() { return alsBefehl(ART.haken, schalteHaken); },
    get isActive() { return aktivHaken; },
  },
  {
    id: ART.link,
    syntax: { geruest: LINK_GERUEST },
    knopf: { zeichen: TEXTE.link, beschriftung: TEXTE.link, klasse: 'breit', gedrueckt: false, ziel: true, taste: 'Mod-k' },
    vorschau: { art: ART.link, klasse: 'cm-link', rang: 5 },
    get run() { return alsBefehl(ART.link, laufLink); },
    get isActive() { return aktivLink; },
  },
  {
    id: ART.codeblock,
    vorschau: { art: ART.codeblock, klasse: 'cm-codeblock', rang: 7 },
  },
  {
    id: ART.nummer,
    vorschau: { art: ART.nummer, widget: WIDGET.nummer },
  },
];

const FORMAT_REGISTER: readonly FormatEintrag[] = baueRegister(FORMAT_ROH);

function baueRegister(roh: readonly RohEintrag[]): readonly FormatEintrag[] {
  const ids = new Set<FormatId>();
  const reihen = new Set<number>();
  const aus = roh.map((eintrag) => {
    if (ids.has(eintrag.id)) throw new Error('duplicate format');
    ids.add(eintrag.id);
    const angabe = ZEICHEN[eintrag.id];
    if (angabe.zeichen.length === 0) throw new Error('missing character');
    if (reihen.has(angabe.reihenfolge)) throw new Error('duplicate order');
    reihen.add(angabe.reihenfolge);
    return Object.assign(eintrag, angabe);
  });
  for (const id of Object.keys(ZEICHEN) as FormatId[]) {
    if (!ids.has(id)) throw new Error('missing format');
  }
  return aus;
}

export const INLINE_REGISTER: readonly InlineEintrag[] = FORMAT_REGISTER.flatMap((eintrag) => eintrag.syntax?.paare ?? [])
  .slice()
  .sort((a, b) => a.folge - b.folge)
  .map(({ art, marker, knopf }) => ({ art, marker, knopf }));

export interface InlineFormat {
  id: FormatId;
  zeichen: readonly string[];
  reihenfolge: number;
  marken?: Readonly<Record<string, { standard?: string | number | boolean }>>;
}

export function inlineFormate(): readonly InlineFormat[] {
  return FORMAT_REGISTER.filter((eintrag) => eintrag.inline)
    .map(({ id, zeichen, reihenfolge, marken }) => ({ id, zeichen, reihenfolge, marken }))
    .sort((a, b) => a.reihenfolge - b.reihenfolge);
}

export function formatVon(id: FormatId): FormatEintrag {
  const fund = FORMAT_REGISTER.find((eintrag) => eintrag.id === id);
  if (!fund) throw new Error('unknown format');
  return fund;
}

type LeistenEintrag = FormatEintrag & {
  id: FormatBefehl;
  knopf: FormatKnopf;
  run: BefehlRun;
  isActive: BefehlAktiv;
};

export function leistenEintraege(): readonly LeistenEintrag[] {
  const aus: LeistenEintrag[] = [];
  for (const eintrag of FORMAT_REGISTER) {
    if (!eintrag.knopf || !eintrag.run || !eintrag.isActive) continue;
    if (eintrag.id === ART.codeblock || eintrag.id === ART.nummer) continue;
    aus.push(eintrag as LeistenEintrag);
  }
  return aus;
}

export function kuerzelEintraege(): readonly FormatEintrag[] {
  const zeile = FORMAT_REGISTER.filter((eintrag) => eintrag.kuerzel?.art === KUERZEL_ART.zeile);
  const wort = FORMAT_REGISTER.filter((eintrag) => eintrag.kuerzel?.art === KUERZEL_ART.wort);
  return [...zeile, ...wort];
}

interface VorschauSchicht {
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

const MARKER_ZEICHEN = new Set(['*', '_', '~', '!', '`']);

export function nurMarker(text: string): boolean {
  return text.length > 0 && [...text].every((zeichen) => MARKER_ZEICHEN.has(zeichen));
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

export { STIL_REGISTER, STIL_VAR, kombiniereStil, stilAttribut } from './stil.ts';
export type { FormatStil } from './stil.ts';

export { inlineAn, loeschePaar };
export { PUNKT_TASTEN, punktArt, punktTaste, type PunktArt } from './punkt.ts';

export interface InlineStand {
  fett: boolean;
  kursiv: boolean;
  streich: boolean;
  wichtig: boolean;
  code: boolean;
}
