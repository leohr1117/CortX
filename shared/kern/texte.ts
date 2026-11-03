export const TEXTE = {
  marke: 'CortX',
  anmeldenUntertitel: 'Sign in with your Stride account.',
  benutzer: 'Username',
  passwort: 'Password',
  passwortVerbergen: 'Hide password',
  passwortZeigen: 'Show password',
  verbergen: 'Hide',
  zeigen: 'Show',
  anmelden: 'Sign in',
  anmeldenPunkt: 'Sign in.',
  passwortHinweis: 'Change your password in Stride.',
  anmeldenNamen: 'Enter your username and password.',
  anmeldenFalsch: 'The username or password is wrong.',
  strideWeg: 'Stride is not reachable. Try again later.',
  anmeldenLimit: 'Too many sign-in attempts. Try again later.',
  anmeldenKaputt: 'Could not sign in.',
  abmelden: 'Sign out',
  bibliothek: 'Library',
  zurueckErfassen: 'Back to Capture',
  zurueckBibliothek: 'Back to Library',
  zurueck: 'Back',
  themen: 'Topics',
  thema: 'Topic',
  ohneThema: 'Notes without a topic',
  leer: 'No notes yet.',
  sucheLeer: 'No matches.',
  sucheNotizen: 'Search notes',
  sucheThemen: 'Search topics',
  ladenBibliothek: 'Could not load the library.',
  suchenFehl: 'Could not search.',
  sucheUngueltig: 'The search is missing or invalid.',
  sucheLang: 'The search is too long.',
  inboxLeer: 'Inbox is empty.',
  themaFehlt: 'Topic not found.',
  themaLaden: 'Could not load this topic.',
  notizFehlt: 'Note not found.',
  notizLaden: 'Could not load the note.',
  seiteNeuGeladen: 'This page changed. Reloaded the latest text.',
  seiteKonflikt: 'This page changed. Reload it and try again.',
  speichernNotiz: 'Could not save the note.',
  loeschenNotiz: 'Could not delete the note.',
  loeschenThema: 'Could not delete the topic.',
  zusammenThema: 'Could not merge the topic.',
  umbenennenThema: 'Could not rename the topic.',
  verschiebenNotiz: 'Could not move the note.',
  aktualisierenThema: 'Could not update the topic.',
  nichtAblegen: 'Could not file the note.',
  leerAblegen: 'Write something to add.',
  leerSpeichern: 'Write something to save.',
  leerDatei: 'Write something to file.',
  notizUngueltig: 'The note text is missing or invalid.',
  notizLang: 'That note is too long.',
  themaUngueltig: 'The topic name is missing or invalid.',
  nichtsRueck: 'Nothing to undo.',
  nichtRueck: 'Could not undo.',
  schonWieder: 'That topic already exists again.',
  versionUngueltig: 'The version is missing or invalid.',
  nameEingeben: 'Enter a name.',
  nameBelegt: 'A topic with this name already exists.',
  nameReserviert: 'That name is reserved.',
  inboxGesperrt: 'Inbox cannot be changed.',
  anderesThema: 'Choose a different topic.',
  pfadTiefe: 'A path has at most three levels.',
  pfadLuecke: 'That path is missing a name.',
  platzhalter: 'Start typing\u2026',
  datei: 'File',
  strg: 'Ctrl',
  eingabe: 'Enter',
  gehtNach: 'Goes to ',
  neuKlammer: ' (new)',
  punktMitte: ' \u00b7 ',
  pfeil: ' > ',
  schliessen: 'Close',
  format: 'Format',
  lesen: 'Read',
  schreiben: 'Edit',
  aufSeite: 'On this page',
  notizAktionen: 'Note actions',
  themaAktionen: 'Topic actions',
  menueBibliothek: 'Library menu',
  aendern: 'Change',
  loeschen: 'Delete',
  umbenennen: 'Rename',
  zusammenfuehren: 'Merge into\u2026',
  themaLoeschen: 'Delete topic',
  notizenNachInbox: 'Its notes move to Inbox',
  themaUmbenennen: 'Rename topic',
  name: 'Name',
  speichern: 'Save',
  verschiebenTitel: 'Move note to',
  link: 'Link',
  adresse: 'Address',
  linkHinzufuegen: 'Add link',
  linkEingeben: 'Enter a link.',
  linkAnfang: 'https://',
  kuerzel: 'Convert shortcuts while typing',
  an: 'On',
  aus: 'Off',
  wichtigLesung: 'Wichtig',
  fett: 'Bold',
  kursiv: 'Italic',
  strich: 'Strikethrough',
  wichtigKnopf: 'Important',
  code: 'Code',
  ueberschrift: 'Heading',
  liste: 'Bulleted list',
  haken: 'Checklist',
  neuesThema: 'New topic',
  neueSeite: 'New page',
  neuerAbschnitt: 'New section',
  leereSeiten: '0 pages',
  unbenannt: 'Untitled',
  heute: 'Today',
  gestern: 'Yesterday',
  unbekannt: 'Unknown',
  letzteNotiz: 'Last note',
  letzteHeute: 'Last note today',
  letzteGestern: 'Last note yesterday',
  heuteKlein: 'today',
  gesternKlein: 'yesterday',
  unbekanntTag: 'on an unknown day',
  abgelegt: 'Filed',
  um: ' at ',
  via: ' via #',
  aktualisiert: 'CortX was updated',
  neuigkeiten: "What's new",
  rueckgaengig: 'Undo',
  oeffnen: 'Open',
  verwerfen: 'Dismiss',
  seiteGeloescht: 'Page deleted',
  notizGeloescht: 'Note deleted',
  offline: 'Filed offline \u00b7 syncs later',
  versionWort: 'Version',
  speicherWeg: 'Local storage is unavailable.',
  entwurfLesen: 'Could not read the draft.',
  entwurfSchreiben: 'Could not save the draft.',
  reiheLesen: 'Could not read the queue.',
  reiheSchreiben: 'Could not update the queue.',
  netzFehl: 'The network request failed.',
  themenLaden: 'Could not load topics.',
  nichtGefunden: 'Not found.',
} as const;

