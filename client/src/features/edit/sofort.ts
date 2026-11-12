import { Fragment, type Node } from 'prosemirror-model';
import { useEffect, useRef, type RefObject } from 'react';
import { planeNotizText } from '../../../../shared/features/edit/index.ts';
import { packeDokument } from '../../../../shared/features/format/dokument.ts';
import { modell } from '../../../../shared/features/format/modell.ts';
import { konfliktZusatz, type Sprache } from '../../../../shared/kern/texte.ts';
import type { Notiz } from '../../../../shared/kern/modell.ts';
import { ladeNotiz, sendeStand } from './api.ts';
import { gleicherStand, standAusAntwort, type DokumentStand } from './dokumentStand.ts';

// Leaving the page (tab closed, reloaded, sent to the background) must not lose what was typed in the last 400 ms.
// A conflict keeps the typed text on this device; it is never sent over the newer server version.

export interface SofortLage {
  bereit: boolean;
  weg: boolean;
  konflikt: boolean;
  planOk: boolean;
  stand: DokumentStand;
  basis: DokumentStand;
}

export function sollSofortSenden(lage: SofortLage): boolean {
  if (!lage.bereit || lage.weg || lage.konflikt || !lage.planOk) return false;
  return !gleicherStand(lage.stand, lage.basis);
}

export type NachBeacon = 'uebernehmen' | 'konflikt';

// After a beacon the page may live on (tab only hidden). The beacon has no answer, so the next server read decides.
export function nachBeacon(gesendet: DokumentStand, server: DokumentStand): NachBeacon {
  return gleicherStand(gesendet, server) ? 'uebernehmen' : 'konflikt';
}

function titelStelle(doc: Node): number {
  for (let index = 0; index < doc.childCount; index += 1) {
    const kind = doc.child(index);
    if (kind.type.name === 'leerzeile' || !kind.isTextblock) continue;
    if (kind.textContent.trim().length > 0) return index;
  }
  return -1;
}

// The copy keeps every line as typed; only the title line (the first line with text) gets the conflict note.
export function kopieKnoten(doc: Node, wann: Date, sprache: Sprache = 'en'): Node {
  const zusatz = konfliktZusatz(wann, sprache);
  const stelle = titelStelle(doc);
  const kinder: Node[] = [];
  doc.forEach((kind) => kinder.push(kind));
  if (stelle < 0) return modell.node('doc', null, [modell.node('absatz', null, modell.text(zusatz.trim())), ...kinder]);
  const titel = kinder[stelle]!;
  kinder[stelle] = titel.copy(titel.content.append(Fragment.from(modell.text(zusatz))));
  return modell.node('doc', null, kinder);
}

export function kopieDokument(stand: DokumentStand, wann: Date, sprache: Sprache = 'en'): unknown {
  return packeDokument(kopieKnoten(stand.knoten, wann, sprache));
}

// pagehide covers closing and reloading, visibilitychange covers the switch to another app on a phone.
export function haengeVerlassen(fenster: Window, beiWeg: () => void, beiZurueck: () => void): () => void {
  const sichtbar = () => {
    if (fenster.document.visibilityState === 'hidden') beiWeg();
    else beiZurueck();
  };
  fenster.addEventListener('pagehide', beiWeg);
  fenster.document.addEventListener('visibilitychange', sichtbar);
  return () => {
    fenster.removeEventListener('pagehide', beiWeg);
    fenster.document.removeEventListener('visibilitychange', sichtbar);
  };
}

export interface SofortRefs {
  notiz: RefObject<Notiz | null>;
  stand: RefObject<DokumentStand>;
  basis: RefObject<DokumentStand>;
  weg: RefObject<boolean>;
  konflikt: RefObject<boolean>;
  da: RefObject<boolean>;
  abbruch: RefObject<AbortController | null>;
}

export interface SofortRufe {
  beiOnline: () => void;
  beiKonflikt: () => void;
  beiUebernahme: (stand: DokumentStand, notiz: Notiz) => void;
}

// Saves right away when the page goes (beacon) or the network comes back; the note page only wires the refs.
export function useSofort(refs: SofortRefs, rufe: SofortRufe): void {
  const gesendet = useRef<DokumentStand | null>(null);
  const aktuell = useRef(rufe);
  aktuell.current = rufe;

  useEffect(() => {
    const beiOnline = () => aktuell.current.beiOnline();
    const beiWeg = () => {
      const notiz = refs.notiz.current;
      const stand = refs.stand.current;
      const lage = { bereit: notiz !== null, weg: refs.weg.current, konflikt: refs.konflikt.current, stand };
      if (!notiz || !sollSofortSenden({ ...lage, planOk: planeNotizText(stand.text).ok, basis: refs.basis.current })) return;
      refs.abbruch.current?.abort();
      if (sendeStand(notiz.id, stand.doc, notiz.version)) gesendet.current = stand;
    };
    const beiZurueck = async () => {
      const beleg = gesendet.current;
      const notiz = refs.notiz.current;
      gesendet.current = null;
      if (!beleg || !notiz) return;
      const neu = await ladeNotiz(notiz.id).catch(() => null);
      if (!neu || !refs.da.current || refs.notiz.current?.id !== neu.id) return;
      if (nachBeacon(beleg, standAusAntwort(neu)) === 'konflikt') {
        aktuell.current.beiKonflikt();
        return;
      }
      refs.basis.current = beleg;
      refs.notiz.current = neu;
      aktuell.current.beiUebernahme(beleg, neu);
    };
    window.addEventListener('online', beiOnline);
    const los = haengeVerlassen(window, beiWeg, () => void beiZurueck());
    return () => {
      window.removeEventListener('online', beiOnline);
      los();
    };
  }, [refs.abbruch, refs.basis, refs.da, refs.konflikt, refs.notiz, refs.stand, refs.weg]);
}
