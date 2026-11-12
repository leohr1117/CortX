export const EXPORT_NAME_MAX = 60;

const RESERVIERT = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const ERLAUBT = /[\p{L}0-9 _-]/u;

function kuerze(wert: string, max: number): string {
  const zeichen = Array.from(wert);
  if (zeichen.length <= max) return wert;
  return zeichen.slice(0, max).join('');
}

function raender(wert: string): string {
  return wert.replace(/^[- ]+|[- ]+$/g, '');
}

export function exportDateiname(titel: string): string {
  const nfc = titel.normalize('NFC');
  let aus = '';
  for (const zeichen of nfc) {
    aus += ERLAUBT.test(zeichen) ? zeichen : '-';
  }
  aus = raender(aus.replace(/-+/g, '-'));
  aus = raender(kuerze(aus, EXPORT_NAME_MAX));
  if (aus.length === 0) return 'note.md';
  if (RESERVIERT.test(aus)) aus = `note-${aus}`;
  return `${aus}.md`;
}
