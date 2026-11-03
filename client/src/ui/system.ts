import { DESKTOP_AB } from '../../../shared/kern/grenzen.ts';

function istMac(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const plattform = nav.userAgentData?.platform ?? navigator.platform ?? '';
  return /mac/i.test(plattform);
}

export function setzeSystem(): void {
  if (istMac()) document.documentElement.dataset.os = 'mac';
}

export function tastaturIstHandy(): boolean {
  return window.matchMedia(`(max-width: ${DESKTOP_AB - 1}px), (hover: none), (pointer: coarse)`).matches;
}
