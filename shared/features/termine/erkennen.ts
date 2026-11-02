import { findeTags } from '../tags/index.ts';
import {
  datumText,
  loeseJahr,
  plusTage,
  wochentag,
  berlinerTag,
  type KalenderTag,
} from './kalender.ts';

export interface Termin {
  datum: string;
  uhrzeit: string | null;
}

interface Fund {
  start: number;
  end: number;
  datum: KalenderTag | null;
  uhrzeit: string | null;
}

const MONATE: ReadonlyArray<readonly [string, number]> = [
  ['january', 1], ['januar', 1], ['jan', 1],
  ['february', 2], ['februar', 2], ['feb', 2],
  ['march', 3], ['märz', 3], ['maerz', 3], ['mar', 3], ['mrz', 3],
  ['april', 4], ['apr', 4],
  ['may', 5], ['mai', 5],
  ['june', 6], ['juni', 6], ['jun', 6],
  ['july', 7], ['juli', 7], ['jul', 7],
  ['august', 8], ['aug', 8],
  ['september', 9], ['sept', 9], ['sep', 9],
  ['october', 10], ['oktober', 10], ['oct', 10], ['okt', 10],
  ['november', 11], ['nov', 11],
  ['december', 12], ['dezember', 12], ['dec', 12], ['dez', 12],
];

const MONAT = [...MONATE]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([name]) => name)
  .join('|');

const WOCHEN: Readonly<Record<string, number>> = {
  sunday: 0, sonntag: 0,
  monday: 1, montag: 1,
  tuesday: 2, dienstag: 2,
  wednesday: 3, mittwoch: 3,
  thursday: 4, donnerstag: 4,
  friday: 5, freitag: 5,
  saturday: 6, samstag: 6, sonnabend: 6,
};

const RELATIV: Readonly<Record<string, number>> = {
  today: 0, heute: 0,
  tomorrow: 1, morgen: 1,
  yesterday: -1, gestern: -1,
};

const ZAHL_JAHR = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/;
const ZAHL_KURZ = /^(\d{1,2})\.(\d{1,2})\.(?!\d)/;
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?![\d-])/;
const RELATIV_MUSTER = /^(today|tomorrow|yesterday|heute|morgen|gestern)(?!\p{L})/iu;
const WOCHENTAG = new RegExp(
  `^(?:(next|n(?:ä|ae)chste[nr]?)[ \\t]+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag)(?!\\p{L})`,
  'iu',
);
const TAG_MONAT = new RegExp(
  `^(\\d{1,2})(?:st|nd|rd|th)?(?!:)(?:[ \\t]+of)?[. \\t]+(${MONAT})(?!\\p{L})(?:[ \\t]+(\\d{4})(?!\\d))?`,
  'iu',
);
const MONAT_TAG = new RegExp(
  `^(${MONAT})(?!\\p{L})[ \\t]+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?!:)(?![ \\t]*(?:a\\.?m\\.?|p\\.?m\\.?|uhr)(?!\\p{L}))(?:(?:[ \\t]*,[ \\t]*|[ \\t]+)(\\d{4})(?!\\d))?`,
  'iu',
);
const ZWOELF = /^(\d{1,2})(?::([0-5]\d))?(?::([0-5]\d))?[ \t]*(a\.?m\.?|p\.?m\.?)(?!\p{L})/iu;
const UHR = /^(\d{1,2})(?::([0-5]\d))?(?::([0-5]\d))?[ \t]*uhr(?!\p{L})/iu;
const TAGESZEIT = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?![\d:])(?![ \t]*(?:a\.?m\.?|p\.?m\.?|uhr)(?!\p{L}))/iu;
const LUECKE = /^[ \t]*(?:,[ \t]*)?(?:at|um|gegen|around|circa|ca\.?|@)?[ \t]*$/i;

function monatZahl(name: string): number | null {
  const schluessel = name.toLocaleLowerCase('de');
  const fund = MONATE.find(([eintrag]) => eintrag === schluessel);
  return fund ? fund[1] : null;
}

