import { describe, expect, it, vi } from 'vitest';
import { importiere } from '../../../../shared/features/format/md.ts';
import { dateinameZumExport, markdownZumExport, teileOderLade } from './exportMarkdown.ts';

describe('exportMarkdown', () => {
  it('exports markdown through exportiere and names the file from the title', () => {
    const doc = importiere('Export title\n\nBody with **bold**.');
    expect(markdownZumExport(doc)).toBe('Export title\n\nBody with **bold**.');
    expect(dateinameZumExport(doc)).toBe('Export title.md');
  });

  it('does not download when share is aborted', async () => {
    const download = vi.fn();
    const abbruch = Object.assign(new Error('canceled'), { name: 'AbortError' });
    const ergebnis = await teileOderLade(
      'text',
      'note.md',
      {
        canShare: () => true,
        share: async () => {
          throw abbruch;
        },
      },
      download,
    );
    expect(ergebnis).toBe('abbruch');
    expect(download).not.toHaveBeenCalled();
  });

  it('falls back to a Blob download when share fails with a real error', async () => {
    const download = vi.fn();
    const ergebnis = await teileOderLade(
      'text',
      'note.md',
      {
        canShare: () => true,
        share: async () => {
          throw new Error('share failed');
        },
      },
      download,
    );
    expect(ergebnis).toBe('download');
    expect(download).toHaveBeenCalledTimes(1);
    const [blob, name] = download.mock.calls[0] as [Blob, string];
    expect(name).toBe('note.md');
    expect(blob.type).toBe('text/markdown;charset=utf-8');
    expect(await blob.text()).toBe('text');
  });

  it('downloads with a Blob when sharing is not supported', async () => {
    const download = vi.fn();
    const ohne = await teileOderLade('text', 'note.md', null, download);
    expect(ohne).toBe('download');
    const nein = await teileOderLade('text', 'note.md', { canShare: () => false, share: async () => undefined }, download);
    expect(nein).toBe('download');
    expect(download).toHaveBeenCalledTimes(2);
  });
});
