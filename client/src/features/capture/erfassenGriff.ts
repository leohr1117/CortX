import type { EditorView } from 'prosemirror-view';
import { haengeGriff } from '../format/modellGriff.ts';

export function haengeErfassenGriff(view: EditorView, wurzel: HTMLElement): void {
  haengeGriff(view);
  const cm = (view.dom as HTMLElement & { cm?: unknown }).cm;
  if (wurzel !== view.dom && cm) (wurzel as HTMLElement & { cm?: unknown }).cm = cm;
}
