import { MONATE, TEXTE } from '../../kern/texte.ts';
import { berlinerTag } from './kalender.ts';
import type { Termin } from './erkennen.ts';

export function terminText(termin: Termin, heute: Date): string {
  const teile = /^(\d{4})-(\d{2})-(\d{2})$/.exec(termin.datum);
  if (!teile?.[1] || !teile[2] || !teile[3]) return '';
  const jahr = Number(teile[1]);
  const name = MONATE[Number(teile[2]) - 1];
  const tag = Number(teile[3]);
  if (!name || tag < 1) return '';
  const leseJahr = berlinerTag(heute)?.jahr;
  const basis = leseJahr === jahr ? `${tag} ${name}` : `${tag} ${name} ${jahr}`;
  if (!termin.uhrzeit) return basis;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(termin.uhrzeit)) return basis;
  return `${basis}${TEXTE.punktMitte}${termin.uhrzeit}`;
}
