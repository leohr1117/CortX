import type { Mark, Node } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import type { EditorView, MarkView, NodeView, NodeViewConstructor } from 'prosemirror-view';
import { ART } from '../../../../shared/features/format/baum.ts';
import { stilAttribut } from '../../../../shared/features/format/stil.ts';
import '../../../../shared/features/format/modellkasten.ts';
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
import { setzeZustand } from './modellLauf.ts';

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

function halt(event: Event) {
  event.preventDefault();
  event.stopPropagation();
}

function merkeKasten(span: HTMLElement, view: EditorView, getPos: () => number | undefined) {
  const befehl = formatVon(ART.haken).kasten?.modell;
  if (!befehl) return;
  let finger = false;
  const um = (event: Event) => {
    halt(event);
    const pos = getPos();
    if (pos === undefined) return;
    const naechster = befehl(view.state, pos);
    if (naechster !== view.state) setzeZustand(view, naechster);
  };
  span.addEventListener('mousedown', halt);
  span.addEventListener('pointerdown', halt);
  span.addEventListener('touchstart', halt);
  span.addEventListener('touchend', (event) => {
    finger = true;
    um(event);
  });
  span.addEventListener('click', (event) => {
    if (!finger) {
      um(event);
      return;
    }
    finger = false;
    halt(event);
  });
}

function marker(node: Node, view: EditorView, getPos: () => number | undefined): HTMLElement {
  const span = document.createElement('span');
  span.className = 'cm-marker';
  span.setAttribute('contenteditable', 'false');
  span.setAttribute('aria-hidden', 'true');
  const widget = vorschauWidget(String(node.attrs.art ?? ''));
  if (widget === WIDGET.haken) {
    span.classList.add('cm-haken');
    if (node.attrs.abgehakt === true) span.classList.add('zu');
    merkeKasten(span, view, getPos);
    return span;
  }
  if (widget) span.classList.add(widget);
  return span;
}

function gleicheZeile(vorher: Node, nachher: Node): boolean {
  if (nachher.type !== vorher.type) return false;
  return String(nachher.attrs.art ?? '') === String(vorher.attrs.art ?? '');
}

function zeile(node: Node, view: EditorView, getPos: () => number | undefined): NodeView {
  const dom = document.createElement(TAG[node.type.name] ?? 'div');
  for (const klasse of blockKlassen(node)) dom.classList.add(klasse);
  if (node.isLeaf) {
    dom.appendChild(document.createElement('br'));
    return { dom, update: (nachher) => nachher.type === node.type };
  }
  let inhalt = dom;
  if (node.type.name === 'punkt') inhalt = document.createElement('span');
  else if (node.type.name === 'codeblock') inhalt = document.createElement('code');
  else if (node.type.name === 'wichtigZeile') {
    inhalt = document.createElement('span');
    inhalt.className = 'cm-wichtig';
  }
  const markierung = node.type.name === 'punkt' ? marker(node, view, getPos) : null;
  const kasten = markierung?.classList.contains('cm-haken') ? markierung : null;
  if (markierung) dom.appendChild(markierung);
  if (inhalt !== dom) dom.appendChild(inhalt);
  let aktuell = node;
  return {
    dom,
    contentDOM: inhalt,
    update(nachher) {
      if (!gleicheZeile(aktuell, nachher)) return false;
      if (kasten && Boolean(nachher.attrs.abgehakt) !== Boolean(aktuell.attrs.abgehakt)) {
        if (nachher.attrs.abgehakt === true) kasten.classList.add('zu');
        else kasten.classList.remove('zu');
      }
      aktuell = nachher;
      return true;
    },
    stopEvent(event) {
      const ziel = event.target;
      return Boolean(kasten && ziel instanceof globalThis.Node && kasten.contains(ziel));
    },
    ignoreMutation(mutation) {
      if (mutation.type === 'attributes') return true;
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
  return {
    dom,
    contentDOM: dom,
    ignoreMutation(mutation) {
      return mutation.type === 'attributes';
    },
  };
}

const INLINE = new Set(['cm-fett', 'cm-kursiv', 'cm-strich', 'cm-code', 'cm-wichtig', 'cm-link']);

function klassenNamen(knoten: globalThis.Node): string[] {
  if (knoten.nodeType !== 1) return [];
  return (knoten as HTMLElement).className.split(/\s+/).filter(Boolean);
}

function gleicheSchichten(wurzel: HTMLElement): void {
  const lauf = (knoten: globalThis.Node): void => {
    for (let i = 0; i < knoten.childNodes.length; i += 1) {
      const kind = knoten.childNodes[i];
      if (!kind || kind.nodeType !== 1) continue;
      const el = kind as HTMLElement;
      let parent = el.parentNode;
      while (parent && parent !== wurzel.parentNode) {
        for (const name of klassenNamen(parent)) {
          if (INLINE.has(name)) el.classList.add(name);
        }
        if (parent === wurzel) break;
        parent = parent.parentNode;
      }
      if (el.classList.contains('cm-code') && el.classList.contains('cm-wichtig')) {
        const stil = stilAttribut([ART.code, ART.wichtig]);
        if (stil) el.setAttribute('style', stil);
      }
      lauf(el);
    }
  };
  lauf(wurzel);
}

export function schichtenPlugin(): Plugin {
  return new Plugin({
    view(editorView) {
      gleicheSchichten(editorView.dom);
      return {
        update(view) {
          gleicheSchichten(view.dom);
        },
      };
    },
  });
}

export function knotenAnsichten(): Record<string, NodeViewConstructor> {
  const aus: Record<string, NodeViewConstructor> = {};
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