function ziffer(stunde: number, minute: number): string | null {
  if (stunde < 0 || stunde > 23 || minute < 0 || minute > 59) return null;
  return `${String(stunde).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function zwolf(stunde: number, minute: number, nachmittag: boolean): string | null {
  if (stunde < 1 || stunde > 12) return null;
  if (stunde === 12) return ziffer(nachmittag ? 12 : 0, minute);
  return ziffer(nachmittag ? stunde + 12 : stunde, minute);
}

function anfang(text: string, index: number): boolean {
  if (index === 0) return true;
  return !/[\p{L}\p{N}.:]/u.test(text[index - 1] ?? '');
}

function zahl(rest: string, index: number, bezug: KalenderTag): Fund | null {
  const jahr = ZAHL_JAHR.exec(rest);
  if (jahr?.[1] && jahr[2] && jahr[3] && !/^\.\d/.test(rest.slice(jahr[0].length))) {
    const datum = loeseJahr(Number(jahr[2]), Number(jahr[1]), bezug, Number(jahr[3]));
    if (datum) return { start: index, end: index + jahr[0].length, datum, uhrzeit: null };
  }
  const kurz = ZAHL_KURZ.exec(rest);
  if (kurz?.[1] && kurz[2]) {
    const datum = loeseJahr(Number(kurz[2]), Number(kurz[1]), bezug, null);
    if (datum) return { start: index, end: index + kurz[0].length, datum, uhrzeit: null };
  }
  return null;
}

function iso(rest: string, index: number, bezug: KalenderTag): Fund | null {
  const fund = ISO.exec(rest);
  if (!fund?.[1] || !fund[2] || !fund[3]) return null;
  const datum = loeseJahr(Number(fund[2]), Number(fund[3]), bezug, Number(fund[1]));
  if (!datum) return null;
  return { start: index, end: index + fund[0].length, datum, uhrzeit: null };
}

function benannterMonat(rest: string, index: number, bezug: KalenderTag): Fund | null {
  const voran = TAG_MONAT.exec(rest);
  if (voran?.[1] && voran[2]) {
    const monat = monatZahl(voran[2]);
    const datum = monat === null ? null : loeseJahr(monat, Number(voran[1]), bezug, voran[3] ? Number(voran[3]) : null);
    if (datum) return { start: index, end: index + voran[0].length, datum, uhrzeit: null };
  }
  const danach = MONAT_TAG.exec(rest);
  if (!danach?.[1] || !danach[2]) return null;
  const monat = monatZahl(danach[1]);
  const datum = monat === null ? null : loeseJahr(monat, Number(danach[2]), bezug, danach[3] ? Number(danach[3]) : null);
  if (!datum) return null;
  return { start: index, end: index + danach[0].length, datum, uhrzeit: null };
}

function relativ(rest: string, index: number, bezug: KalenderTag): Fund | null {
  const fund = RELATIV_MUSTER.exec(rest);
  const wort = fund?.[1]?.toLocaleLowerCase('de');
  const tage = wort === undefined ? undefined : RELATIV[wort];
  if (!fund || tage === undefined) return null;
  return { start: index, end: index + fund[0].length, datum: plusTage(bezug, tage), uhrzeit: null };
}

function woche(rest: string, index: number, bezug: KalenderTag): Fund | null {
  const fund = WOCHENTAG.exec(rest);
  const name = fund?.[2]?.toLocaleLowerCase('de');
  const ziel = name ? WOCHEN[name] : undefined;
  if (ziel === undefined || !fund) return null;
  let delta = (ziel - wochentag(bezug) + 7) % 7;
  if (fund[1] && delta === 0) delta = 7;
  return { start: index, end: index + fund[0].length, datum: plusTage(bezug, delta), uhrzeit: null };
}

function uhr(rest: string, index: number): Fund | null {
  const zwoelf = ZWOELF.exec(rest);
  if (zwoelf?.[1] && zwoelf[4]) {
    const zeit = zwolf(Number(zwoelf[1]), zwoelf[2] ? Number(zwoelf[2]) : 0, zwoelf[4].toLocaleLowerCase('de').startsWith('p'));
    if (zeit) return { start: index, end: index + zwoelf[0].length, datum: null, uhrzeit: zeit };
  }
  const wort = UHR.exec(rest);
  if (wort?.[1]) {
    const zeit = ziffer(Number(wort[1]), wort[2] ? Number(wort[2]) : 0);
    if (zeit) return { start: index, end: index + wort[0].length, datum: null, uhrzeit: zeit };
  }
  const nackt = TAGESZEIT.exec(rest);
  if (!nackt?.[1] || !nackt[2]) return null;
  const zeit = ziffer(Number(nackt[1]), Number(nackt[2]));
  if (!zeit) return null;
  return { start: index, end: index + nackt[0].length, datum: null, uhrzeit: zeit };
}

function bester(text: string, index: number, bezug: KalenderTag): Fund | null {
  const rest = text.slice(index);
  const kandidaten = [zahl(rest, index, bezug), iso(rest, index, bezug), benannterMonat(rest, index, bezug), relativ(rest, index, bezug), woche(rest, index, bezug), uhr(rest, index)];
  let beste: Fund | null = null;
  for (const kandidat of kandidaten) {
    if (kandidat && (!beste || kandidat.end > beste.end)) beste = kandidat;
  }
  return beste;
}

function finde(text: string, bezug: KalenderTag): Fund[] {
  const tags = findeTags(text);
  const funde: Fund[] = [];
  let index = 0;
  while (index < text.length) {
    const tag = tags.find((eintrag) => index >= eintrag.start && index < eintrag.end);
    if (tag) {
      index = tag.end;
      continue;
    }
    const zeichen = text[index] ?? '';
    if (!/[\p{L}\p{N}]/u.test(zeichen) || !anfang(text, index)) {
      index += 1;
      continue;
    }
    const fund = bester(text, index, bezug);
    if (!fund) {
      index += 1;
      continue;
    }
    funde.push(fund);
    index = fund.end;
  }
  return funde;
}

function angrenzend(text: string, links: Fund, rechts: Fund): boolean {
  const linksZeit = links.uhrzeit !== null && links.datum === null;
  const rechtsZeit = rechts.uhrzeit !== null && rechts.datum === null;
  if (linksZeit === rechtsZeit) return false;
  return LUECKE.test(text.slice(links.end, rechts.start));
}

export function erkenneTermin(text: string, bezug: Date): Termin | null {
  const tag = berlinerTag(bezug);
  if (!tag || text.trim() === '') return null;
  const funde = finde(text, tag);
  const erste = funde[0];
  if (!erste) return null;
  const zweite = funde[1];
  const gewaehlt = zweite && angrenzend(text, erste, zweite)
    ? { datum: erste.datum ?? zweite.datum, uhrzeit: erste.uhrzeit ?? zweite.uhrzeit }
    : erste;
  const datum = gewaehlt.datum ?? tag;
  return { datum: datumText(datum), uhrzeit: gewaehlt.uhrzeit };
}
