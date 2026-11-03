import { describe, expect, it } from 'vitest';
import { kartenHubPx, layoutHubPx, leisteBodenPx, listenPlatz, ueberlappPx } from './lage.ts';

function sicht(innenHoehe: number, sichtHoehe: number, sichtVersatz = 0) {
  return { innenHoehe, sichtHoehe, sichtVersatz };
}

describe('lage', () => {
  it('sits on the keyboard and leaves the safe area out', () => {
    expect(leisteBodenPx(sicht(844, 500), 34, false)).toBe(344);
  });

  it('stays put when the browser already pins fixed elements to the keyboard', () => {
    expect(leisteBodenPx(sicht(844, 500), 34, true)).toBe(0);
  });

  it('sits on the safe area when the keyboard is closed', () => {
    expect(leisteBodenPx(sicht(844, 844), 34, false)).toBe(34);
  });

  it('does not add the safe area while the keyboard is open', () => {
    expect(leisteBodenPx(sicht(844, 500), 34, false)).toBe(344);
  });

  it('uses the keyboard inset when the visual viewport is shifted', () => {
    expect(leisteBodenPx(sicht(844, 480, 40), 34, false)).toBe(324);
  });

  it('ignores a tiny viewport gap and stays on the safe area', () => {
    expect(leisteBodenPx(sicht(844, 842), 34, false)).toBe(34);
  });

  it('sits on the screen edge when the layout itself already ends at the keyboard', () => {
    expect(leisteBodenPx(sicht(544, 544), 0, false)).toBe(0);
  });

  it('reserves the bar and the safe area in the layout', () => {
    expect(layoutHubPx(sicht(844, 844), 34, 49)).toBe(83);
  });

  it('reserves the bar and the keyboard in the layout', () => {
    expect(layoutHubPx(sicht(844, 500), 34, 49)).toBe(393);
  });

  it('opens a list downward and keeps it above the bar', () => {
    expect(listenPlatz(0, 700, 80, 110, 320, 96, 6)).toEqual({ top: 116, maxHoehe: 320 });
    expect(listenPlatz(0, 400, 200, 240, 320, 96, 6)).toEqual({ top: 246, maxHoehe: 154 });
  });

  it('opens a list upward when the bar leaves no room below the caret', () => {
    expect(listenPlatz(0, 360, 300, 330, 320, 96, 6)).toEqual({ top: 0, maxHoehe: 294 });
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
