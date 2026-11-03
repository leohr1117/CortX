import { describe, expect, it } from 'vitest';
import {
  pausiereLauf,
  setzeLaufFort,
  starteLauf,
  wischSchliesst,
} from './kartenregister.ts';
import {
  KARTE_DAUER_MIT_MS,
  KARTE_DAUER_OHNE_MS,
  KARTE_TEXT,
  KARTE_TREFFER_PX,
  KARTE_WISCHEN_PX,
  aktionOeffnen,
  aktionRueckgaengig,
  karteDauer,
  textHinzugefuegt,
  textThemaWeg,
  textThemaZusammen,
} from './karte.tsx';

describe('karte', () => {
  it('keeps the durations in one place', () => {
    expect(karteDauer(false)).toBe(KARTE_DAUER_OHNE_MS);
    expect(karteDauer(false)).toBe(5000);
    expect(karteDauer(true)).toBe(KARTE_DAUER_MIT_MS);
    expect(karteDauer(true)).toBe(8000);
  });

  it('keeps the card texts in one place', () => {
    expect(textHinzugefuegt('Inbox')).toBe('Added to Inbox');
    expect(textThemaWeg('Work')).toBe('\u201CWork\u201D deleted');
    expect(textThemaZusammen('Work', 'Ideas')).toBe('\u201CWork\u201D merged into Ideas');
    expect(KARTE_TEXT.offline).toBe('Filed offline · syncs later');
    expect(KARTE_TEXT.seiteGeloescht).toBe('Page deleted');
    expect(KARTE_TEXT.notizGeloescht).toBe('Note deleted');
    expect(KARTE_TEXT.rueckgaengig).toBe('Undo');
    expect(KARTE_TEXT.oeffnen).toBe('Open');
    expect(aktionRueckgaengig(() => undefined).text).toBe('Undo');
    expect(aktionOeffnen(() => undefined).text).toBe('Open');
    expect(KARTE_TREFFER_PX).toBe(48);
    expect(KARTE_WISCHEN_PX).toBe(80);
  });

  it('pauses the remaining time and continues it afterwards', () => {
    const lauf = starteLauf(true, 1_000);
    expect(lauf.restMs).toBe(8_000);
    const pause = pausiereLauf(lauf, 1_500);
    expect(pause.pausiert).toBe(true);
    expect(pause.restMs).toBe(7_500);
    expect(pausiereLauf(pause, 9_000)).toBe(pause);
    const weiter = setzeLaufFort(pause, 9_000);
    expect(weiter.pausiert).toBe(false);
    expect(weiter.restMs).toBe(7_500);
    expect(weiter.seit).toBe(9_000);
    expect(setzeLaufFort(weiter, 9_100)).toBe(weiter);
  });

  it('does not keep a negative rest when the pause is late', () => {
    const lauf = starteLauf(false, 0);
    expect(pausiereLauf(lauf, 9_000).restMs).toBe(0);
  });

  it('closes on a sideways or downward swipe and ignores a short drag', () => {
    expect(wischSchliesst(80, 0)).toBe(true);
    expect(wischSchliesst(-80, 10)).toBe(true);
    expect(wischSchliesst(0, 80)).toBe(true);
    expect(wischSchliesst(10, -80)).toBe(false);
    expect(wischSchliesst(40, 10)).toBe(false);
  });
});
