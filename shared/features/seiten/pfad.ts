import { INBOX_NAME } from '../../kern/grenzen.ts';
import { meintest as satzMeintest, neuerName, TEXTE } from '../../kern/texte.ts';
import type { Thema } from '../../kern/modell.ts';
import { loeseThema, passendeThemen, ersetzeTag, type TagFund } from '../tags/regeln.ts';
import { EBENEN, PFAD_TRENNER, zerlegeZielzeilen, type PfadEbene } from './register.ts';
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

export interface AblageZiel {
  text: string;
  topicName: string;
  source: 'tag' | 'manual';
  neu: boolean;
  seite: string | null;
  abschnitt: string | null;
  neuSeite: boolean;
  neuAbschnitt: boolean;
  teile: PfadTeil[];
  hinweis: string | null;
}

export interface AblagePlan {
  ziele: AblageZiel[];
  ungueltig: boolean;
  hinweis: string | null;
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

const NAEHE = 2;
const MIN_AEHNLICH = 3;
const TIEFE = TEXTE.pfadTiefe;
const LUECKE = TEXTE.pfadLuecke;
const THEMA: PfadEbene = EBENEN[0];
const SEITE: PfadEbene = EBENEN[1];
const ABSCHNITT: PfadEbene = EBENEN[2];
const NEU: Record<PfadEbene, string> = {
  [THEMA]: TEXTE.neuesThema,
  [SEITE]: TEXTE.neueSeite,
  [ABSCHNITT]: TEXTE.neuerAbschnitt,
};

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
  return name ? satzMeintest(name) : null;
}

export function caretEbene(name: string, relativ: number): { ebene: number; fragment: string } {
  const stelle = Math.max(0, Math.min(relativ, name.length));
  const teile = name.split(PFAD_TRENNER);
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
  const teile = tag.name.split(PFAD_TRENNER);
  while (teile.length <= lage.ebene) teile.push('');
  teile[lage.ebene] = einsetzen;
  return ersetzeTag(text, tag, teile.join(PFAD_TRENNER));
}

function rohTeile(name: string): { teile: string[]; ungueltig: 'tiefe' | 'luecke' | null } {
  const teile = name.split(PFAD_TRENNER);
  if (teile.length > 1 && teile[teile.length - 1] === '') teile.pop();
  if (teile.some((teil) => teil.length === 0)) return { teile, ungueltig: 'luecke' };
  if (teile.length > EBENEN.length) return { teile, ungueltig: 'tiefe' };
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

function inboxZiel(text: string): AblageZiel {
  return {
    text,
    topicName: INBOX_NAME,
    source: 'manual',
    neu: false,
    seite: null,
    abschnitt: null,
    neuSeite: false,
    neuAbschnitt: false,
    teile: [{ name: INBOX_NAME, neu: false }],
    hinweis: null,
  };
}

function loesePfad(name: string, body: string, themen: readonly Thema[], seiten: readonly SeiteKurz[]): AblageZiel | { hinweis: string } {
  const pfad = rohTeile(name);
  if (pfad.ungueltig) return { hinweis: pfad.ungueltig === 'tiefe' ? TIEFE : LUECKE };
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
    const abschnitte = (fund?.abschnitte ?? []).map((titel, index) => ({ name: titel, id: index }));
    const los = loeseNamen(pfad.teile[2] ?? '', abschnitte);
    abschnitt = los.name;
    neuAbschnitt = los.neu;
    teile.push({ name: los.name, neu: los.neu });
    if (los.hinweis) hinweis = los.hinweis;
  }
  return {
    text: body,
    topicName: themaLos.name,
    source: 'tag',
    neu: themaLos.neu,
    seite,
    abschnitt,
    neuSeite,
    neuAbschnitt,
    teile,
    hinweis,
  };
}

function istZiel(wert: AblageZiel | { hinweis: string }): wert is AblageZiel {
  return 'topicName' in wert;
}

export function planeAblage(roh: string, themen: readonly Thema[], seiten: readonly SeiteKurz[] = []): AblagePlan | null {
  const rohTeileListe = zerlegeZielzeilen(roh);
  if (!rohTeileListe) return null;
  const ziele: AblageZiel[] = [];
  for (const teil of rohTeileListe) {
    if (teil.pfad === null) {
      ziele.push(inboxZiel(teil.text));
      continue;
    }
    const ziel = loesePfad(teil.pfad, teil.text, themen, seiten);
    if (!istZiel(ziel)) return { ziele: [], ungueltig: true, hinweis: ziel.hinweis };
    ziele.push(ziel);
  }
  if (ziele.length === 0) return null;
  return { ziele, ungueltig: false, hinweis: null };
}

function listeAus(
  ebene: PfadEbene,
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
    neuText: neuerName(NEU[ebene], fragment),
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
  return listeAus(THEMA, fragment, treffer, los && !los.neu ? los.name : null, false);
}

function seitenListe(name: string, fragment: string, themen: readonly Thema[], seiten: readonly SeiteKurz[]): VorschlagListe {
  const basis = name.split(PFAD_TRENNER)[0] ?? '';
  const thema = loeseThema(basis, [...themen]);
  const pool = thema && !thema.neu ? seitenIn(thema.name, seiten) : [];
  const nadel = schluessel(fragment);
  const liste = (fragment.length === 0 ? pool : pool.filter((seite) => schluessel(seite.titel).startsWith(nadel))).sort(
    (a, b) => a.titel.localeCompare(b.titel) || b.id - a.id,
  );
  const treffer = liste.map((seite) => ({ name: seite.titel, einsetzen: tokenForm(seite.titel), zahl: null }));
  const los = fragment.length > 0 ? loeseNamen(fragment, liste.map((seite) => ({ name: seite.titel, id: seite.id }))) : null;
  return listeAus(SEITE, fragment, treffer, los && !los.neu ? los.name : null, Boolean(los?.offen));
}

function abschnittListe(
  name: string,
  fragment: string,
  themen: readonly Thema[],
  seiten: readonly SeiteKurz[],
): VorschlagListe {
  const teile = name.split(PFAD_TRENNER);
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
  return listeAus(ABSCHNITT, fragment, treffer, los && !los.neu ? los.name : null, Boolean(los?.offen));
}

export function vorschlaege(
  name: string,
  themen: readonly Thema[],
  seiten: readonly SeiteKurz[] = [],
  relativ = name.length,
): VorschlagListe {
  const lage = caretEbene(name, relativ);
  const stufe = EBENEN[lage.ebene];
  if (stufe === THEMA) return themenListe(lage.fragment, themen);
  if (stufe === SEITE) return seitenListe(name, lage.fragment, themen, seiten);
  if (stufe === ABSCHNITT) return abschnittListe(name, lage.fragment, themen, seiten);
  return { treffer: [], neu: false, neuText: '', gewaehlt: 0 };
}
