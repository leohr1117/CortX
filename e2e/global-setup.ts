import fs from 'node:fs';

interface Lauf {
  url: string;
}

async function saee(url: string, thema: string, anzahl: number): Promise<void> {
  for (let index = 0; index < anzahl; index += 1) {
    const antwort = await fetch(`${url}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `${thema} note ${index} #${thema}` }),
    });
    if (!antwort.ok) {
      throw new Error(`Seed ${thema} failed with ${antwort.status}.`);
    }
  }
}

export default async function globalSetup(): Promise<void> {
  const lauf = JSON.parse(fs.readFileSync('tmp-test/e2e-lauf.json', 'utf8')) as Lauf;
  fs.mkdirSync('tmp-test/screens', { recursive: true });
  await saee(lauf.url, 'Work', 14);
  await saee(lauf.url, 'Workout', 6);
}
