import { ART } from './baum.ts';

export const STIL_VAR = '--stil-hintergrund';

export interface FormatStil {
  schrift?: string;
  hintergrund?: string;
  farbe?: string;
}

interface StilEintrag {
  art: typeof ART.code | typeof ART.wichtig;
  stil: FormatStil;
}

const STIL_FELDER = ['schrift', 'hintergrund', 'farbe'] as const;

export const STIL_REGISTER: readonly StilEintrag[] = [
  {
    art: ART.code,
    stil: {
      schrift: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
      hintergrund: 'var(--flaeche-2)',
    },
  },
  {
    art: ART.wichtig,
    stil: { hintergrund: '#f3e2a8', farbe: '#1a1a1a' },
  },
];

export function kombiniereStil(arten: readonly string[]): FormatStil {
  const dabei = new Set(arten);
  const ergebnis: FormatStil = {};
  for (const eintrag of STIL_REGISTER) {
    if (!dabei.has(eintrag.art)) continue;
    for (const feld of STIL_FELDER) {
      const wert = eintrag.stil[feld];
      if (wert !== undefined) ergebnis[feld] = wert;
    }
  }
  return ergebnis;
}

export function stilAttribut(arten: readonly string[]): string | undefined {
  if (!arten.includes(ART.code) || !arten.includes(ART.wichtig)) return undefined;
  const hintergrund = kombiniereStil(arten).hintergrund;
  if (!hintergrund) return undefined;
  return `${STIL_VAR}:${hintergrund}`;
}
