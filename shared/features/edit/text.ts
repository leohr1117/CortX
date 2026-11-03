import { ablageSatz, ablageWann, TEXTE } from '../../kern/texte.ts';
import { tagesLabel, uhrzeit } from '../library/index.ts';
import { NOTE_TEXT_MAX } from '../../kern/grenzen.ts';
import type { NoteSource } from '../../kern/modell.ts';

export type TextGrund = 'empty' | 'long';

export type TextPlan = { ok: true; text: string } | { ok: false; grund: TextGrund };

export function planeNotizText(roh: string): TextPlan {
  const text = roh.trimStart();
  if (text.trim().length === 0) return { ok: false, grund: 'empty' };
  if (text.length > NOTE_TEXT_MAX) return { ok: false, grund: 'long' };
  return { ok: true, text };
}

export function textMeldung(grund: TextGrund): string {
  if (grund === 'empty') return TEXTE.leerSpeichern;
  return TEXTE.notizLang;
}

export function textGeaendert(ursprung: string, feld: string): boolean {
  return feld !== ursprung;
}

export function ablageZeile(
  notiz: { created: string; topic: string; source: NoteSource },
  jetzt: Date,
): string {
  const label = tagesLabel(notiz.created, jetzt);
  const zeit = uhrzeit(notiz.created);
  const via = notiz.source === 'tag' ? notiz.topic.toLocaleLowerCase() : null;
  return ablageSatz(ablageWann(label), zeit, via);
}
