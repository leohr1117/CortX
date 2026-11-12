import { type Page } from '@playwright/test';
import { expect, test } from '../saat-fix.ts';
import { FELD,
  blockText,
  editorJson,
  erwarteBasisbild,
  erwarteStil,
  invarianten,
  knopfKlick,
  sichtbar,
  tippeTasten,
  waehleSichtbar,
  waehleSichtbarenText,
} from './hilfen.ts';
import { oeffneFeld } from './feldOeffnen.ts';
test.beforeEach(({ }, testInfo) => {
  testInfo.skip(testInfo.project.name !== 'abnahme-desktop', 'nur bei 1440 px');
});
const KNOEPFE = [
  ['Bold', 'fett'],
  ['Italic', 'kursiv'],
  ['Strikethrough', 'strich'],
  ['Code', 'mono'],
  ['Important', 'wichtig'],
  ['Heading', 'kopf'],
] as const;
const OHNE_TASTE: Record<string, string> = {
  Bold: 'Control+b',
  Italic: 'Control+i',
  Strikethrough: 'Control+Shift+X',
  Code: 'Control+e',
  Heading: 'Control+Shift+H',
};
const CODE_GESPERRT = ['Bold', 'Italic', 'Strikethrough', 'Important', 'Link'] as const;
const WICHTIG_TASTE = 'Control+Shift+Digit1';
const CODE_TASTE: Partial<Record<(typeof CODE_GESPERRT)[number], string>> = {
  Bold: 'Control+b',
  Italic: 'Control+i',
  Strikethrough: 'Control+Shift+X',
  Important: WICHTIG_TASTE,
  Link: 'Control+k',
};
function formatKnopf(page: Page, name: string) {
  return page.getByRole('toolbar', { name: 'Format' }).getByRole('button', { name, exact: true });
}
interface SichtSpanne {
  von: number;
  bis: number;
  text: string;
  ganz: string;
}
async function sichtSpanne(page: Page): Promise<SichtSpanne> {
  return page.evaluate((sel) => {
    const pm = document.querySelector(sel);
    const auswahl = getSelection();
    const leer = { von: -1, bis: -1, text: '', ganz: '' };
    if (!pm || !auswahl || auswahl.rangeCount < 1) return leer;
    type Stelle = { node: Text; index: number } | 'nl';
    const stellen: Stelle[] = [];
    [...pm.children].forEach((block, index, bloecke) => {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode(knoten) {
          const eltern = (knoten as Text).parentElement?.closest('.cm-marker-weg,.cm-placeholder,[contenteditable=false]');
          return eltern ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        },
      });
      let knoten = walker.nextNode();
      while (knoten) {
        const text = knoten as Text;
        for (let i = 0; i < text.data.length; i += 1) stellen.push({ node: text, index: i });
        knoten = walker.nextNode();
      }
      if (index < bloecke.length - 1) stellen.push('nl');
    });
    const ganz = stellen.map((eintrag) => (eintrag === 'nl' ? '\n' : eintrag.node.data[eintrag.index] ?? '')).join('');
    const bei = (node: Node, offset: number): number => {
      if (node.nodeType !== Node.TEXT_NODE) return -1;
      const direkt = stellen.findIndex((eintrag) => eintrag !== 'nl' && eintrag.node === node && eintrag.index === offset);
      if (direkt >= 0) return direkt;
      const davor = stellen.findIndex((eintrag) => eintrag !== 'nl' && eintrag.node === node && eintrag.index === offset - 1);
      return davor >= 0 ? davor + 1 : -1;
    };
    const range = auswahl.getRangeAt(0);
    let von = bei(range.startContainer, range.startOffset);
    let bis = bei(range.endContainer, range.endOffset);
    if (von < 0 || bis < von) {
      von = bei(range.endContainer, range.endOffset);
      bis = bei(range.startContainer, range.startOffset);
    }
    if (von < 0 || bis < von) return { ...leer, ganz };
    return { von, bis, text: ganz.slice(von, bis), ganz };
  }, FELD);
}
type ModellJson = { type?: string; text?: string; content?: ModellJson[] };
function knotenTexte(doc: ModellJson): { art: string; text: string }[] {
  return (doc.content ?? []).map((knoten) => ({
    art: knoten.type ?? '',
    text: (knoten.content ?? []).map((teil) => teil.text ?? '').join(''),
  }));
}
async function gleicheCodeSpanne(page: Page, text: string): Promise<SichtSpanne> {
  await waehleSichtbarenText(page, 'aa', 'cc dd');
  const spanne = await sichtSpanne(page);
  expect(spanne.text).toBe(text);
  expect(spanne.von).toBe(spanne.ganz.indexOf('aa'));
  expect(spanne.bis).toBe(spanne.ganz.indexOf('cc dd') + 'cc dd'.length);
  expect(spanne.bis).toBeGreaterThan(spanne.von);
  return spanne;
}
async function codeblockSperre(page: Page, text: string): Promise<void> {
  const vorher = await editorJson(page);
  for (const name of CODE_GESPERRT) {
    await gleicheCodeSpanne(page, text);
    const knopf = formatKnopf(page, name);
    await expect(knopf).toBeVisible();
    await expect(knopf).toHaveAttribute('aria-disabled', 'true');
    const fokus = await knopf.evaluate((el) => {
      if (!(el instanceof HTMLButtonElement)) return false;
      if (el.disabled || el.hasAttribute('disabled') || el.tabIndex < 0) return false;
      el.focus();
      return document.activeElement === el;
    });
    expect(fokus).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Link' })).toHaveCount(0);
    expect(await editorJson(page)).toEqual(vorher);
    await gleicheCodeSpanne(page, text);
    const kasten = await formatKnopf(page, name).boundingBox();
    if (!kasten) throw new Error(`kein ${name}`);
    await page.mouse.click(kasten.x + kasten.width / 2, kasten.y + kasten.height / 2);
    await expect(page.getByRole('dialog', { name: 'Link' })).toHaveCount(0);
    expect(await editorJson(page)).toEqual(vorher);
    const taste = CODE_TASTE[name];
    if (!taste) continue;
    await gleicheCodeSpanne(page, text);
    await page.locator(FELD).press(taste);
    await expect(page.getByRole('dialog', { name: 'Link' })).toHaveCount(0);
    expect(await editorJson(page)).toEqual(vorher);
  }
  await gleicheCodeSpanne(page, text);
  for (const name of ['Code', 'Heading', 'Bulleted list', 'Checklist']) {
    await expect(formatKnopf(page, name)).not.toHaveAttribute('aria-disabled', 'true');
  }
}
async function notizCodeBlock(page: Page): Promise<void> {
  await tippeTasten(page, 'aa\nbb\ncc dd');
  const roh = await blockText(page, FELD);
  await waehleSichtbar(page, 0, 99);
  const erste = await sichtSpanne(page);
  expect(erste.von).toBeGreaterThanOrEqual(0);
  expect(erste.bis).toBeGreaterThan(erste.von);
  expect(erste.text.startsWith('aa')).toBe(true);
  expect(erste.text.endsWith('cc dd')).toBe(true);
  const code = formatKnopf(page, 'Code');
  await expect(code).toBeVisible();
  await expect(code).toHaveAttribute('aria-pressed', 'false');
  await code.click();
  const an = knotenTexte((await editorJson(page)) as ModellJson);
  expect(an.length).toBeGreaterThan(0);
  expect(an.every((zeile) => zeile.art === 'codeblock')).toBe(true);
  expect(an.map((zeile) => zeile.text).filter((text) => text.length > 0)).toEqual(['aa', 'bb', 'cc dd']);
  await gleicheCodeSpanne(page, erste.text);
  await expect(code).toHaveAttribute('aria-pressed', 'true');
  await expect(code).not.toHaveAttribute('aria-pressed', 'mixed');
  await gleicheCodeSpanne(page, erste.text);
  await codeblockSperre(page, erste.text);
  await gleicheCodeSpanne(page, erste.text);
  await code.click();
  const aus = knotenTexte((await editorJson(page)) as ModellJson);
  expect(aus.some((zeile) => zeile.art === 'codeblock')).toBe(false);
  expect(aus.length).toBeGreaterThan(0);
  expect(aus.every((zeile) => zeile.art === 'absatz')).toBe(true);
  expect(await blockText(page, FELD)).toBe(roh);
  for (const wort of ['aa', 'bb', 'cc dd']) await erwarteStil(page, wort, 'mono', false);
  await waehleSichtbarenText(page, 'aa', 'cc dd');
  for (const name of CODE_GESPERRT) {
    const knopf = formatKnopf(page, name);
    await expect(knopf).toBeVisible();
    await expect(knopf).toBeEnabled();
    await expect(knopf).not.toHaveAttribute('aria-disabled', 'true');
  }
  await expect(code).toHaveAttribute('aria-pressed', 'false');
  const inhalt = await blockText(page, FELD);
  await page.keyboard.press('Control+z');
  const zurueck = knotenTexte((await editorJson(page)) as ModellJson);
  expect(zurueck.some((zeile) => zeile.art === 'codeblock')).toBe(true);
  expect(zurueck.map((zeile) => zeile.text).filter((text) => text.length > 0)).toEqual(['aa', 'bb', 'cc dd']);
  await gleicheCodeSpanne(page, erste.text);
  for (const name of CODE_GESPERRT) {
    await expect(formatKnopf(page, name)).toHaveAttribute('aria-disabled', 'true');
  }
  await page.keyboard.press('Control+z');
  expect(knotenTexte((await editorJson(page)) as ModellJson).some((zeile) => zeile.art === 'codeblock')).toBe(false);
  expect(await blockText(page, FELD)).toBe(inhalt);
  await waehleSichtbarenText(page, 'aa', 'cc dd');
  const bold = formatKnopf(page, 'Bold');
  await expect(bold).toBeVisible();
  await expect(bold).toBeEnabled();
  await expect(bold).not.toHaveAttribute('aria-disabled', 'true');
  await bold.click();
  await erwarteStil(page, 'aa', 'fett', true);
  expect(await blockText(page, FELD)).toBe(inhalt);
}
async function wichtigOhneMarkierung(page: Page): Promise<void> {
  await tippeTasten(page, 'eins ');
  await expect(page.getByRole('toolbar', { name: 'Format' })).toHaveCount(0);
  await page.keyboard.press(WICHTIG_TASTE);
  await erwarteStil(page, 'eins', 'wichtig', true);
  await page.keyboard.press('Control+z');
  await erwarteStil(page, 'eins', 'wichtig', false);
  await page.keyboard.press('Control+y');
  await erwarteStil(page, 'eins', 'wichtig', true);
  await tippeTasten(page, 'zwei');
  await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toBe('eins zwei');
  await page.keyboard.press(WICHTIG_TASTE);
  await tippeTasten(page, ' drei');
  await erwarteStil(page, 'zwei', 'wichtig', true);
  await erwarteStil(page, 'drei', 'wichtig', false);
  await waehleSichtbarenText(page, 'zwei', 'drei');
  const knopf = formatKnopf(page, 'Important');
  await expect(knopf).toBeVisible();
  await expect(knopf).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+1');
  await expect(knopf).toHaveAttribute('title', 'Important (Ctrl+Shift+1)');
  await expect(knopf).toHaveAttribute('aria-pressed', 'false');
  await expect(knopf).not.toHaveAttribute('aria-pressed', 'mixed');
  await waehleSichtbarenText(page, 'zwei', 'zwei');
  await page.keyboard.press(WICHTIG_TASTE);
  await expect(knopf).toHaveAttribute('aria-pressed', 'true');
  await erwarteStil(page, 'zwei', 'wichtig', true);
  await page.keyboard.press(WICHTIG_TASTE);
  await expect(knopf).toHaveAttribute('aria-pressed', 'false');
  await erwarteStil(page, 'zwei', 'wichtig', true);
  await erwarteStil(page, 'drei', 'wichtig', false);
  await waehleSichtbarenText(page, 'zwei', 'zwei');
  await expect(knopf).toBeVisible();
  const inhalt = await sichtbar(page);
  await knopf.click();
  await page.keyboard.press('Control+z');
  await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toBe(inhalt);
  await erwarteStil(page, 'zwei', 'wichtig', true);
}
for (const feld of ['erfassen', 'notiz'] as const) {
  test.describe(`${feld} – Desktop`, { tag: '@F1' }, () => {
    test.beforeEach(async ({ page }) => {
      await oeffneFeld(page, feld);
    });
    test.afterEach(async ({ page }, info) => {
      if (info.status === 'skipped') return;
      await invarianten(page);
    });
    test('leeres Feld: Cursor in der Platzhalterzeile', async ({ page }) => {
      const platz = page.locator('.cm-placeholder, [data-placeholder]').first();
      const p = await platz.boundingBox({ timeout: 1_000 }).catch(() => null);
      expect(p, 'Platzhalterzeile').not.toBeNull();
      const hoehe = await page.locator(`${FELD} > *`).first().evaluate((el) => el.getBoundingClientRect().height);
      expect(hoehe).toBeLessThanOrEqual((p?.height ?? 0) * 1.6);
      await tippeTasten(page, 'Hallo');
      const text = await page.locator(FELD).getByText('Hallo').boundingBox();
      expect(text).not.toBeNull();
      expect(Math.abs((text?.y ?? 0) - (p?.y ?? 0))).toBeLessThan(4);
    });
    test('Bildvergleich nach dem Tippen', async ({ page }, info) => {
      await tippeTasten(page, 'Hallo');
      await erwarteBasisbild(page, `${feld}-leer-getippt.png`, info);
    });
    for (const [knopfName, art] of KNOEPFE) {
      test(`${knopfName}: ohne Markierung an, tippen, aus, weitertippen`, async ({ page }) => {
        if (knopfName === 'Important') {
          await wichtigOhneMarkierung(page);
          return;
        }
        await tippeTasten(page, 'eins ');
        await expect(page.getByRole('toolbar', { name: 'Format' })).toHaveCount(0);
        const taste = OHNE_TASTE[knopfName];
        if (taste) await page.keyboard.press(taste);
        else {
          await expect(
            formatKnopf(page, knopfName),
            'Wichtig-Zeile ohne Auswahl: Leiste zu, kein Shortcut',
          ).toBeVisible();
          await knopfKlick(page, knopfName);
        }
        await tippeTasten(page, 'zwei');
        await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toBe('eins zwei');
        if (taste) await page.keyboard.press(taste);
        else await knopfKlick(page, knopfName);
        await tippeTasten(page, ' drei');
        await erwarteStil(page, 'zwei', art, true);
        await erwarteStil(page, 'drei', art, false);
        await waehleSichtbarenText(page, 'zwei', 'zwei');
        const knopf = formatKnopf(page, knopfName);
        await expect(knopf).toBeVisible();
        await expect(knopf).toHaveAttribute('aria-pressed', 'true');
        await expect(knopf).not.toHaveAttribute('aria-pressed', 'mixed');
        await waehleSichtbarenText(page, 'zwei', 'drei');
        await expect(knopf).toHaveAttribute('aria-pressed', 'false');
        await waehleSichtbarenText(page, 'zwei', 'zwei');
        const inhalt = await sichtbar(page);
        await knopf.click();
        await page.keyboard.press('Control+z');
        await expect.poll(() => sichtbar(page), { timeout: 3_000 }).toBe(inhalt);
        await erwarteStil(page, 'zwei', art, true);
      });
      test(`${knopfName}: auf Markierung, mehrzeilig, erneut aus`, async ({ page }) => {
        if (feld === 'notiz' && knopfName === 'Code') {
          await notizCodeBlock(page);
          return;
        }
        await tippeTasten(page, 'aa\nbb\ncc dd');
        await waehleSichtbar(page, 0, 99);
        if (knopfName === 'Important') {
          const knopf = formatKnopf(page, knopfName);
          await expect(knopf).toBeVisible();
          await expect(knopf).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+1');
          await expect(knopf).toHaveAttribute('title', 'Important (Ctrl+Shift+1)');
          await page.keyboard.press(WICHTIG_TASTE);
        } else {
          await knopfKlick(page, knopfName);
        }
        for (const wort of ['aa', 'bb', 'cc dd']) await erwarteStil(page, wort, art, true);
        if (knopfName === 'Important') await page.keyboard.press(WICHTIG_TASTE);
        else await knopfKlick(page, knopfName);
        for (const wort of ['aa', 'bb', 'cc dd']) await erwarteStil(page, wort, art, false);
      });
    }
  });
}
