import { expect, type Page } from '@playwright/test';
import { LAGE } from '../client/src/ui/lage.ts';

interface Sicht {
  cm?: {
    focus: () => void;
    dispatch: (spec: object) => void;
    state: {
      doc: { length: number; toString: () => string };
      selection: { main: { head: number; anchor: number } };
    };
  };
}

function sicht(page: Page) {
  return page.locator('.schreib .ProseMirror');
}

export async function liesQuelle(page: Page): Promise<string> {
  return sicht(page).evaluate((el) => (el as unknown as Sicht).cm?.state.doc.toString() ?? '');
}

export async function erwarteQuelle(page: Page, text: string): Promise<void> {
  await expect.poll(() => liesQuelle(page)).toBe(text);
}

export async function cursorKopf(page: Page): Promise<number> {
  return sicht(page).evaluate((el) => (el as unknown as Sicht).cm?.state.selection.main.head ?? -1);
}

export async function setzeQuelle(page: Page, text: string): Promise<void> {
  await sicht(page).evaluate((el, wert: string) => {
    const cm = (el as unknown as Sicht).cm;
    if (!cm) return;
    cm.focus();
    cm.dispatch({
      changes: { from: 0, to: cm.state.doc.length, insert: wert },
      selection: { anchor: wert.length },
    });
  }, text);
  await erwarteQuelle(page, text);
}

export async function setzeAuswahl(page: Page, anchor: number, head: number): Promise<void> {
  await sicht(page).evaluate((el, wahl: { anchor: number; head: number }) => {
    const cm = (el as unknown as Sicht).cm;
    if (!cm) return;
    cm.focus();
    cm.dispatch({ selection: { anchor: wahl.anchor, head: wahl.head } });
  }, { anchor, head });
}

export async function setzeCursor(page: Page, index: number): Promise<void> {
  await setzeAuswahl(page, index, index);
}

export async function richteSicht(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const echt = window.visualViewport;
    if (!echt) return;
    let hoehe: number | null = null;
    let versatz: number | null = null;
    const ziel = new Proxy(echt, {
      get(target, prop, receiver) {
        if (prop === 'height') return hoehe ?? target.height;
        if (prop === 'offsetTop') return versatz ?? target.offsetTop;
        if (prop === 'pageTop') return (versatz ?? target.pageTop);
        const wert = Reflect.get(target, prop, receiver);
        return typeof wert === 'function' ? wert.bind(target) : wert;
      },
      set(target, prop, value, receiver) {
        return Reflect.set(target, prop, value, receiver);
      },
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => ziel });
    (window as unknown as { __setzeSicht?: (wert: { hoehe: number | null; versatz: number }) => void }).__setzeSicht = (wert) => {
      hoehe = wert.hoehe;
      versatz = wert.versatz;
      echt.dispatchEvent(new Event('resize'));
      echt.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    };
  });
}

export async function setzeSicht(page: Page, hoehe: number | null, versatz = 0): Promise<void> {
  await page.evaluate(
    ({ naechsteHoehe, naechsterVersatz }) => {
      const fenster = window as unknown as { __setzeSicht?: (wert: { hoehe: number | null; versatz: number }) => void };
      if (!fenster.__setzeSicht) throw new Error('Viewport hook is missing.');
      fenster.__setzeSicht({ hoehe: naechsteHoehe, versatz: naechsterVersatz });
    },
    { naechsteHoehe: hoehe, naechsterVersatz: versatz },
  );
}

export interface LeistenKante {
  unten: number;
  oben: number;
  sichtHoehe: number;
  fussOben: number | null;
  fileOben: number | null;
}

export async function leistenAbstand(page: Page): Promise<number> {
  return page.evaluate((schwelle: number) => {
    const leiste = document.querySelector('.format-leiste.mobil');
    if (!(leiste instanceof HTMLElement)) return 999;
    const rect = leiste.getBoundingClientRect();
    const sicht = window.visualViewport;
    const versatz = sicht?.offsetTop ?? 0;
    const hoehe = sicht?.height ?? window.innerHeight;
    const tastatur = Math.max(0, window.innerHeight - versatz - hoehe);
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.position = 'fixed';
    probe.style.left = '0';
    probe.style.bottom = '0';
    probe.style.width = '0';
    probe.style.height = 'env(safe-area-inset-bottom, 0px)';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    document.documentElement.appendChild(probe);
    const safe = probe.getBoundingClientRect().height;
    probe.remove();
    const ziel = versatz + hoehe - (tastatur >= schwelle ? 0 : safe);
    return Math.abs(rect.bottom - ziel);
  }, LAGE.tastaturSchwellePx);
}

