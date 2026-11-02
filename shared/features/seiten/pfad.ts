import { INBOX_NAME } from '../../kern/grenzen.ts';
import type { Thema } from '../../kern/modell.ts';
import {
  entferneTag,
  findeTags,
  loeseThema,
  passendeThemen,
  ersetzeTag,
  type TagFund,
} from '../tags/regeln.ts';
import { schluessel, tokenForm } from './text.ts';

export interface SeiteKurz {
  id: number;
  topic: string;
  titel: string;
  abschnitte: string[];
}

export interface PfadTeil {
  name: string;
  neu: boolean;
}

export interface AblagePlan {
  text: string;
  topicName: string;
  source: 'tag' | 'manual';
  neu: boolean;
  seite: string | null;
  abschnitt: string | null;
  neuSeite: boolean;
  neuAbschnitt: boolean;
  ungueltig: boolean;
  hinweis: string | null;
  teile: PfadTeil[];
}

export interface VorschlagEintrag {
  name: string;
  einsetzen: string;
  zahl: string | null;
}

export interface VorschlagListe {
  treffer: VorschlagEintrag[];
  neu: boolean;
  neuText: string;
  gewaehlt: number;
}

const EBENEN = 3;
const NAEHE = 2;
const MIN_AEHNLICH = 3;
const TIEFE = 'A path has at most three levels.';
const LUECKE = 'That path is missing a name.';
const NEU = ['New topic', 'New page', 'New section'] as const;

interface NamenTreffer {
  name: string;
  id: number;
}

interface NamenLosung {
  name: string;
  neu: boolean;
  hinweis: string | null;
  id: number | null;
  offen: boolean;
}

function distanz(links: string, rechts: string): number {
  if (Math.abs(links.length - rechts.length) > NAEHE) return NAEHE + 1;
  const zeile = Array.from({ length: rechts.length + 1 }, (_, index) => index);
  for (let i = 1; i <= links.length; i += 1) {
    let vorher = zeile[0] ?? 0;
    zeile[0] = i;
    for (let j = 1; j <= rechts.length; j += 1) {
      const alt = zeile[j] ?? 0;
      const kost = links[i - 1] === rechts[j - 1] ? 0 : 1;
      zeile[j] = Math.min((zeile[j - 1] ?? 0) + 1, alt + 1, vorher + kost);
      vorher = alt;
    }
  }
  return zeile[rechts.length] ?? NAEHE + 1;
}

function meintest(fragment: string, namen: readonly string[]): string | null {
  if ([...fragment].length < MIN_AEHNLICH) return null;
  const ziel = schluessel(fragment);
  const treffer = namen.filter((name) => {
    const key = schluessel(name);
    return key !== ziel && distanz(key, ziel) <= NAEHE;
  });
  if (treffer.length !== 1) return null;
  return treffer[0] ?? null;
}

function hinweisFuer(name: string | null): string | null {
  return name ? `Did you mean ${name}?` : null;
}

export function caretEbene(name: string, relativ: number): { ebene: number; fragment: string } {
  const stelle = Math.max(0, Math.min(relativ, name.length));
  const teile = name.split('/');
  let pos = 0;
  for (let index = 0; index < teile.length; index += 1) {
    const stueck = teile[index] ?? '';
    const ende = pos + stueck.length;
    if (stelle <= ende || index === teile.length - 1) return { ebene: index, fragment: stueck };
    pos = ende + 1;
  }
  return { ebene: 0, fragment: name };
}

export function ersetzeSegment(
  text: string,
  tag: TagFund,
  einsetzen: string,
  relativ: number,
): { text: string; caret: number } {
  const lage = caretEbene(tag.name, relativ);
  const teile = tag.name.split('/');
  while (teile.length <= lage.ebene) teile.push('');
  teile[lage.ebene] = einsetzen;
  return ersetzeTag(text, tag, teile.join('/'));
}

function rohTeile(name: string): { teile: string[]; ungueltig: 'tiefe' | 'luecke' | null } {
  const teile = name.split('/');
  if (teile.length > 1 && teile[teile.length - 1] === '') teile.pop();
  if (teile.some((teil) => teil.length === 0)) return { teile, ungueltig: 'luecke' };
  if (teile.length > EBENEN) return { teile, ungueltig: 'tiefe' };
  return { teile, ungueltig: null };
}

