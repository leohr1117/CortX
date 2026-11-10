import { describe, expect, it } from 'vitest';
import { packeDokument } from '../../../../shared/features/format/dokument.ts';
import { importiere } from '../../../../shared/features/format/md.ts';
import {
  baueEintrag,
  istDauerhaft,
  naechsteSeq,
  reihenfolge,
} from './warteschlange.ts';

describe('offline queue', () => {
  it('sends the queue in order', () => {
    const eins = packeDokument(importiere('one'));
    const zwei = packeDokument(importiere('two'));
    const a = baueEintrag(eins, 'a', 2, 't');
    const b = baueEintrag(zwei, 'b', 1, 't');
    const queue = [a, b];
    expect(reihenfolge(queue).map((eintrag) => eintrag.clientId)).toEqual(['b', 'a']);
    expect(a.doc).toEqual(eins);
    expect(b.doc).toEqual(zwei);
    expect(a).not.toHaveProperty('text');
    expect(b).not.toHaveProperty('text');
    expect(naechsteSeq(queue)).toBe(3);
    expect(naechsteSeq([])).toBe(1);
  });

  it('retries a network failure and a signed-out request, and stops on a rejected note', () => {
    expect(istDauerhaft(null)).toBe(false);
    expect(istDauerhaft(500)).toBe(false);
    expect(istDauerhaft(408)).toBe(false);
    expect(istDauerhaft(429)).toBe(false);
    expect(istDauerhaft(401)).toBe(false);
    expect(istDauerhaft(400)).toBe(true);
    expect(istDauerhaft(404)).toBe(true);
  });
});
