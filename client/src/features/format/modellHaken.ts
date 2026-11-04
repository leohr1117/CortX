import type { Node } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

export interface ModellLeser {
  json: () => unknown;
  klartext: () => string;
}

type HakenFenster = Window & { __cortxModell?: ModellLeser; __CORTX_TEST?: string };

const leserVon = new WeakMap<EditorView, ModellLeser>();

function testlauf(): boolean {
  if (typeof window !== 'undefined' && (window as HakenFenster).__CORTX_TEST === '1') return true;
  const prozess = (globalThis as { process?: { env?: { CORTX_TEST?: string } } }).process;
  return prozess?.env?.CORTX_TEST === '1';
}

export function klartextVon(doc: Node): string {
  if (doc.childCount === 0) return '';
  const zeilen: string[] = [];
  for (let i = 0; i < doc.childCount; i += 1) zeilen.push(doc.child(i).textContent);
  return zeilen.join('\n');
}

export function haengeModell(view: EditorView): void {
  if (!testlauf()) return;
  const leser: ModellLeser = {
    json: () => view.state.doc.toJSON(),
    klartext: () => klartextVon(view.state.doc),
  };
  leserVon.set(view, leser);
  (window as HakenFenster).__cortxModell = leser;
}

export function loeseModell(view: EditorView): void {
  const leser = leserVon.get(view);
  if (!leser) return;
  leserVon.delete(view);
  const fenster = window as HakenFenster;
  if (fenster.__cortxModell === leser) delete fenster.__cortxModell;
}
