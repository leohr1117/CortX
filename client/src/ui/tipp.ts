import type { MouseEvent, PointerEvent } from 'react';

const BEWEGUNG_PX = 10;
const SCROLL_PX = 2;
const WIEDERHOLUNG_MS = 500;

export interface TippStart {
  x: number;
  y: number;
  scroll: number;
}

export interface TippJetzt {
  x: number;
  y: number;
  scroll: number;
  maus: boolean;
}

const starts = new WeakMap<EventTarget, TippStart>();
const zuletzt = new WeakMap<object, number>();

export function istTipp(start: TippStart | null, jetzt: TippJetzt): boolean {
  if (!start || jetzt.maus) return false;
  if (Math.abs(jetzt.scroll - start.scroll) > SCROLL_PX) return false;
  return Math.abs(jetzt.x - start.x) <= BEWEGUNG_PX && Math.abs(jetzt.y - start.y) <= BEWEGUNG_PX;
}

export function wiederholung(ziel: object, jetzt = Date.now()): boolean {
  const davor = zuletzt.get(ziel) ?? 0;
  zuletzt.set(ziel, jetzt);
  return jetzt - davor < WIEDERHOLUNG_MS;
}

function scrollVon(ziel: EventTarget): number {
  if (!(ziel instanceof Element)) return 0;
  const rolle = ziel.closest('.rolle');
  return rolle instanceof HTMLElement ? rolle.scrollTop : 0;
}

export function merkTipp(event: PointerEvent<HTMLElement>): void {
  if (event.pointerType === 'mouse') return;
  starts.set(event.currentTarget, {
    x: event.clientX,
    y: event.clientY,
    scroll: scrollVon(event.currentTarget),
  });
}

export function losTipp(event: PointerEvent<HTMLElement>): void {
  const start = starts.get(event.currentTarget) ?? null;
  starts.delete(event.currentTarget);
  const tipp = istTipp(start, {
    x: event.clientX,
    y: event.clientY,
    scroll: scrollVon(event.currentTarget),
    maus: event.pointerType === 'mouse',
  });
  if (!tipp) return;
  event.currentTarget.click();
}

export function klickTipp(event: MouseEvent<HTMLElement>): boolean {
  if (!wiederholung(event.currentTarget)) return false;
  event.preventDefault();
  return true;
}