export const MONATE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function anfrageFehl(status: number): string {
  return `Request failed (${status}).`;
}

export function satzHinzugefuegt(ziel: string): string {
  return `Added to ${ziel}`;
}

export function satzThemaWeg(zitiert: string): string {
  return `${zitiert} deleted`;
}

export function satzThemaZusammen(zitiert: string, ziel: string): string {
  return `${zitiert} merged into ${ziel}`;
}

export function hinweisZusammen(anzahl: number, titel: string): string {
  if (anzahl === 0) return `${titel} is removed.`;
  if (anzahl === 1) return `The note moves there and ${titel} is removed.`;
  return `All ${anzahl} notes move there and ${titel} is removed.`;
}

export function meintest(name: string): string {
  return `Did you mean ${name}?`;
}

export function neuerName(art: string, name: string): string {
  return `${art} \u201C${name}\u201D`;
}

export function zusammenTitel(zitiert: string): string {
  return `Merge ${zitiert} into`;
}

export function versionsZeile(version: string): string {
  return `${TEXTE.versionWort} ${version}`;
}

export function ablageWann(label: string): string {
  if (label === TEXTE.heute) return TEXTE.heuteKlein;
  if (label === TEXTE.gestern) return TEXTE.gesternKlein;
  if (label === TEXTE.unbekannt) return TEXTE.unbekanntTag;
  return label;
}

export function ablageSatz(wann: string, zeit: string, viaThema: string | null): string {
  const uhr = zeit.length > 0 ? `${TEXTE.um}${zeit}` : '';
  const via = viaThema ? `${TEXTE.via}${viaThema}` : '';
  return `${TEXTE.abgelegt} ${wann}${uhr}${via}`;
}

export function letzteNotizZeile(label: string): string {
  if (label === TEXTE.unbekannt) return TEXTE.letzteNotiz;
  if (label === TEXTE.heute) return TEXTE.letzteHeute;
  if (label === TEXTE.gestern) return TEXTE.letzteGestern;
  return `${TEXTE.letzteNotiz} ${label}`;
}
