import { describe, expect, it } from 'vitest';
import { kartenHubPx, leisteBodenPx, ueberlappPx, type Sichtmasse } from './lage.ts';

function sicht(innenHoehe: number, sichtHoehe: number, sichtVersatz = 0): Sichtmasse {
  return { innenHoehe, sichtHoehe, sichtVersatz };
}

describe('lage', () => {
  it('sits on the keyboard and leaves the safe area and the footer out', () => {
    const boden = leisteBodenPx(sicht(844, 500), 754, 34, false);
    expect(boden).toBe(344);
  });

  it('stays put when the browser already pins fixed elements to the keyboard', () => {
    expect(leisteBodenPx(sicht(844, 500), 754, 34, true)).toBe(0);
  });

  it('sits on the footer when the keyboard is closed', () => {
    expect(leisteBodenPx(sicht(844, 844), 754, 34, false)).toBe(90);
  });

  it('uses the safe area on a note when the keyboard is closed', () => {
    expect(leisteBodenPx(sicht(844, 844), null, 34, false)).toBe(34);
  });

  it('does not add the safe area on a note while the keyboard is open', () => {
    expect(leisteBodenPx(sicht(844, 500), null, 34, false)).toBe(344);
  });

  it('does not stack the footer on a shifted visual viewport', () => {
    expect(leisteBodenPx(sicht(844, 480, 40), 714, 34, false)).toBe(324);
  });

  it('keeps a tiny viewport gap from covering the File button', () => {
    expect(leisteBodenPx(sicht(844, 842), 754, 34, false)).toBe(90);
  });

  it('keeps the bar on the footer when the layout itself already ends at the keyboard', () => {
    expect(leisteBodenPx(sicht(544, 544), 454, 0, false)).toBe(90);
  });

  it('lifts the card above the bar and the keyboard', () => {
    expect(kartenHubPx(sicht(844, 500), [451, 754], 16, false)).toBe(409);
  });

  it('lifts the card above the bar when the keyboard is closed', () => {
    expect(kartenHubPx(sicht(844, 844), [705, 754], 16, false)).toBe(155);
  });

  it('lifts the card from the visual bottom when fixed elements follow it', () => {
    expect(kartenHubPx(sicht(844, 500), [451], 16, true)).toBe(65);
  });

  it('clears the bar inside its container', () => {
    expect(ueberlappPx(754, 705, 12)).toBe(61);
    expect(ueberlappPx(844, 495, 12)).toBe(361);
  });
});
