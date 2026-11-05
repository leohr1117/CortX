import type { DOMOutputSpec, Mark, MarkSpec, Node, NodeSpec, TagParseRule } from 'prosemirror-model';
import { ART } from './baum.ts';
import { formatVon, type FormatId } from './register.ts';
import { sicherZiel } from './sicher.ts';

const MARK_TAGS: Readonly<Record<string, readonly string[]>> = {
  fett: ['strong', 'b'],
  kursiv: ['em', 'i'],
  strich: ['s', 'del', 'strike'],
  code: ['code'],
  wichtig: ['mark'],
};

function alsElement(dom: string | HTMLElement): HTMLElement | null {
  if (typeof dom === 'string' || dom.nodeType !== 1) return null;
  return dom;
}

function klassen(el: HTMLElement): string[] {
  return (el.className ?? '').split(/\s+/).filter(Boolean);
}

function leerBlock(el: HTMLElement): boolean {
  const text = (el.textContent ?? '').replace(/\u00a0/g, ' ').trim();
  if (text.length > 0) return false;
  for (let i = 0; i < el.childNodes.length; i += 1) {
    const kind = el.childNodes[i];
    if (!kind || kind.nodeType !== 1) continue;
    const name = (kind as HTMLElement).tagName;
    if (name !== 'BR' && name !== 'WBR') return false;
  }
  return true;
}

function kastenIn(el: HTMLElement): { an: boolean } | null {
  for (let i = 0; i < el.childNodes.length; i += 1) {
    const kind = el.childNodes[i];
    if (!kind || kind.nodeType !== 1) continue;
    const knoten = kind as HTMLElement;
    if (knoten.tagName !== 'INPUT') continue;
    if ((knoten.getAttribute('type') ?? '').toLowerCase() !== 'checkbox') continue;
    return { an: knoten.hasAttribute('checked') || knoten.getAttribute('checked') !== null };
  }
  return null;
}

function listeArt(el: HTMLElement): { art: string; nummerArt?: string; nummer?: number; abgehakt?: boolean } {
  const task = el.getAttribute('data-task');
  if (task != null) return { art: ART.haken, abgehakt: task === 'done' || task === '1' };
  const kasten = kastenIn(el);
  if (kasten) return { art: ART.haken, abgehakt: kasten.an };
  const data = el.getAttribute('data-list');
  const parent = el.parentNode && el.parentNode.nodeType === 1 ? (el.parentNode as HTMLElement).tagName : '';
  if (data === 'ol' || parent === 'OL') {
    let nummer = 1;
    let vor = el.previousSibling;
    while (vor) {
      if (vor.nodeType === 1 && (vor as HTMLElement).tagName === 'LI') nummer += 1;
      vor = vor.previousSibling;
    }
    return { art: ART.nummer, nummerArt: 'zahl', nummer };
  }
  return { art: ART.liste };
}

function istListenP(el: HTMLElement): boolean {
  return el.getAttribute('data-list') != null || el.getAttribute('data-task') != null;
}

function absatzDom(): Pick<NodeSpec, 'toDOM' | 'parseDOM'> {
  return {
    toDOM() {
      return ['p', 0];
    },
    parseDOM: [
      {
        tag: 'p',
        getAttrs(dom) {
          const el = alsElement(dom);
          if (!el || leerBlock(el) || istListenP(el)) return false;
          return null;
        },
      },
    ],
  };
}

function kopfDom(): Pick<NodeSpec, 'toDOM' | 'parseDOM'> {
  const parseDOM: TagParseRule[] = [];
  for (let stufe = 1; stufe <= 6; stufe += 1) {
    parseDOM.push({ tag: `h${stufe}`, attrs: { stufe } });
  }
  return {
    toDOM(node: Node): DOMOutputSpec {
      const stufe = Number(node.attrs.stufe ?? 0);
      const tag = stufe >= 1 && stufe <= 6 ? `h${stufe}` : 'h2';
      return [tag, 0];
    },
    parseDOM,
  };
}

function wichtigZeileDom(): Pick<NodeSpec, 'toDOM' | 'parseDOM'> {
  return {
    toDOM() {
      return ['div', { 'data-line': 'wichtig' }, 0];
    },
    parseDOM: [
      {
        tag: 'div',
        getAttrs(dom) {
          const el = alsElement(dom);
          if (!el) return false;
          if (el.getAttribute('data-line') === 'wichtig') return null;
          if (klassen(el).includes('cm-wichtig-zeile')) return null;
          return false;
        },
      },
    ],
  };
}

function punktDom(): Pick<NodeSpec, 'toDOM' | 'parseDOM'> {
  return {
    toDOM(node: Node): DOMOutputSpec {
      const art = String(node.attrs.art ?? ART.liste);
      if (art === ART.haken) {
        return ['p', { 'data-task': node.attrs.abgehakt === true ? 'done' : 'open' }, 0];
      }
      if (art === ART.nummer) return ['li', { 'data-list': 'ol' }, 0];
      return ['li', { 'data-list': 'ul' }, 0];
    },
    parseDOM: [
      {
        tag: 'li',
        getAttrs(dom) {
          const el = alsElement(dom);
          return el ? listeArt(el) : false;
        },
      },
      {
        tag: 'p',
        priority: 60,
        getAttrs(dom) {
          const el = alsElement(dom);
          if (!el || !istListenP(el)) return false;
          return listeArt(el);
        },
      },
    ],
  };
}

function codeblockDom(): Pick<NodeSpec, 'toDOM' | 'parseDOM'> {
  return {
    toDOM() {
      return ['pre', ['code', 0]];
    },
    parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
  };
}

function leerzeileDom(): Pick<NodeSpec, 'toDOM' | 'parseDOM'> {
  return {
    toDOM() {
      return ['p', { 'data-empty': '1' }, ['br']];
    },
    parseDOM: [
      {
        tag: 'p',
        priority: 61,
        getAttrs(dom) {
          const el = alsElement(dom);
          if (!el || istListenP(el) || !leerBlock(el)) return false;
          return null;
        },
      },
    ],
  };
}

const ZEILE_DOM: Readonly<Record<string, () => Pick<NodeSpec, 'toDOM' | 'parseDOM'>>> = {
  absatz: absatzDom,
  ueberschrift: kopfDom,
  wichtigZeile: wichtigZeileDom,
  punkt: punktDom,
  codeblock: codeblockDom,
  leerzeile: leerzeileDom,
};

export function zeileDom(name: string): Pick<NodeSpec, 'toDOM' | 'parseDOM'> {
  return ZEILE_DOM[name]?.() ?? {
    toDOM() {
      return ['div', 0];
    },
  };
}

export function markeDom(id: FormatId): Pick<MarkSpec, 'toDOM' | 'parseDOM'> {
  if (id === ART.link) {
    return {
      toDOM(mark: Mark): DOMOutputSpec {
        const ziel = sicherZiel(String(mark.attrs.ziel ?? ''));
        return ziel ? ['a', { href: ziel }, 0] : ['span', 0];
      },
      parseDOM: [
        {
          tag: 'a',
          getAttrs(dom) {
            const el = alsElement(dom);
            if (!el) return false;
            const ziel = sicherZiel(el.getAttribute('href') ?? '');
            return ziel ? { ziel } : false;
          },
        },
      ],
    };
  }
  const kanon = formatVon(id).vorschau?.tag ?? MARK_TAGS[id]?.[0] ?? 'span';
  const tags = MARK_TAGS[id] ?? [kanon];
  return {
    toDOM() {
      return [kanon, 0];
    },
    parseDOM: tags.map((tag) => ({ tag })),
  };
}
