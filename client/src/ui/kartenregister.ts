import { satzHinzugefuegt, satzThemaWeg, satzThemaZusammen, TEXTE } from '../../../shared/kern/texte.ts';
import { zitier } from '../../../shared/features/topics/index.ts';

const KARTE_DAUER_OHNE_MS = 5000;
const KARTE_DAUER_MIT_MS = 8000;
const KARTE_WISCHEN_PX = 80;

export const KARTE_TEXT = {
  rueckgaengig: TEXTE.rueckgaengig,
  oeffnen: TEXTE.oeffnen,
  schliessen: TEXTE.verwerfen,
  seiteGeloescht: TEXTE.seiteGeloescht,
  notizGeloescht: TEXTE.notizGeloescht,
  offline: TEXTE.offline,
  nichtRueckgaengig: TEXTE.nichtRueck,
} as const;

type KarteAktionText = (typeof KARTE_TEXT)['rueckgaengig'] | (typeof KARTE_TEXT)['oeffnen'];

export interface KarteAktion {
  text: KarteAktionText;
  run: () => void;
}

function karteDauer(hatAktion: boolean): number {
  return hatAktion ? KARTE_DAUER_MIT_MS : KARTE_DAUER_OHNE_MS;
}

export function textHinzugefuegt(ziel: string): string {
  return satzHinzugefuegt(ziel);
}

export function textThemaWeg(name: string): string {
  return satzThemaWeg(zitier(name));
}

export function textThemaZusammen(name: string, into: string): string {
  return satzThemaZusammen(zitier(name), into);
}

export function aktionRueckgaengig(run: () => void): KarteAktion {
  return { text: KARTE_TEXT.rueckgaengig, run };
}

export interface KartenLauf {
  restMs: number;
  pausiert: boolean;
  seit: number;
}

export function starteLauf(hatAktion: boolean, jetzt: number): KartenLauf {
  return { restMs: karteDauer(hatAktion), pausiert: false, seit: jetzt };
}

export function pausiereLauf(lauf: KartenLauf, jetzt: number): KartenLauf {
  if (lauf.pausiert) return lauf;
  const restMs = Math.max(0, lauf.restMs - (jetzt - lauf.seit));
  return { restMs, pausiert: true, seit: jetzt };
}

export function setzeLaufFort(lauf: KartenLauf, jetzt: number): KartenLauf {
  if (!lauf.pausiert) return lauf;
  return { restMs: lauf.restMs, pausiert: false, seit: jetzt };
}

export function wischSchliesst(dx: number, dy: number, schwelle = KARTE_WISCHEN_PX): boolean {
  if (Math.abs(dx) >= Math.abs(dy)) return Math.abs(dx) >= schwelle;
  return dy >= schwelle;
}
