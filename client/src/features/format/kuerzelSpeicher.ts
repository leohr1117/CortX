const SCHLUESSEL = 'cortex.format-shortcuts';

export function kuerzelAn(): boolean {
  try {
    return localStorage.getItem(SCHLUESSEL) !== 'off';
  } catch {
    return true;
  }
}

export function setzeKuerzel(an: boolean): void {
  localStorage.setItem(SCHLUESSEL, an ? 'on' : 'off');
}
