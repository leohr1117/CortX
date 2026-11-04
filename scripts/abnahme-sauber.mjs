import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve('e2e/abnahme');
const ENDUNGEN = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const NAMEN = ['setzeQuelle', 'erwarteQuelle', 'liesQuelle'];
const CM = /\.cm(?!-marker-weg(?![A-Za-z0-9-]))(?!-placeholder(?![A-Za-z0-9-]))/g;
const SCHREIBT = [
  /\bdispatch\s*\(/,
  /\bexecCommand\s*\(/,
  /\binsertText\b/,
  /\btextContent\s*=(?!=)/,
  /\binnerHTML\s*=(?!=)/,
  /\binnerText\s*=(?!=)/,
  /\bsetContent\s*\(/,
];
const HAKEN_LIEST = new Set(['json', 'klartext']);

export function pruefeText(name, text) {
  const treffer = [];
  const zeile = (index) => text.slice(0, index).split(/\n/).length;
  for (const wort of NAMEN) {
    const re = new RegExp(`\\b${wort}\\b`, 'g');
    for (const fund of text.matchAll(re)) {
      treffer.push(`${name}:${zeile(fund.index)} ${wort}`);
    }
  }
  const cm = new RegExp(CM.source, 'g');
  for (const fund of text.matchAll(cm)) {
    treffer.push(`${name}:${zeile(fund.index)} .cm`);
  }
  for (const fund of text.matchAll(/\.evaluate(?:All)?\s*\(/g)) {
    const start = fund.index + fund[0].length - 1;
    const koerper = erstesArgument(text, start);
    const grund = schreibtEditor(koerper);
    if (grund) treffer.push(`${name}:${zeile(fund.index)} evaluate schreibt (${grund})`);
  }
  return treffer;
}

function schreibtEditor(koerper) {
  for (const re of SCHREIBT) {
    re.lastIndex = 0;
    if (re.test(koerper)) return re.source;
  }
  for (const fund of koerper.matchAll(/\b(?:haken|modell)\s*\?\.\s*(\w+)\s*\(|__cortxModell\s*\?\.\s*(\w+)\s*\(/g)) {
    const methode = fund[1] ?? fund[2];
    if (!HAKEN_LIEST.has(methode)) return methode;
  }
  return '';
}

function erstesArgument(text, klammerAuf) {
  let tiefe = 1;
  let anfuehrung = '';
  let flucht = false;
  const start = klammerAuf + 1;
  for (let i = start; i < text.length; i += 1) {
    const zeichen = text[i];
    if (anfuehrung) {
      if (flucht) flucht = false;
      else if (zeichen === '\\') flucht = true;
      else if (zeichen === anfuehrung) anfuehrung = '';
      continue;
    }
    if (zeichen === '"' || zeichen === "'" || zeichen === '`') {
      anfuehrung = zeichen;
      continue;
    }
    if (zeichen === '(' || zeichen === '{' || zeichen === '[') tiefe += 1;
    else if (zeichen === ')' || zeichen === '}' || zeichen === ']') {
      tiefe -= 1;
      if (tiefe === 0) return text.slice(start, i);
    } else if (zeichen === ',' && tiefe === 1) return text.slice(start, i);
  }
  return text.slice(start);
}

function dateien(ordner) {
  const liste = [];
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    const pfad = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) liste.push(...dateien(pfad));
    else if (ENDUNGEN.has(path.extname(eintrag.name))) liste.push(pfad);
  }
  return liste;
}

function main() {
  if (!fs.existsSync(WURZEL)) {
    console.error('fehlt: e2e/abnahme');
    return 1;
  }
  const treffer = [];
  for (const datei of dateien(WURZEL)) {
    const name = path.relative(process.cwd(), datei);
    treffer.push(...pruefeText(name, fs.readFileSync(datei, 'utf8')));
  }
  if (treffer.length > 0) {
    for (const zeile of treffer) console.error(zeile);
    return 1;
  }
  console.log('abnahme sauber');
  return 0;
}

const dieseDatei = path.resolve(fileURLToPath(import.meta.url));
if (process.argv[1] && path.resolve(process.argv[1]) === dieseDatei) {
  process.exit(main());
}
