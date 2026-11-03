import type { Mark, Node } from 'prosemirror-model';
import type { MarkView, NodeView } from 'prosemirror-view';
import { modell } from '../../../../shared/features/format/modell.ts';
import {
  WIDGET,
  formatVon,
  inlineFormate,
  vorschauSchichten,
  vorschauTag,
  vorschauWidget,
} from '../../../../shared/features/format/register.ts';
import { sicherZiel } from '../../../../shared/features/format/sicher.ts';

const TAG: Readonly<Record<string, string>> = {
  absatz: 'p',
  ueberschrift: 'h2',
  wichtigZeile: 'div',
  leerzeile: 'p',
  codeblock: 'pre',
  punkt: 'div',
};

const ZEILEN_KLASSE: Readonly<Record<string, string>> = {
  wichtigZeile: 'cm-wichtig-zeile',
};

function vorschauVon(art: string): { tag?: string; klasse?: string } {
  const klasse = vorschauSchichten().find((eintrag) => eintrag.art === art)?.klasse;
  const tag = vorschauTag(art);
  if (klasse || tag) return { klasse, tag };
  const format = inlineFormate().find((eintrag) => eintrag.id === art);
  if (!format) return {};
  const eintrag = formatVon(format.id);
  return { tag: eintrag.vorschau?.tag, klasse: eintrag.vorschau?.klasse };
}

function klasseVon(art: string): string {
  return vorschauVon(art).klasse ?? '';
}

function blockKlassen(node: Node): string[] {
  const aus: string[] = [];
  const sicht = klasseVon(node.type.name);
  if (sicht) aus.push(sicht);
  const extra = ZEILEN_KLASSE[node.type.name];
  if (extra) aus.push(extra);
  if (node.type.name !== 'punkt') return aus;
  const widget = vorschauWidget(String(node.attrs.art ?? ''));
  if (widget === WIDGET.punkt || widget === WIDGET.nummer) aus.push(`cm-${widget}`);
  return aus;
}

function marker(node: Node): HTMLElement {
  const span = document.createElement('span');
  span.className = 'cm-marker';
  span.setAttribute('contenteditable', 'false');
  span.setAttribute('aria-hidden', 'true');
  const widget = vorschauWidget(String(node.attrs.art ?? ''));
  if (widget === WIDGET.haken) {
    span.classList.add('cm-haken');
    if (node.attrs.abgehakt === true) span.classList.add('zu');
    return span;
  }
  if (widget) span.classList.add(widget);
  return span;
}

function gleicheZeile(vorher: Node, nachher: Node): boolean {
  if (nachher.type !== vorher.type) return false;
  if (String(nachher.attrs.art ?? '') !== String(vorher.attrs.art ?? '')) return false;
  return Boolean(nachher.attrs.abgehakt) === Boolean(vorher.attrs.abgehakt);
}

function zeile(node: Node): NodeView {
  const dom = document.createElement(TAG[node.type.name] ?? 'div');
  for (const klasse of blockKlassen(node)) dom.classList.add(klasse);
  if (node.isLeaf) {
    dom.appendChild(document.createElement('br'));
    return { dom, update: (nachher) => nachher.type === node.type };
  }
  const inhalt = node.type.name === 'punkt' || node.type.name === 'codeblock'
    ? document.createElement(node.type.name === 'codeblock' ? 'code' : 'span')
    : dom;
  if (node.type.name === 'punkt') dom.appendChild(marker(node));
  if (inhalt !== dom) dom.appendChild(inhalt);
  let aktuell = node;
  return {
    dom,
    contentDOM: inhalt,
    update(nachher) {
      if (!gleicheZeile(aktuell, nachher)) return false;
      aktuell = nachher;
      return true;
    },
    ignoreMutation(mutation) {
      return !inhalt.contains(mutation.target);
    },
  };
}

function marke(mark: Mark): MarkView {
  const ziel = mark.attrs.ziel;
  const sicht = vorschauVon(mark.type.name);
  const tag = typeof ziel === 'string' ? 'a' : (sicht.tag ?? 'span');
  const dom = document.createElement(tag);
  const sichtbar = sicht.klasse;
  if (sichtbar) dom.classList.add(sichtbar);
  if (typeof ziel === 'string') {
    const sicher = sicherZiel(ziel);
    if (sicher) dom.setAttribute('href', sicher);
  }
  return { dom, contentDOM: dom };
}

export function knotenAnsichten(): Record<string, (node: Node) => NodeView> {
  const aus: Record<string, (node: Node) => NodeView> = {};
  for (const name of Object.keys(modell.nodes)) {
    if (name === 'doc' || name === 'text') continue;
    aus[name] = zeile;
  }
  return aus;
}

export function markenAnsichten(): Record<string, (mark: Mark) => MarkView> {
  const aus: Record<string, (mark: Mark) => MarkView> = {};
  for (const name of Object.keys(modell.marks)) aus[name] = marke;
  return aus;
}
