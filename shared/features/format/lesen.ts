export interface LeseTextTeil {
  art: 'text';
  text: string;
}

export interface LeseFettTeil {
  art: 'fett';
  text: string;
}

export type LeseTeil = LeseTextTeil | LeseFettTeil;

export interface LeseAbsatz {
  art: 'absatz';
  zeilen: LeseTeil[][];
}

export interface LeseListe {
  art: 'liste';
  punkte: LeseTeil[][];
}

export interface LeseHakenPunkt {
  abgehakt: boolean;
  teile: LeseTeil[];
}

export interface LeseHaken {
  art: 'haken';
  punkte: LeseHakenPunkt[];
}

export type LeseBlock = LeseAbsatz | LeseListe | LeseHaken;

const LISTE = '- ';
const OFFEN = '[]';
const ZU = '[x]';
const FETT = '**';

function ohneWagen(zeile: string): string {
  return zeile.endsWith('\r') ? zeile.slice(0, -1) : zeile;
}

function koerper(zeile: string, marker: string): string {
  const rest = zeile.slice(marker.length);
  return rest.startsWith(' ') ? rest.slice(1) : rest;
}

function haengeText(teile: LeseTeil[], text: string): void {
  if (text.length === 0) return;
  const letzte = teile[teile.length - 1];
  if (letzte?.art === 'text') {
    letzte.text += text;
    return;
  }
  teile.push({ art: 'text', text });
}

function leseTeile(zeile: string): LeseTeil[] {
  const teile: LeseTeil[] = [];
  let cursor = 0;
  while (cursor < zeile.length) {
    const auf = zeile.indexOf(FETT, cursor);
    if (auf < 0) {
      haengeText(teile, zeile.slice(cursor));
      break;
    }
    const zu = zeile.indexOf(FETT, auf + FETT.length);
    if (zu < 0 || zu === auf + FETT.length) {
      haengeText(teile, zeile.slice(cursor, auf + FETT.length));
      cursor = auf + FETT.length;
      continue;
    }
    haengeText(teile, zeile.slice(cursor, auf));
    teile.push({ art: 'fett', text: zeile.slice(auf + FETT.length, zu) });
    cursor = zu + FETT.length;
  }
  return teile;
}

function hakenVon(zeile: string): { abgehakt: boolean; rest: string } | null {
  if (zeile.startsWith(ZU)) return { abgehakt: true, rest: koerper(zeile, ZU) };
  if (zeile.startsWith(OFFEN)) return { abgehakt: false, rest: koerper(zeile, OFFEN) };
  return null;
}

export function leseBaum(text: string): LeseBlock[] {
  if (text.length === 0) return [];
  const bloecke: LeseBlock[] = [];
  let absatz: LeseTeil[][] | null = null;
  let liste: LeseTeil[][] | null = null;
  let haken: LeseHakenPunkt[] | null = null;

  function schliesseAbsatz(): void {
    if (!absatz) return;
    bloecke.push({ art: 'absatz', zeilen: absatz });
    absatz = null;
  }

  function schliesseListe(): void {
    if (!liste) return;
    bloecke.push({ art: 'liste', punkte: liste });
    liste = null;
  }

  function schliesseHaken(): void {
    if (!haken) return;
    bloecke.push({ art: 'haken', punkte: haken });
    haken = null;
  }

  for (const roh of text.split('\n')) {
    const zeile = ohneWagen(roh);
    if (zeile.startsWith(LISTE)) {
      schliesseAbsatz();
      schliesseHaken();
      if (!liste) liste = [];
      liste.push(leseTeile(zeile.slice(LISTE.length)));
      continue;
    }
    const kasten = hakenVon(zeile);
    if (kasten) {
      schliesseAbsatz();
      schliesseListe();
      if (!haken) haken = [];
      haken.push({ abgehakt: kasten.abgehakt, teile: leseTeile(kasten.rest) });
      continue;
    }
    schliesseListe();
    schliesseHaken();
    if (!absatz) absatz = [];
    absatz.push(leseTeile(zeile));
  }

  schliesseAbsatz();
  schliesseListe();
  schliesseHaken();
  return bloecke;
}
