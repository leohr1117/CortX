import { type Node } from 'prosemirror-model';

export function klartext(doc: Node): string {
  const zeilen: string[] = [];
  for (let index = 0; index < doc.childCount; index += 1) {
    zeilen.push(doc.child(index).textContent);
  }
  return zeilen.join('\n');
}