export async function wische(page: Page, x: number, vonY: number, nachY: number): Promise<void> {
  const session = await page.context().newCDPSession(page);
  const punkt = (y: number) => ({ x: Math.round(x), y: Math.round(y), radiusX: 1, radiusY: 1, id: 1 });
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [punkt(vonY)] });
    const schritte = 12;
    for (let i = 1; i <= schritte; i += 1) {
      const y = vonY + ((nachY - vonY) * i) / schritte;
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [punkt(y)] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
}

export async function tippe(page: Page, x: number, y: number): Promise<void> {
  const session = await page.context().newCDPSession(page);
  const punkt = { x: Math.round(x), y: Math.round(y), radiusX: 1, radiusY: 1 };
  try {
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [punkt] });
    await new Promise((resolve) => setTimeout(resolve, 120));
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
}

export interface KantenMass {
  art: string;
  luecke: number;
  einzug: number;
  hoehe: number;
}

export async function listenKanten(page: Page): Promise<KantenMass[]> {
  return page.locator('.schreib .cm-punkt, .schreib .cm-nummer, .schreib .cm-nummerart').evaluateAll((zeilen) =>
    zeilen.map((zeile) => {
      const marker = zeile.querySelector('.cm-marker');
      const stil = getComputedStyle(zeile);
      const box = zeile.getBoundingClientRect();
      const rand = parseFloat(stil.borderLeftWidth) || 0;
      const einzug = parseFloat(stil.paddingLeft) || 0;
      const textLinks = box.left + rand + einzug;
      const rechts = marker ? marker.getBoundingClientRect().right : textLinks;
      return {
        art: zeile.className,
        luecke: Math.round((textLinks - rechts) * 10) / 10,
        einzug: Math.round(einzug * 10) / 10,
        hoehe: Math.round(box.height * 10) / 10,
      };
    }),
  );
}

export async function leseKanten(page: Page): Promise<KantenMass[]> {
  return page.locator('.lesetext li').evaluateAll((zeilen) =>
    zeilen.map((li) => {
      const stil = getComputedStyle(li);
      const before = getComputedStyle(li, '::before');
      const einzug = parseFloat(stil.paddingLeft) || 0;
      const links = parseFloat(before.left) || 0;
      const breite = parseFloat(before.width) || 0;
      const box = li.getBoundingClientRect();
      return {
        art: li.parentElement?.className ?? '',
        luecke: Math.round((einzug - links - breite) * 10) / 10,
        einzug: Math.round(einzug * 10) / 10,
        hoehe: Math.round(box.height * 10) / 10,
      };
    }),
  );
}

export async function absatzHoehe(page: Page): Promise<number> {
  return page.locator('.schreib .ProseMirror > p').evaluateAll((zeilen) => {
    const plain = zeilen.find(
      (zeile) =>
        !zeile.classList.contains('cm-punkt') &&
        !zeile.classList.contains('cm-nummer') &&
        !zeile.classList.contains('cm-nummerart'),
    );
    return plain ? Math.round(plain.getBoundingClientRect().height * 10) / 10 : -1;
  });
}

export async function hakenKante(page: Page): Promise<{ abstand: number; einzug: number; hoehe: number }> {
  return page.locator('.schreib .cm-haken').first().evaluate((haken) => {
    const zeile = haken.closest('.ProseMirror > *');
    const stil = getComputedStyle(haken);
    const zeilenStil = zeile ? getComputedStyle(zeile) : stil;
    const box = (zeile ?? haken).getBoundingClientRect();
    return {
      abstand: Math.round((parseFloat(stil.marginRight) || 0) * 10) / 10,
      einzug: Math.round((parseFloat(zeilenStil.paddingLeft) || 0) * 10) / 10,
      hoehe: Math.round(box.height * 10) / 10,
    };
  });
}

export async function leistenKante(page: Page): Promise<LeistenKante> {
  return page.getByRole('toolbar', { name: 'Format' }).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const sicht = window.visualViewport;
    const fuss = document.querySelector('footer.fuss');
    const file = document.querySelector('footer.fuss button');
    return {
      unten: rect.bottom,
      oben: rect.top,
      sichtHoehe: sicht?.height ?? window.innerHeight,
      fussOben: fuss ? fuss.getBoundingClientRect().top : null,
      fileOben: file ? file.getBoundingClientRect().top : null,
    };
  });
}
