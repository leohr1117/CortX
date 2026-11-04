import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { meldeAn } from './anmelden.ts';
import { absatzHoehe, erwarteQuelle, hakenKante, leseKanten, listenKanten, setzeAuswahl, setzeQuelle } from './feld.ts';
import { leereLokal, warteBereit } from './lokal.ts';
import { setzeSchauspiel, sichereBestand, stelleBestand } from './schau.ts';

const BILDER = 'tmp-test/screens';

const FAELLE = [
  { name: 'zahl', text: '1. milk', danach: '1. milk\n2. ', klasse: '', marker: ['1.', '2.'] },
  { name: 'gross', text: 'A. milk', danach: 'A. milk\nB. ', klasse: 'gross', marker: ['A.', 'B.'] },
  { name: 'klein', text: 'a. milk', danach: 'a. milk\nb. ', klasse: 'klein', marker: ['a.', 'b.'] },
  { name: 'roemisch', text: 'I. milk', danach: 'I. milk\nII. ', klasse: 'roemisch', marker: ['I.', 'II.'] },
  { name: 'roemisch-klein', text: 'i. milk', danach: 'i. milk\nii. ', klasse: 'roemisch-klein', marker: ['i.', 'ii.'] },
] as const;

function versatz(): string {
  const jetzt = new Date();
  return new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), 9, 12, 0, 0).toISOString();
}

async function imEditor(page: Page, text: string): Promise<void> {
  setzeSchauspiel([{ name: 'Work', notizen: [{ text, created: versatz() }] }]);
  await page.goto('/library/topic?name=Work');
  await page.locator('.notiz').first().locator('a.tx').click();
  await expect(page).toHaveURL(/\/library\/note\?id=\d+/);
  await page.getByRole('button', { name: 'Edit' }).click();
  await erwarteQuelle(page, text);
}

async function marker(page: Page): Promise<string[]> {
  return page.locator('.schreib .cm-marker').evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
}

test.beforeAll(() => {
  fs.mkdirSync(BILDER, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await meldeAn(page);
  await leereLokal(page);
});

test('enter counts a numbered list and reload keeps the kind', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const bestand = sichereBestand();
  const handy = testInfo.project.name === 'handy';
  try {
    for (const fall of FAELLE) {
      await imEditor(page, fall.text);
      await page.keyboard.press('Enter');
      await erwarteQuelle(page, fall.danach);
      if (fall.klasse === '') await expect(page.locator('.schreib .cm-marker.nummer')).toHaveCount(2);
      else await expect.poll(() => marker(page)).toEqual([...fall.marker]);
      await expect.poll(() => sichereBestand().notes.some((eintrag) => eintrag.text === fall.danach)).toBe(true);
      if (handy) await page.screenshot({ path: `${BILDER}/handy-nummer-${fall.name}.png`, fullPage: true });
      await page.reload();
      await warteBereit(page);
      const liste = page.locator(fall.klasse ? `.lesetext ol.${fall.klasse}` : '.lesetext ol');
      await expect(liste).toBeVisible();
      await expect(liste.locator('li')).toHaveCount(2);
      await expect(liste.locator('li').first()).toHaveText('milk');
      await page.getByRole('button', { name: 'Edit' }).click();
      await erwarteQuelle(page, fall.danach);
      if (fall.klasse === '') await expect(page.locator('.schreib .cm-marker.nummer')).toHaveCount(2);
      else await expect.poll(() => marker(page)).toEqual([...fall.marker]);
    }
  } finally {
    stelleBestand(bestand);
  }
});

test('pasted markdown becomes a numbered list at once', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const bestand = sichereBestand();
  const handy = testInfo.project.name === 'handy';
  try {
    for (const fall of FAELLE) {
      await imEditor(page, 'Start');
      await setzeQuelle(page, '');
      await page.getByRole('textbox', { name: 'Note' }).evaluate((el, text: string) => {
        const data = new DataTransfer();
        data.setData('text/plain', text);
        const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', { value: data });
        el.dispatchEvent(event);
      }, fall.text);
      await erwarteQuelle(page, fall.text);
      if (fall.klasse === '') await expect(page.locator('.schreib .cm-marker.nummer')).toHaveCount(1);
      else await expect.poll(() => marker(page)).toEqual([fall.marker[0]]);
      const inhalt = await page.locator('.schreib .cm-marker').evaluateAll((els) =>
        els.map((el) => el.nextElementSibling?.textContent ?? ''),
      );
      expect(inhalt).toEqual(['milk']);
      await expect.poll(() => sichereBestand().notes.some((eintrag) => eintrag.text === fall.text)).toBe(true);
      if (handy) await page.screenshot({ path: `${BILDER}/handy-nummer-einfuegen-${fall.name}.png`, fullPage: true });
    }
  } finally {
    stelleBestand(bestand);
  }
});

const WECHSEL = [
  { name: 'gross', start: '1. milk\n* bread', label: 'Numbered list, A.', text: 'A. milk\n* bread', klasse: 'gross', marker: 'A.' },
  { name: 'klein', start: '1. milk\n* bread', label: 'Numbered list, a.', text: 'a. milk\n* bread', klasse: 'klein', marker: 'a.' },
  { name: 'roemisch', start: '1. milk\n* bread', label: 'Numbered list, I.', text: 'I. milk\n* bread', klasse: 'roemisch', marker: 'I.' },
  { name: 'roemisch-klein', start: '1. milk\n* bread', label: 'Numbered list, i.', text: 'i. milk\n* bread', klasse: 'roemisch-klein', marker: 'i.' },
  { name: 'zahl', start: 'A. milk\n* bread', label: 'Numbered list, 1.', text: '1. milk\n* bread', klasse: '', marker: '' },
] as const;

