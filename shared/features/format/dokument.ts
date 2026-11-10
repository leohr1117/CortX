import { Node } from 'prosemirror-model';
import { modell } from './modell.ts';

export const DOKUMENT_SCHEMA_VERSION = 1;

function eigeneVersionEins(wert: object): boolean {
  if (!Object.hasOwn(wert, 'schema_version')) return false;
  const version = (wert as { schema_version?: unknown }).schema_version;
  return typeof version === 'number' && version === DOKUMENT_SCHEMA_VERSION;
}

export function pruefeDokument(eingabe: unknown): Node | null {
  if (eingabe === null || typeof eingabe !== 'object' || Array.isArray(eingabe)) return null;
  if (!eigeneVersionEins(eingabe)) return null;
  try {
    const knoten = Node.fromJSON(modell, eingabe);
    if (knoten.type !== modell.topNodeType) return null;
    knoten.check();
    return knoten;
  } catch {
    return null;
  }
}

export function packeDokument(doc: Node): Record<string, unknown> {
  const kopie = structuredClone(doc.toJSON()) as Record<string, unknown>;
  kopie.schema_version = DOKUMENT_SCHEMA_VERSION;
  return kopie;
}