function seitenIn(topic: string, seiten: readonly SeiteKurz[]): SeiteKurz[] {
  const key = schluessel(topic);
  return seiten.filter((seite) => schluessel(seite.topic) === key);
}

function loeseNamen(fragment: string, kandidaten: readonly NamenTreffer[]): NamenLosung {
  const nadel = schluessel(fragment);
  const exakt = kandidaten.filter((eintrag) => schluessel(eintrag.name) === nadel);
  if (exakt.length > 0) {
    const beste = [...exakt].sort((a, b) => b.id - a.id)[0]!;
    return { name: beste.name, neu: false, hinweis: null, id: beste.id, offen: false };
  }
  const praefix = kandidaten.filter((eintrag) => schluessel(eintrag.name).startsWith(nadel));
  if (praefix.length === 1) {
    const eine = praefix[0]!;
    return { name: eine.name, neu: false, hinweis: null, id: eine.id, offen: false };
  }
  if (praefix.length > 1) return { name: fragment, neu: true, hinweis: null, id: null, offen: true };
  return { name: fragment, neu: true, hinweis: hinweisFuer(meintest(fragment, kandidaten.map((eintrag) => eintrag.name))), id: null, offen: false };
}

function leerPlan(text: string): AblagePlan {
  return {
    text,
    topicName: INBOX_NAME,
    source: 'manual',
    neu: false,
    seite: null,
    abschnitt: null,
    neuSeite: false,
    neuAbschnitt: false,
    ungueltig: false,
    hinweis: null,
    teile: [{ name: INBOX_NAME, neu: false }],
  };
}

function ungueltigPlan(text: string, hinweis: string): AblagePlan {
  return {
    text,
    topicName: INBOX_NAME,
    source: 'tag',
    neu: false,
    seite: null,
    abschnitt: null,
    neuSeite: false,
    neuAbschnitt: false,
    ungueltig: true,
    hinweis,
    teile: [],
  };
}

export function planeAblage(roh: string, themen: readonly Thema[], seiten: readonly SeiteKurz[] = []): AblagePlan | null {
  if (roh.trim().length === 0) return null;
  const erster = findeTags(roh)[0];
  if (!erster || erster.name.length === 0) return leerPlan(roh.trim());
  const pfad = rohTeile(erster.name);
  const text = entferneTag(roh, erster).trim();
  if (pfad.ungueltig) return ungueltigPlan(text, pfad.ungueltig === 'tiefe' ? TIEFE : LUECKE);
  const themaLos = loeseThema(pfad.teile[0] ?? '', [...themen]) ?? { name: pfad.teile[0] ?? '', neu: true };
  const themaHinweis = themaLos.neu ? hinweisFuer(meintest(pfad.teile[0] ?? '', themen.map((thema) => thema.name))) : null;
  const teile: PfadTeil[] = [{ name: themaLos.name, neu: themaLos.neu }];
  let hinweis = themaHinweis;
  let seite: string | null = null;
  let abschnitt: string | null = null;
  let neuSeite = false;
  let neuAbschnitt = false;
  let seitenId: number | null = null;
  if (pfad.teile.length >= 2) {
    const kandidaten = seitenIn(themaLos.name, seiten).map((eintrag) => ({ name: eintrag.titel, id: eintrag.id }));
    const los = loeseNamen(pfad.teile[1] ?? '', kandidaten);
    seite = los.name;
    neuSeite = los.neu;
    seitenId = los.id;
    teile.push({ name: los.name, neu: los.neu });
    if (los.hinweis) hinweis = los.hinweis;
  }
  if (pfad.teile.length >= 3 && seite) {
    const fund = seiten.find((eintrag) => eintrag.id === seitenId);
    const abschnitte = (fund?.abschnitte ?? []).map((name, index) => ({ name, id: index }));
    const los = loeseNamen(pfad.teile[2] ?? '', abschnitte);
    abschnitt = los.name;
    neuAbschnitt = los.neu;
    teile.push({ name: los.name, neu: los.neu });
    if (los.hinweis) hinweis = los.hinweis;
  }
  return {
    text,
    topicName: themaLos.name,
    source: 'tag',
    neu: themaLos.neu,
    seite,
    abschnitt,
    neuSeite,
    neuAbschnitt,
    ungueltig: false,
    hinweis,
    teile,
  };
}

