import fs from 'node:fs';
import { cookieFuer } from './anmelden.ts';
import { merkeSaat } from './schau.ts';

interface Lauf {
  url: string;
}

async function saee(url: string, cookie: string, thema: string, anzahl: number): Promise<void> {
  for (let index = 0; index < anzahl; index += 1) {
    const antwort = await fetch(`${url}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ text: `#${thema}\n${thema} note ${index}` }),
    });
    if (!antwort.ok) {
      throw new Error(`Seed ${thema} failed with ${antwort.status}.`);
    }
  }
}

export default async function globalSetup(): Promise<void> {
  const lauf = JSON.parse(fs.readFileSync('tmp-test/e2e-lauf.json', 'utf8')) as Lauf;
  fs.writeFileSync('tmp-test/e2e-server.json', JSON.stringify(lauf));
  fs.mkdirSync('tmp-test/screens', { recursive: true });
  const cookie = await cookieFuer(lauf.url);
  await saee(lauf.url, cookie, 'Work', 14);
  await saee(lauf.url, cookie, 'Workout', 6);
  merkeSaat();
}
