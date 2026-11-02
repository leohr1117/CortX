export interface LeseTextTeil {
  art: 'text';
  text: string;
}

export interface LeseFettTeil {
  art: 'fett';
  text: string;
}

export interface LeseKursivTeil {
  art: 'kursiv';
  text: string;
}

export interface LeseStreichTeil {
  art: 'streich';
  text: string;
}

export interface LeseVerschachtelt {
  art: 'fett' | 'kursiv' | 'streich';
  teile: LeseTeil[];
}

export interface LeseCodeTeil {
  art: 'code';
  text: string;
}

export interface LeseLinkTeil {
  art: 'link';
  teile: LeseTeil[];
  ziel: string;
}

export type LeseTeil =
  | LeseTextTeil
  | LeseFettTeil
  | LeseKursivTeil
  | LeseStreichTeil
  | LeseVerschachtelt
  | LeseCodeTeil
  | LeseLinkTeil;

export interface LeseAbsatz {
  art: 'absatz';
  zeilen: LeseTeil[][];
}

export interface LeseListe {
  art: 'liste';
  punkte: LeseTeil[][];
  geordnet?: boolean;
}

export interface LeseHakenPunkt {
  abgehakt: boolean;
  teile: LeseTeil[];
}

export interface LeseHaken {
  art: 'haken';
  punkte: LeseHakenPunkt[];
}

export interface LeseUeberschrift {
  art: 'ueberschrift';
  teile: LeseTeil[];
}

export interface LeseCodeBlock {
  art: 'codeblock';
  text: string;
}

export type LeseBlock = LeseAbsatz | LeseListe | LeseHaken | LeseUeberschrift | LeseCodeBlock;

export type BelegArt =
  | 'fett'
  | 'kursiv'
  | 'streich'
  | 'code'
  | 'link'
  | 'codeblock'
  | 'liste'
  | 'nummer'
  | 'haken'
  | 'ueberschrift';

export interface Beleg {
  art: BelegArt;
  von: number;
  bis: number;
  ganzVon: number;
  ganzBis: number;
  marker: Array<[number, number]>;
  ziel?: string;
  abgehakt?: boolean;
  zahl?: string;
}

export interface Dokument {
  bloecke: LeseBlock[];
  belege: Beleg[];
}
