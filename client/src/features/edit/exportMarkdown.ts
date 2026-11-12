import type { Node } from 'prosemirror-model';
import { exportiere } from '../../../../shared/features/format/md.ts';
import { titelAusKnoten } from '../../../../shared/features/seiten/knoten.ts';
import { exportDateiname } from '../../../../shared/features/seiten/exportDateiname.ts';

export type ExportErgebnis = 'geteilt' | 'abbruch' | 'download';

export type TeilenApi = {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

export function markdownZumExport(doc: Node): string {
  return exportiere(doc);
}

export function dateinameZumExport(doc: Node): string {
  return exportDateiname(titelAusKnoten(doc));
}

export function ladeBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const knopf = document.createElement('a');
  knopf.href = url;
  knopf.download = name;
  knopf.rel = 'noopener';
  document.body.append(knopf);
  knopf.click();
  knopf.remove();
  URL.revokeObjectURL(url);
}

function istAbbruch(grund: unknown): boolean {
  return grund instanceof Error && grund.name === 'AbortError';
}

export async function teileOderLade(
  markdown: string,
  dateiname: string,
  teilen: TeilenApi | null,
  download: (blob: Blob, name: string) => void,
): Promise<ExportErgebnis> {
  const datei = new File([markdown], dateiname, { type: 'text/markdown;charset=utf-8' });
  if (typeof teilen?.canShare === 'function' && teilen.canShare({ files: [datei] }) && typeof teilen.share === 'function') {
    try {
      await teilen.share({ files: [datei] });
      return 'geteilt';
    } catch (grund: unknown) {
      if (istAbbruch(grund)) return 'abbruch';
    }
  }
  download(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), dateiname);
  return 'download';
}
