export const HINDERNIS = {
  leiste: '.format-leiste.mobil',
  fuss: 'footer.fuss .btn',
  hinweis: '.toast.hinweis',
} as const;

export const LAGE = {
  karteAbstandPx: 16,
  leisteLueckePx: 12,
  tastaturSchwellePx: 80,
  nachleseMs: 280,
  listeMaxPx: 320,
  listeMinPx: 96,
  listeLueckePx: 6,
} as const;

export const LAGE_VAR = {
  boden: '--leiste-boden',
  hub: '--leiste-hub',
  toast: '--toast-boden',
  ueberlapp: '--leiste-ueberlapp',
  karteHub: '--karte-hub',
} as const;

interface Sichtmasse {
  innenHoehe: number;
  sichtHoehe: number;
  sichtVersatz: number;
}

export function liesSicht(): Sichtmasse {
  const sicht = window.visualViewport;
  const innenHoehe = window.innerHeight;
  return {
    innenHoehe,
    sichtHoehe: sicht?.height ?? innenHoehe,
    sichtVersatz: sicht?.offsetTop ?? 0,
  };
}

function tastaturPx(sicht: Sichtmasse): number {
  return Math.max(0, sicht.innenHoehe - sicht.sichtVersatz - sicht.sichtHoehe);
}

export function leisteBodenPx(sicht: Sichtmasse, sicherUnten: number, fixedFolgtSicht: boolean): number {
  const tastatur = tastaturPx(sicht);
  if (tastatur >= LAGE.tastaturSchwellePx) return fixedFolgtSicht ? 0 : Math.round(tastatur);
  return Math.max(0, Math.round(sicherUnten));
}

export function layoutHubPx(sicht: Sichtmasse, sicherUnten: number, barHoehe: number): number {
  const tastatur = tastaturPx(sicht);
  const boden = tastatur >= LAGE.tastaturSchwellePx ? Math.round(tastatur) : Math.max(0, Math.round(sicherUnten));
  return boden + Math.max(0, Math.round(barHoehe));
}

interface ListenPlatz {
  top: number;
  maxHoehe: number;
}

export function listenPlatz(
  obenKante: number,
  untenKante: number,
  ankerOben: number,
  ankerUnten: number,
  maxPx: number,
  minPx: number,
  luecke: number,
): ListenPlatz {
  const freiUnten = Math.max(0, Math.floor(untenKante - ankerUnten - luecke));
  const freiOben = Math.max(0, Math.floor(ankerOben - obenKante - luecke));
  if (freiUnten >= minPx || freiUnten >= freiOben) {
    return { top: Math.round(ankerUnten + luecke), maxHoehe: Math.min(maxPx, freiUnten) };
  }
  const maxHoehe = Math.min(maxPx, freiOben);
  return { top: Math.round(ankerOben - luecke - maxHoehe), maxHoehe };
}

export function kartenHubPx(
  sicht: Sichtmasse,
  oben: readonly number[],
  abstand: number,
  fixedFolgtSicht: boolean,
): number {
  let bedarf = fixedFolgtSicht ? 0 : tastaturPx(sicht);
  for (const kante of oben) {
    const vonUnten = fixedFolgtSicht
      ? sicht.sichtHoehe - kante
      : sicht.innenHoehe - sicht.sichtVersatz - kante;
    bedarf = Math.max(bedarf, vonUnten);
  }
  if (bedarf <= 0) return 0;
  return Math.round(bedarf + abstand);
}

export function ueberlappPx(behaelterUnten: number, kanteOben: number, luecke: number): number {
  return Math.max(0, Math.round(behaelterUnten - kanteOben + luecke));
}

export function hindernisOben(wurzel: ParentNode = document): number[] {
  const oben: number[] = [];
  for (const selektor of Object.values(HINDERNIS)) {
    const el = wurzel.querySelector(selektor);
    if (!(el instanceof HTMLElement)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) continue;
    oben.push(rect.top);
  }
  return oben;
}

let sicherProbe: HTMLElement | null = null;
let sichtSonde: HTMLElement | null = null;

function versteckteKante(hoehe: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.position = 'fixed';
  el.style.left = '0';
  el.style.bottom = '0';
  el.style.width = '0';
  el.style.height = hoehe;
  el.style.visibility = 'hidden';
  el.style.pointerEvents = 'none';
  document.documentElement.appendChild(el);
  return el;
}

export function sicherUntenPx(): number {
  if (typeof document === 'undefined') return 0;
  if (!sicherProbe) sicherProbe = versteckteKante('env(safe-area-inset-bottom, 0px)');
  return Math.round(sicherProbe.getBoundingClientRect().height);
}

export function fixedFolgtSicht(sicht: Sichtmasse): boolean {
  if (typeof document === 'undefined') return false;
  if (tastaturPx(sicht) < LAGE.tastaturSchwellePx) return false;
  if (!sichtSonde) sichtSonde = versteckteKante('0px');
  return Math.abs(sichtSonde.getBoundingClientRect().bottom - sicht.sichtHoehe) <= 2;
}

export function beobachteSicht(neu: () => void): () => void {
  let rahmen = 0;
  let rahmen2 = 0;
  let timer = 0;
  const lauf = () => {
    neu();
    cancelAnimationFrame(rahmen);
    cancelAnimationFrame(rahmen2);
    rahmen = requestAnimationFrame(() => {
      neu();
      rahmen2 = requestAnimationFrame(neu);
    });
    window.clearTimeout(timer);
    timer = window.setTimeout(neu, LAGE.nachleseMs);
  };
  const sicht = window.visualViewport;
  sicht?.addEventListener('resize', lauf);
  sicht?.addEventListener('scroll', lauf);
  window.addEventListener('resize', lauf);
  document.addEventListener('focusin', lauf);
  document.addEventListener('focusout', lauf);
  lauf();
  return () => {
    sicht?.removeEventListener('resize', lauf);
    sicht?.removeEventListener('scroll', lauf);
    window.removeEventListener('resize', lauf);
    document.removeEventListener('focusin', lauf);
    document.removeEventListener('focusout', lauf);
    cancelAnimationFrame(rahmen);
    cancelAnimationFrame(rahmen2);
    window.clearTimeout(timer);
  };
}
