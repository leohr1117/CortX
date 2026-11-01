import type { Notiz, Thema } from '../../../../shared/kern/modell.ts';

export async function ladeThemen(): Promise<Thema[]> {
  const antwort = await fetch('/api/topics');
  if (!antwort.ok) throw new Error('Could not load topics.');
  const daten = (await antwort.json()) as { topics: Thema[] };
  return daten.topics;
}

export async function legeNotizAb(text: string): Promise<Notiz> {
  const antwort = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!antwort.ok) throw new Error('Could not file the note.');
  return (await antwort.json()) as Notiz;
}
