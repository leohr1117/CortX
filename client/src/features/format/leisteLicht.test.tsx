import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { ART } from '../../../../shared/features/format/baum.ts';
import { formatVon } from '../../../../shared/features/format/register.ts';
import { entferneFormatierung } from '../../../../shared/features/format/modellbefehl.ts';
import { speichere } from '../../../../shared/features/format/speichern.ts';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import {
  arten,
  druecke,
  entferneLeistenPruef,
  fundPos,
  gepresst,
  knopf,
  markenVon,
  oeffne,
  richteLeistenPruef,
  setzeKomposition,
  taste,
  waehleWoerter,
  wichtigTaste,
  zu,
} from './leisteSitz.ts';
beforeAll(async () => {
  await richteLeistenPruef();
});
afterAll(() => {
  entferneLeistenPruef();
});
describe('format bar on the model editor', () => {
  it('lights inline buttons only when the whole selection has the format', async () => {
    const faelle = [
      [TEXTE.kursiv, ART.kursiv],
      [TEXTE.strich, 'strich'],
      [TEXTE.code, ART.code],
      [TEXTE.wichtigKnopf, ART.wichtig],
    ] as const;
    for (const [label, id] of faelle) {
      const sitz = await oeffne('aa bb', () => undefined);
      try {
        expect(gepresst(sitz.host, label)).toBe('false');
        await waehleWoerter(sitz, 'aa', 'aa', 2);
        await druecke(sitz.host, label);
        expect(markenVon(sitz.view, 'aa')).toContain(id);
        expect(gepresst(sitz.host, label)).toBe('true');
        expect(gepresst(sitz.host, label)).not.toBe('mixed');
        await waehleWoerter(sitz, 'aa', 'bb', 3);
        expect(gepresst(sitz.host, label)).toBe('false');
        await waehleWoerter(sitz, 'aa', 'aa', 4);
        expect(gepresst(sitz.host, label)).toBe('true');
        await druecke(sitz.host, label);
        expect(markenVon(sitz.view, 'aa')).not.toContain(id);
        expect(gepresst(sitz.host, label)).toBe('false');
        expect(sitz.view.state.doc.textContent).toBe('aa bb');
      } finally {
        await zu(sitz);
      }
    }
  });
  it('lights Heading for a heading line and not for a mixed line selection', async () => {
    const sitz = await oeffne('aa\nbb', () => undefined);
    try {
      expect(gepresst(sitz.host, TEXTE.ueberschrift)).toBe('false');
      await druecke(sitz.host, TEXTE.ueberschrift);
      expect(arten(sitz.view)).toEqual(['ueberschrift', 'ueberschrift']);
      expect(gepresst(sitz.host, TEXTE.ueberschrift)).toBe('true');
      await waehleWoerter(sitz, 'bb', 'bb', 2);
      await druecke(sitz.host, TEXTE.ueberschrift);
      await waehleWoerter(sitz, 'aa', 'bb', 3);
      expect(gepresst(sitz.host, TEXTE.ueberschrift)).toBe('false');
      await waehleWoerter(sitz, 'aa', 'aa', 4);
      expect(gepresst(sitz.host, TEXTE.ueberschrift)).toBe('true');
      expect(sitz.view.state.doc.textContent).toBe('aabb');
    } finally {
      await zu(sitz);
    }
  });
  it('lights Code for a whole code block and not for a mixed block selection', async () => {
    const sitz = await oeffne('aa\nbb\ncc', () => undefined);
    try {
      await waehleWoerter(sitz, 'aa', 'bb', 2);
      expect(gepresst(sitz.host, TEXTE.code)).toBe('false');
      await druecke(sitz.host, TEXTE.code);
      await waehleWoerter(sitz, 'aa', 'cc', 3);
      expect(gepresst(sitz.host, TEXTE.code)).toBe('false');
      expect(gepresst(sitz.host, TEXTE.code)).not.toBe('mixed');
      await waehleWoerter(sitz, 'aa', 'bb', 4);
      expect(gepresst(sitz.host, TEXTE.code)).toBe('true');
      expect(sitz.view.state.doc.textContent).toContain('aa');
      expect(sitz.view.state.doc.textContent).toContain('cc');
      for (const name of [TEXTE.fett, TEXTE.kursiv, TEXTE.strich, TEXTE.wichtigKnopf, TEXTE.link]) {
        expect(knopf(sitz.host, name).getAttribute('aria-disabled')).toBe('true');
      }
    } finally {
      await zu(sitz);
    }
  });
  it('lights Important for every selected important line and keeps a one-line selection inline', async () => {
    const sitz = await oeffne('aa\nbb', () => undefined);
    try {
      await druecke(sitz.host, TEXTE.wichtigKnopf);
      expect(arten(sitz.view)).toEqual(['wichtigZeile', 'wichtigZeile']);
      expect(gepresst(sitz.host, TEXTE.wichtigKnopf)).toBe('true');
      expect(sitz.view.state.doc.textContent).toBe('aabb');
    } finally {
      await zu(sitz);
    }
    const gemischt = await oeffne('!!!! aa\nbb', () => undefined);
    try {
      expect(gepresst(gemischt.host, TEXTE.wichtigKnopf)).toBe('false');
      await waehleWoerter(gemischt, 'aa', 'aa', 2);
      expect(gepresst(gemischt.host, TEXTE.wichtigKnopf)).toBe('false');
      await druecke(gemischt.host, TEXTE.wichtigKnopf);
      expect(markenVon(gemischt.view, 'aa')).toContain(ART.wichtig);
      expect(gemischt.view.state.doc.child(0).type.name).toBe('wichtigZeile');
      expect(gepresst(gemischt.host, TEXTE.wichtigKnopf)).toBe('true');
      expect(gemischt.view.state.doc.textContent).toContain('aa');
    } finally {
      await zu(gemischt);
    }
  });
  it('keeps bold, italic, strike, important, and link inert in a code block and enables them again', async () => {
    let links = 0;
    const sitz = await oeffne('aa\nbb\ncc', () => undefined, {
      onLink: () => { links += 1; },
      onZiel: () => { links += 1; },
    });
    const gesperrt = [TEXTE.fett, TEXTE.kursiv, TEXTE.strich, TEXTE.wichtigKnopf, TEXTE.link];
    try {
      expect(formatVon(ART.wichtig).knopf?.taste).toBe('Mod-!');
      await druecke(sitz.host, TEXTE.code);
      expect(arten(sitz.view).every((art) => art === 'codeblock')).toBe(true);
      const imCode = fundPos(sitz.view, 'aa') + 1;
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(sitz.view.state.doc, imCode)));
      });
      await sitz.zeige(2);
      const cursor = sitz.view.state;
      expect(cursor.selection.empty).toBe(true);
      expect(taste(sitz.view, 'b', 66)).toBe(true);
      expect(taste(sitz.view, 'k', 75)).toBe(true);
      expect(wichtigTaste(sitz.view)).toBe(true);
      expect(sitz.view.state).toBe(cursor);
      expect(sitz.view.state.storedMarks ?? []).toEqual([]);
      expect(links).toBe(0);
      await waehleWoerter(sitz, 'aa', 'cc', 3);
      const gewaehlt = sitz.view.state;
      expect(taste(sitz.view, 'b', 66)).toBe(true);
      expect(taste(sitz.view, 'i', 73)).toBe(true);
      expect(taste(sitz.view, 'x', 88, true)).toBe(true);
      expect(taste(sitz.view, 'k', 75)).toBe(true);
      expect(wichtigTaste(sitz.view)).toBe(true);
      expect(sitz.view.state).toBe(gewaehlt);
      expect(links).toBe(0);
      const dokument = speichere(sitz.view.state.doc);
      for (const name of gesperrt) {
        const el = knopf(sitz.host, name);
        expect(el.getAttribute('aria-disabled')).toBe('true');
        expect(el.hasAttribute('disabled')).toBe(false);
        expect(el.getAttribute('tabindex')).not.toBe('-1');
        el.focus();
        expect(el.ownerDocument?.activeElement).toBe(el);
        await druecke(sitz.host, name);
        expect(speichere(sitz.view.state.doc)).toBe(dokument);
      }
      expect(links).toBe(0);
      expect(knopf(sitz.host, TEXTE.code).getAttribute('aria-disabled')).not.toBe('true');
      expect(knopf(sitz.host, TEXTE.ueberschrift).getAttribute('aria-disabled')).not.toBe('true');
      expect(knopf(sitz.host, TEXTE.liste).getAttribute('aria-disabled')).not.toBe('true');
      expect(knopf(sitz.host, TEXTE.haken).getAttribute('aria-disabled')).not.toBe('true');
      const frei = entferneFormatierung(sitz.view.state);
      expect(frei).not.toBe(sitz.view.state);
      frei.doc.forEach((node) => expect(node.type.name).toBe('codeblock'));
      await druecke(sitz.host, TEXTE.code);
      expect(arten(sitz.view).every((art) => art === 'absatz')).toBe(true);
      expect(sitz.view.state.doc.textContent).toContain('aa');
      expect(sitz.view.state.doc.textContent).toContain('cc');
      await waehleWoerter(sitz, 'aa', 'cc', 4);
      for (const name of gesperrt) expect(knopf(sitz.host, name).hasAttribute('aria-disabled')).toBe(false);
      await druecke(sitz.host, TEXTE.fett);
      expect(speichere(sitz.view.state.doc)).toContain('**');
      expect(sitz.view.state.doc.textContent).toContain('aa');
      const freiPos = fundPos(sitz.view, 'bb');
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(sitz.view.state.doc, freiPos)));
      });
      expect(wichtigTaste(sitz.view)).toBe(true);
      expect(arten(sitz.view).some((art) => art === 'wichtigZeile')).toBe(true);
    } finally {
      await zu(sitz);
    }
  });
  it('toggles important from the german shift-1 key and ignores other modifiers', async () => {
    const sitz = await oeffne('Milch', () => undefined);
    try {
      const mac = typeof navigator !== 'undefined' && /Mac|iP(hone|[oa]d)/.test(navigator.platform);
      const wichtig = knopf(sitz.host, TEXTE.wichtigKnopf);
      expect(wichtig.getAttribute('aria-keyshortcuts')).toBe(mac ? 'Meta+Shift+1' : 'Control+Shift+1');
      expect(wichtig.getAttribute('title')).toBe(
        mac ? `${TEXTE.wichtigKnopf} (Cmd+Shift+1)` : `${TEXTE.wichtigKnopf} (Ctrl+Shift+1)`,
      );
      expect(knopf(sitz.host, TEXTE.fett).getAttribute('aria-keyshortcuts')).toBe(mac ? 'Meta+B' : 'Control+B');
      expect(knopf(sitz.host, TEXTE.strich).getAttribute('aria-keyshortcuts')).toBe(
        mac ? 'Meta+Shift+X' : 'Control+Shift+X',
      );
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(sitz.view.state.doc, 1)));
      });
      await sitz.zeige(2);
      expect(sitz.view.state.selection.empty).toBe(true);
      expect(arten(sitz.view)).toEqual(['absatz']);
      expect(taste(sitz.view, '1', 49, true, { code: 'Digit1' })).toBe(true);
      expect(arten(sitz.view)).toEqual(['wichtigZeile']);
      expect(sitz.view.state.doc.textContent).toBe('Milch');
      expect(taste(sitz.view, 'z', 90)).toBe(true);
      expect(arten(sitz.view)).toEqual(['absatz']);
      expect(wichtigTaste(sitz.view, { alt: true })).toBe(false);
      expect(wichtigTaste(sitz.view, { alt: true, ctrl: true })).toBe(false);
      expect(wichtigTaste(sitz.view, { ctrl: false })).toBe(false);
      expect(arten(sitz.view)).toEqual(['absatz']);
      expect(sitz.view.state.doc.textContent).toBe('Milch');
      const feld = document.createElement('input');
      document.body.appendChild(feld);
      expect(wichtigTaste(sitz.view, { ziel: feld })).toBe(false);
      feld.remove();
      expect(arten(sitz.view)).toEqual(['absatz']);
      setzeKomposition(sitz.view, true);
      const still = sitz.view.state;
      expect(wichtigTaste(sitz.view)).toBe(false);
      expect(sitz.view.state).toBe(still);
      setzeKomposition(sitz.view, false);
      expect(wichtigTaste(sitz.view)).toBe(true);
      expect(arten(sitz.view)).toEqual(['wichtigZeile']);
      expect(sitz.view.state.doc.textContent).toBe('Milch');
      expect(taste(sitz.view, 'z', 90)).toBe(true);
      expect(arten(sitz.view)).toEqual(['absatz']);
      expect(taste(sitz.view, 'y', 89)).toBe(true);
      expect(arten(sitz.view)).toEqual(['wichtigZeile']);
      await act(async () => {
        sitz.view.dispatch(sitz.view.state.tr.setSelection(TextSelection.create(sitz.view.state.doc, 1)));
      });
      expect(wichtigTaste(sitz.view)).toBe(true);
      expect(arten(sitz.view)).toEqual(['absatz']);
      await waehleWoerter(sitz, 'Milch', 'Milch', 3);
      expect(wichtigTaste(sitz.view)).toBe(true);
      await sitz.zeige(4);
      expect(markenVon(sitz.view, 'Milch')).toContain(ART.wichtig);
      expect(arten(sitz.view)).toEqual(['absatz']);
      expect(gepresst(sitz.host, TEXTE.wichtigKnopf)).toBe('true');
      expect(wichtigTaste(sitz.view)).toBe(true);
      await sitz.zeige(5);
      expect(markenVon(sitz.view, 'Milch')).not.toContain(ART.wichtig);
      expect(gepresst(sitz.host, TEXTE.wichtigKnopf)).toBe('false');
      expect(taste(sitz.view, 'z', 90)).toBe(true);
      expect(markenVon(sitz.view, 'Milch')).toContain(ART.wichtig);
      expect(taste(sitz.view, 'y', 89)).toBe(true);
      expect(markenVon(sitz.view, 'Milch')).not.toContain(ART.wichtig);
      expect(sitz.view.state.doc.textContent).toBe('Milch');
    } finally {
      await zu(sitz);
    }
  });
});
