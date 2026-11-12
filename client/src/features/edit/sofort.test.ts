import { describe, expect, it } from 'vitest';
import { exportiere } from '../../../../shared/features/format/md.ts';
import { pruefeDokument } from '../../../../shared/features/format/dokument.ts';
import { konfliktZusatz, TEXTE, TEXTE_DE } from '../../../../shared/kern/texte.ts';
import { standAusText } from './dokumentStand.ts';
import { haengeVerlassen, kopieDokument, kopieKnoten, nachBeacon, sollSofortSenden, type SofortLage } from './sofort.ts';

const WANN = new Date(2026, 10, 12, 0, 30);

function lage(extra: Partial<SofortLage> = {}): SofortLage {
  return {
    bereit: true,
    weg: false,
    konflikt: false,
    planOk: true,
    stand: standAusText('Sprint\n\nTyped just now'),
    basis: standAusText('Sprint\n\nSaved before'),
    ...extra,
  };
}

class Ziel extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible';
}

describe('saving when the page goes', () => {
  it('sends only a changed, valid text of a live page without conflict', () => {
    expect(sollSofortSenden(lage())).toBe(true);
    expect(sollSofortSenden(lage({ stand: standAusText('Sprint\n\nSaved before') }))).toBe(false);
    expect(sollSofortSenden(lage({ konflikt: true }))).toBe(false);
    expect(sollSofortSenden(lage({ weg: true }))).toBe(false);
    expect(sollSofortSenden(lage({ bereit: false }))).toBe(false);
    expect(sollSofortSenden(lage({ planOk: false }))).toBe(false);
  });

  it('takes the server state after a beacon only when it is the sent document', () => {
    const gesendet = standAusText('Sprint\n\nTyped just now');
    expect(nachBeacon(gesendet, standAusText('Sprint\n\nTyped just now'))).toBe('uebernehmen');
    expect(nachBeacon(gesendet, standAusText('Sprint\n\nChanged in another tab'))).toBe('konflikt');
  });

  it('listens to pagehide and to the page becoming hidden or visible again', () => {
    const dokument = new Ziel();
    const fenster = Object.assign(new EventTarget(), { document: dokument }) as unknown as Window;
    const ruf: string[] = [];
    const los = haengeVerlassen(fenster, () => ruf.push('weg'), () => ruf.push('zurueck'));
    fenster.dispatchEvent(new Event('pagehide'));
    dokument.visibilityState = 'hidden';
    dokument.dispatchEvent(new Event('visibilitychange'));
    dokument.visibilityState = 'visible';
    dokument.dispatchEvent(new Event('visibilitychange'));
    los();
    fenster.dispatchEvent(new Event('pagehide'));
    dokument.dispatchEvent(new Event('visibilitychange'));
    expect(ruf).toEqual(['weg', 'weg', 'zurueck']);
  });
});

describe('conflict copy', () => {
  it('writes the conflict note with local date and time in English and, resting, in German', () => {
    expect(konfliktZusatz(WANN)).toBe(' (Conflict \u00b7 12 Nov, 00:30)');
    expect(konfliktZusatz(WANN, 'de')).toBe(' (Konflikt \u00b7 12. Nov., 00:30)');
  });

  it('adds the note to the title line and keeps every other line as typed', () => {
    const stand = standAusText('\nSprint **plan**\n\n- one\n#home/Keys stays\n\nTyped elsewhere');
    const kopie = kopieKnoten(stand.knoten, WANN);
    expect(exportiere(kopie)).toBe('\nSprint **plan** (Conflict \u00b7 12 Nov, 00:30)\n\n- one\n#home/Keys stays\n\nTyped elsewhere');
    expect(kopie.childCount).toBe(stand.knoten.childCount);
    for (let index = 0; index < kopie.childCount; index += 1) {
      if (index === 1) continue;
      expect(kopie.child(index).eq(stand.knoten.child(index))).toBe(true);
    }
    expect(stand.knoten.eq(standAusText('\nSprint **plan**\n\n- one\n#home/Keys stays\n\nTyped elsewhere').knoten)).toBe(true);
  });

  it('packs a valid document for the server', () => {
    const doc = kopieDokument(standAusText('Einkauf\n\nMilch'), WANN, 'de');
    const knoten = pruefeDokument(doc);
    expect(knoten).not.toBeNull();
    expect(exportiere(knoten!)).toBe('Einkauf (Konflikt \u00b7 12. Nov., 00:30)\n\nMilch');
  });

  it('keeps the English hint honest and has a resting German text for every new key', () => {
    expect(TEXTE.seiteNeuGeladen).toBe('This note changed elsewhere. Your edits are kept on this device, not saved.');
    expect(TEXTE.alsKopie).toBe('Save as copy');
    for (const schluessel of Object.keys(TEXTE_DE) as Array<keyof typeof TEXTE_DE>) {
      expect(TEXTE_DE[schluessel].length).toBeGreaterThan(0);
      expect(TEXTE[schluessel].length).toBeGreaterThan(0);
    }
  });
});
