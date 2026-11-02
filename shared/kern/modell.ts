export type NoteSource = 'tag' | 'ai' | 'manual';

export interface Thema {
  name: string;
  count: number;
}

export interface Notiz {
  id: number;
  text: string;
  created: string;
  topic: string;
  source: NoteSource;
  aiConfidence: number | null;
  version: number;
}