function listeAus(
  ebene: number,
  fragment: string,
  treffer: VorschlagEintrag[],
  gewaehltName: string | null,
  neuErzwingen: boolean,
): VorschlagListe {
  const exakt = fragment.length > 0 && treffer.some((eintrag) => schluessel(eintrag.name) === schluessel(fragment));
  let gewaehlt = 0;
  if (gewaehltName) {
    const index = treffer.findIndex((eintrag) => eintrag.name === gewaehltName);
    if (index >= 0) gewaehlt = index;
  }
  const neu = (fragment.length > 0 && !exakt) || neuErzwingen;
  if (neuErzwingen) gewaehlt = treffer.length;
  return {
    treffer,
    neu,
    neuText: `${NEU[ebene] ?? NEU[0]} “${fragment}”`,
    gewaehlt,
  };
}

function themenListe(fragment: string, themen: readonly Thema[]): VorschlagListe {
  const treffer = passendeThemen(fragment, [...themen]).map((thema) => ({
    name: thema.name,
    einsetzen: tokenForm(thema.name),
    zahl: String(thema.count),
  }));
  const los = loeseThema(fragment, [...themen]);
  return listeAus(0, fragment, treffer, los && !los.neu ? los.name : null, false);
}

function seitenListe(name: string, fragment: string, themen: readonly Thema[], seiten: readonly SeiteKurz[]): VorschlagListe {
  const basis = name.split('/')[0] ?? '';
  const thema = loeseThema(basis, [...themen]);
  const pool = thema && !thema.neu ? seitenIn(thema.name, seiten) : [];
  const nadel = schluessel(fragment);
  const liste = (fragment.length === 0 ? pool : pool.filter((seite) => schluessel(seite.titel).startsWith(nadel))).sort(
    (a, b) => a.titel.localeCompare(b.titel) || b.id - a.id,
  );
  const treffer = liste.map((seite) => ({ name: seite.titel, einsetzen: tokenForm(seite.titel), zahl: null }));
  const los = fragment.length > 0 ? loeseNamen(fragment, liste.map((seite) => ({ name: seite.titel, id: seite.id }))) : null;
  return listeAus(1, fragment, treffer, los && !los.neu ? los.name : null, Boolean(los?.offen));
}

function abschnittListe(
  name: string,
  fragment: string,
  themen: readonly Thema[],
  seiten: readonly SeiteKurz[],
): VorschlagListe {
  const teile = name.split('/');
  const thema = loeseThema(teile[0] ?? '', [...themen]);
  const pool = thema && !thema.neu ? seitenIn(thema.name, seiten) : [];
  const seite = (teile[1] ?? '').length > 0 ? loeseNamen(teile[1] ?? '', pool.map((eintrag) => ({ name: eintrag.titel, id: eintrag.id }))) : null;
  const fund = seite && !seite.neu ? pool.find((eintrag) => eintrag.id === seite.id) : undefined;
  const abschnitte = fund?.abschnitte ?? [];
  const nadel = schluessel(fragment);
  const liste = fragment.length === 0 ? abschnitte : abschnitte.filter((titel) => schluessel(titel).startsWith(nadel));
  const treffer = liste.map((titel) => ({ name: titel, einsetzen: tokenForm(titel), zahl: null }));
  const los =
    fragment.length > 0
      ? loeseNamen(
          fragment,
          liste.map((titel, index) => ({ name: titel, id: index })),
        )
      : null;
  return listeAus(2, fragment, treffer, los && !los.neu ? los.name : null, Boolean(los?.offen));
}

export function vorschlaege(
  name: string,
  themen: readonly Thema[],
  seiten: readonly SeiteKurz[] = [],
  relativ = name.length,
): VorschlagListe {
  const lage = caretEbene(name, relativ);
  if (lage.ebene <= 0) return themenListe(lage.fragment, themen);
  if (lage.ebene === 1) return seitenListe(name, lage.fragment, themen, seiten);
  if (lage.ebene === 2) return abschnittListe(name, lage.fragment, themen, seiten);
  return { treffer: [], neu: false, neuText: '', gewaehlt: 0 };
}
