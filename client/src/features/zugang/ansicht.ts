export type SitzungsModus = 'wartet' | 'an' | 'aus';

type Ansicht = 'warte' | 'login' | 'app';

export function naechsteAnsicht(modus: SitzungsModus, online: boolean): Ansicht {
  if (!online) return 'app';
  if (modus === 'wartet') return 'warte';
  if (modus === 'aus') return 'login';
  return 'app';
}