async function inhalt(page: Page): Promise<string[]> {
  return page.locator('.schreib .cm-marker').evaluateAll((els) => els.map((el) => el.nextElementSibling?.textContent ?? ''));
}

async function artKnopf(page: Page, name: string): Promise<void> {
  const knopf = page.getByRole('button', { name, exact: true });
  await knopf.scrollIntoViewIfNeeded();
  await knopf.click();
}

test('the bar replaces the list marker for each kind', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const bestand = sichereBestand();
  const handy = testInfo.project.name === 'handy';
  try {
    for (const fall of WECHSEL) {
      await imEditor(page, fall.start);
      await setzeAuswahl(page, 3, 4);
      await artKnopf(page, fall.label);
      await erwarteQuelle(page, fall.text);
      await expect.poll(() => sichereBestand().notes.some((eintrag) => eintrag.text === fall.text)).toBe(true);
      expect(await inhalt(page)).toEqual(['milk', 'bread']);
      if (fall.marker === '') {
        await expect(page.locator('.schreib .cm-marker.nummer')).toHaveCount(1);
        await expect(page.locator('.schreib .cm-marker.punkt')).toHaveCount(1);
      } else await expect.poll(() => marker(page)).toEqual([fall.marker, '']);
      const breite = handy ? 'handy' : 'desktop';
      await page.screenshot({ path: `${BILDER}/${breite}-nummer-wechsel-${fall.name}.png`, fullPage: true });
      await page.reload();
      await warteBereit(page);
      const liste = page.locator(fall.klasse ? `.lesetext ol.${fall.klasse}` : '.lesetext ol');
      await expect(liste).toBeVisible();
      await expect(liste.locator('li')).toHaveCount(1);
      await expect(liste.locator('li').first()).toHaveText('milk');
      await expect(page.locator('.lesetext ul li')).toHaveText('bread');
      await page.getByRole('button', { name: 'Edit' }).click();
      await erwarteQuelle(page, fall.text);
    }
  } finally {
    stelleBestand(bestand);
  }
});

test('the bar switches a numbered line to a list, a task, and text', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const bestand = sichereBestand();
  const handy = testInfo.project.name === 'handy';
  try {
    await imEditor(page, '1. milk\n* bread');
    await setzeAuswahl(page, 3, 4);
    await artKnopf(page, 'Bulleted list');
    await erwarteQuelle(page, '- milk\n* bread');
    expect(await inhalt(page)).toEqual(['milk', 'bread']);
    await artKnopf(page, 'Checklist');
    await erwarteQuelle(page, '[] milk\n* bread');
    expect(await inhalt(page)).toEqual(['milk', 'bread']);
    await artKnopf(page, 'Numbered list, A.');
    await erwarteQuelle(page, 'A. milk\n* bread');
    expect(await inhalt(page)).toEqual(['milk', 'bread']);
    await artKnopf(page, 'Numbered list, A.');
    await erwarteQuelle(page, 'milk\n* bread');
    const breite = handy ? 'handy' : 'desktop';
    await page.screenshot({ path: `${BILDER}/${breite}-nummer-wechsel-text.png`, fullPage: true });
  } finally {
    stelleBestand(bestand);
  }
});

test('list markers keep the same gap as the reading view', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const bestand = sichereBestand();
  const handy = testInfo.project.name === 'handy';
  const text = ['plain', '- milk', '1. milk', 'A. milk', 'a. milk', 'I. milk', 'i. milk', '[] task'].join('\n');
  try {
    await imEditor(page, text);
    const editor = await listenKanten(page);
    const plain = await absatzHoehe(page);
    const haken = await hakenKante(page);
    expect(editor.map((zeile) => zeile.einzug)).toEqual([16, 28, 34, 34, 34, 34]);
    expect(editor[0]?.luecke).toBeGreaterThan(8);
    expect(editor[0]?.luecke).toBeLessThan(10);
    for (const zeile of editor) {
      expect(zeile.luecke).toBeGreaterThan(4);
      expect(Math.abs(zeile.hoehe - plain)).toBeLessThan(1.5);
    }
    expect(haken.einzug).toBe(0);
    expect(haken.abstand).toBe(8);
    expect(Math.abs(haken.hoehe - plain)).toBeLessThan(1.5);
    if (handy) await page.screenshot({ path: `${BILDER}/handy-listenabstand-editor.png`, fullPage: true });
    await page.reload();
    await warteBereit(page);
    const lese = await leseKanten(page);
    expect(lese.map((zeile) => zeile.einzug)).toEqual([16, 28, 34, 34, 34, 34]);
    expect(lese[0]?.luecke).toBeGreaterThan(8);
    expect(lese[0]?.luecke).toBeLessThan(10);
    expect(Math.abs((lese[0]?.luecke ?? 0) - (editor[0]?.luecke ?? 0))).toBeLessThan(1);
    if (handy) await page.screenshot({ path: `${BILDER}/handy-listenabstand-lesen.png`, fullPage: true });
  } finally {
    stelleBestand(bestand);
  }
});
