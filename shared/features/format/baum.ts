export const ART = {
  text: 'text',
  fett: 'fett',
  kursiv: 'kursiv',
  streich: 'streich',
  wichtig: 'wichtig',
  code: 'code',
  link: 'link',
  absatz: 'absatz',
  liste: 'liste',
  haken: 'haken',
  ueberschrift: 'ueberschrift',
  codeblock: 'codeblock',
  nummer: 'nummer',
} as const;

export const EBENE = {
  titel: 1,
  abschnitt: 2,
} as const;

interface LeseTextTeil {
  art: typeof ART.text;
  text: string;
}

interface LeseFettTeil {
  art: typeof ART.fett;
  text: string;
}

interface LeseKursivTeil {
  art: typeof ART.kursiv;
  text: string;
}

interface LeseStreichTeil {
  art: typeof ART.streich;
  text: string;
}

interface LeseWichtigTeil {
  art: typeof ART.wichtig;
  text: string;
}

interface LeseVerschachtelt {
  art: typeof ART.fett | typeof ART.kursiv | typeof ART.streich | typeof ART.wichtig;
  teile: LeseTeil[];
}

interface LeseCodeTeil {
  art: typeof ART.code;
  text: string;
}

export interface LeseLinkTeil {
  art: typeof ART.link;
  teile: LeseTeil[];
  ziel: string;
}

export type LeseTeil =
  | LeseTextTeil
  | LeseFettTeil
  | LeseKursivTeil
  | LeseStreichTeil
  | LeseWichtigTeil
  | LeseVerschachtelt
  | LeseCodeTeil
  | LeseLinkTeil;

interface LeseAbsatz {
  art: typeof ART.absatz;
  zeilen: LeseTeil[][];
}

export interface LeseListe {
  art: typeof ART.liste;
  punkte: LeseTeil[][];
  geordnet?: boolean;
}

export interface LeseHakenPunkt {
  abgehakt: boolean;
  teile: LeseTeil[];
}

interface LeseHaken {
  art: typeof ART.haken;
  punkte: LeseHakenPunkt[];
}

interface LeseUeberschrift {
  art: typeof ART.ueberschrift;
  teile: LeseTeil[];
  stufe?: number;
}

interface LeseWichtig {
  art: typeof ART.wichtig;
  teile: LeseTeil[];
}

interface LeseCodeBlock {
  art: typeof ART.codeblock;
  text: string;
}

export type LeseBlock = LeseAbsatz | LeseListe | LeseHaken | LeseUeberschrift | LeseWichtig | LeseCodeBlock;

export type BelegArt =
  | typeof ART.fett
  | typeof ART.kursiv
  | typeof ART.streich
  | typeof ART.code
  | typeof ART.link
  | typeof ART.codeblock
  | typeof ART.liste
  | typeof ART.nummer
  | typeof ART.haken
  | typeof ART.ueberschrift
  | typeof ART.wichtig;

export interface Beleg {
  art: BelegArt;
  von: number;
  bis: number;
  ganzVon: number;
  ganzBis: number;
  bisZeile?: number;
  listenLaenge?: number;
  innen?: Beleg[];
  marker: Array<[number, number]>;
  ziel?: string;
  abgehakt?: boolean;
  zahl?: string;
  stufe?: number;
}

export interface Dokument {
  bloecke: LeseBlock[];
  belege: Beleg[];
}
