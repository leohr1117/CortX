import { leseHtml, schreibeHtml } from './modellPruefHtml.ts';

const ELEMENT = 1;
const TEXT = 3;
const COMMENT = 8;
const DOCUMENT = 9;
const FRAGMENT = 11;

class Klasse {
  el: ElementKnoten;
  constructor(el: ElementKnoten) { this.el = el; }
  add(...namen: string[]) {
    for (const name of namen) {
      if (name && !this.el.klassen.includes(name)) this.el.klassen.push(name);
    }
  }
  remove(...namen: string[]) {
    this.el.klassen = this.el.klassen.filter((name) => !namen.includes(name));
  }
  contains(name: string) {
    return this.el.klassen.includes(name);
  }
}

class Stil {
  setProperty() {}
  getPropertyValue() { return ''; }
  removeProperty() {}
}

class Knoten {
  static ELEMENT_NODE = ELEMENT;
  static TEXT_NODE = TEXT;
  static COMMENT_NODE = COMMENT;
  static DOCUMENT_NODE = DOCUMENT;
  static DOCUMENT_FRAGMENT_NODE = FRAGMENT;
  parentNode: Knoten | null = null;
  childNodes: Knoten[] = [];
  ownerDocument: Dokument | null;
  nodeType: number;
  nodeName: string;
  private hoerer = new Map<string, Array<(ereignis: Ereignis) => void>>();
  constructor(ownerDocument: Dokument | null, nodeType: number, nodeName: string) {
    this.ownerDocument = ownerDocument;
    this.nodeType = nodeType;
    this.nodeName = nodeName;
  }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get nextSibling() { return this.geschwister(1); }
  get previousSibling() { return this.geschwister(-1); }
  get isConnected() {
    let lauf: Knoten | null = this;
    while (lauf) {
      if (lauf.nodeType === DOCUMENT) return true;
      lauf = lauf.parentNode;
    }
    return false;
  }
  get textContent() {
    return this.childNodes.map((kind) => {
      if (kind.nodeType === COMMENT) return '';
      if (kind.nodeType === TEXT) return (kind as TextKnoten).data;
      return kind.textContent;
    }).join('');
  }
  set textContent(wert: string) {
    this.childNodes = [];
    if (wert) this.appendChild(this.dokument().createTextNode(wert));
  }
  appendChild<T extends Knoten>(kind: T) { return this.insertBefore(kind, null); }
  insertBefore<T extends Knoten>(kind: T, vorher: Knoten | null) {
    if (kind.nodeType === FRAGMENT) {
      for (const teil of [...kind.childNodes]) this.insertBefore(teil, vorher);
      return kind;
    }
    if (kind.parentNode) kind.parentNode.removeChild(kind);
    kind.parentNode = this;
    const index = vorher ? this.childNodes.indexOf(vorher) : this.childNodes.length;
    this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, kind);
    return kind;
  }
  removeChild<T extends Knoten>(kind: T) {
    const index = this.childNodes.indexOf(kind);
    if (index >= 0) this.childNodes.splice(index, 1);
    kind.parentNode = null;
    return kind;
  }
  replaceChild<T extends Knoten>(neu: T, alt: Knoten) {
    this.insertBefore(neu, alt);
    if (alt.parentNode === this) this.removeChild(alt);
    return alt;
  }
  remove() { this.parentNode?.removeChild(this); }
  hasChildNodes() { return this.childNodes.length > 0; }
  contains(ziel: Knoten | null) {
    let lauf = ziel;
    while (lauf) {
      if (lauf === this) return true;
      lauf = lauf.parentNode;
    }
    return false;
  }
  addEventListener(art: string, fn: (ereignis: Ereignis) => void) {
    const liste = this.hoerer.get(art) ?? [];
    liste.push(fn);
    this.hoerer.set(art, liste);
  }
  removeEventListener(art: string, fn: (ereignis: Ereignis) => void) {
    const liste = this.hoerer.get(art) ?? [];
    this.hoerer.set(art, liste.filter((eintrag) => eintrag !== fn));
  }
  dispatchEvent(ereignis: Ereignis) {
    ereignis.target ??= this;
    ereignis.currentTarget = this;
    for (const fn of [...(this.hoerer.get(ereignis.type) ?? [])]) fn(ereignis);
    if (!ereignis.cancelBubble && this.parentNode) this.parentNode.dispatchEvent(ereignis);
    return !ereignis.defaultPrevented;
  }
  private dokument() {
    const dokument = this.ownerDocument ?? (this as unknown as Dokument);
    return dokument;
  }
  private geschwister(richtung: number) {
    const liste = this.parentNode?.childNodes ?? [];
    return liste[liste.indexOf(this) + richtung] ?? null;
  }
}

class TextKnoten extends Knoten {
  data: string;
  constructor(dokument: Dokument, data: string) {
    super(dokument, TEXT, '#text');
    this.data = data;
  }
  override get textContent() { return this.data; }
  override set textContent(wert: string) { this.data = wert; }
  get nodeValue() { return this.data; }
  set nodeValue(wert: string) { this.data = wert ?? ''; }
  get length() { return this.data.length; }
}

class ElementKnoten extends Knoten {
  klassen: string[] = [];
  classList = new Klasse(this);
  style = new Stil();
  private attrs = new Map<string, string>();
  constructor(dokument: Dokument, name: string) {
    super(dokument, ELEMENT, name.toUpperCase());
    this.tagName = name.toUpperCase();
  }
  tagName: string;
  get className() { return this.klassen.join(' '); }
  set className(wert: string) { this.klassen = wert.split(/\s+/).filter(Boolean); }
  setAttribute(name: string, wert: string) {
    this.attrs.set(name, String(wert));
    if (name === 'class') this.className = String(wert);
  }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  removeAttribute(name: string) { this.attrs.delete(name); }
  hasAttribute(name: string) { return this.attrs.has(name); }
  matches(selector: string): boolean {
    const teile = selector.trim().toLowerCase().split(/\s+/);
    if (teile.length === 2) {
      if (!this.matches(teile[1]!)) return false;
      let ahne = this.parentNode;
      while (ahne) {
        if (ahne.nodeType === ELEMENT && (ahne as ElementKnoten).matches(teile[0]!)) return true;
        ahne = ahne.parentNode;
      }
      return false;
    }
    const m = /^([a-z][\w-]*)?(?:\.([\w-]+))?(?:\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\])?$/.exec(teile[0] ?? '');
    if (!m) return this.tagName.toLowerCase() === selector.toLowerCase();
    if (m[1] && m[1] !== this.tagName.toLowerCase()) return false;
    if (m[2] && !this.klassen.includes(m[2])) return false;
    if (m[3]) {
      const wert = this.getAttribute(m[3]);
      if (wert == null) return false;
      if (m[4] !== undefined && wert !== m[4]) return false;
    }
    return true;
  }
  get innerHTML() { return this.childNodes.map((kind) => schreibeHtml(kind as never)).join(''); }
  set innerHTML(wert: string) {
    this.childNodes = [];
    const dok = this.ownerDocument;
    if (!dok) return;
    leseHtml(this as never, dok as never, wert ?? '');
  }
  get contentEditable() { return this.getAttribute('contenteditable') ?? 'inherit'; }
  set contentEditable(wert: string) { this.setAttribute('contenteditable', wert); }
  focus() { this.dokumentAktiv(this); }
  blur() { this.dokumentAktiv(null); }
  getBoundingClientRect() {
    return { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0 };
  }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  private dokumentAktiv(el: ElementKnoten | null) {
    const dokument = this.ownerDocument;
    if (dokument) dokument.activeElement = el;
  }
}

class FragmentKnoten extends Knoten {
  constructor(dokument: Dokument) { super(dokument, FRAGMENT, '#document-fragment'); }
}

class Dokument extends Knoten {
  documentElement: ElementKnoten;
  body: ElementKnoten;
  head: ElementKnoten;
  activeElement: ElementKnoten | null = null;
  defaultView: Fenster | null = null;
  styleSheets: unknown[] = [];
  implementation = { createHTMLDocument: () => new Dokument() };
  constructor() {
    super(null, DOCUMENT, '#document');
    this.ownerDocument = this;
    this.documentElement = new ElementKnoten(this, 'html');
    this.body = new ElementKnoten(this, 'body');
    this.head = new ElementKnoten(this, 'head');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
  }
  createElement(name: string) { return new ElementKnoten(this, name); }
  createElementNS(_ns: string, name: string) { return this.createElement(name); }
  createTextNode(text: string) { return new TextKnoten(this, text); }
  createComment(text: string) { return new TextKnoten(this, text); }
  createDocumentFragment() { return new FragmentKnoten(this); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  createRange() {
    const kasten = { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };
    return { setStart() {}, setEnd() {}, collapse() {}, getClientRects: () => [], getBoundingClientRect: () => kasten };
  }
  elementFromPoint() { return null; }
  getSelection() { return this.defaultView?.getSelection() ?? null; }
}

interface Ereignis {
  type: string;
  target?: Knoten | null;
  currentTarget?: Knoten | null;
  cancelBubble?: boolean;
  defaultPrevented?: boolean;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

interface Fenster {
  document: Dokument;
  HTMLElement: typeof ElementKnoten;
  Element: typeof ElementKnoten;
  Node: typeof Knoten;
  Text: typeof TextKnoten;
  Document: typeof Dokument;
  DocumentFragment: typeof FragmentKnoten;
  getSelection: () => Auswahl;
  getComputedStyle: () => { getPropertyValue: (name: string) => string };
  MutationObserver: new () => { observe: () => void; disconnect: () => void; takeRecords: () => unknown[] };
  innerHeight: number;
  innerWidth: number;
}

interface Auswahl {
  anchorNode: null;
  anchorOffset: number;
  focusNode: null;
  focusOffset: number;
  rangeCount: number;
  isCollapsed: boolean;
  removeAllRanges: () => void;
  addRange: () => void;
  collapse: () => void;
  extend: () => void;
}

const auswahl: Auswahl = {
  anchorNode: null,
  anchorOffset: 0,
  focusNode: null,
  focusOffset: 0,
  rangeCount: 0,
  isCollapsed: true,
  removeAllRanges() {},
  addRange() {},
  collapse() {},
  extend() {},
};

class Beobachter {
  observe() {}
  disconnect() {}
  takeRecords() { return []; }
}

const stand = new Map<string, { da: boolean; wert: unknown }>();

function setze(name: string, wert: unknown) {
  const ziel = globalThis as unknown as Record<string, unknown>;
  if (!stand.has(name)) stand.set(name, { da: name in ziel, wert: ziel[name] });
  ziel[name] = wert;
}

export function richtePruefDom(): void {
  const dokument = new Dokument();
  const fenster: Fenster = {
    document: dokument,
    HTMLElement: ElementKnoten,
    Element: ElementKnoten,
    Node: Knoten,
    Text: TextKnoten,
    Document: Dokument,
    DocumentFragment: FragmentKnoten,
    innerHeight: 800,
    innerWidth: 390,
    getSelection: () => auswahl,
    getComputedStyle: () => new Proxy({ getPropertyValue: () => '' }, {
      get(_target, prop) {
        if (prop === 'getPropertyValue') return () => '';
        return '';
      },
    }),
    MutationObserver: Beobachter,
  };
  class Fremd {}
  const fensterMitArten = new Proxy(fenster, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && !(prop in target) && /^[A-Z]/.test(prop)) return Fremd;
      return Reflect.get(target, prop, receiver);
    },
  });
  dokument.defaultView = fensterMitArten as Fenster;
  setze('IS_REACT_ACT_ENVIRONMENT', true);
  setze('document', dokument);
  setze('window', fensterMitArten);
  setze('MutationObserver', Beobachter);
  setze('HTMLElement', ElementKnoten);
  setze('Element', ElementKnoten);
  setze('Text', TextKnoten);
  setze('Document', Dokument);
  setze('DocumentFragment', FragmentKnoten);
  setze('Node', Knoten);
  setze('innerHeight', 800);
  setze('innerWidth', 390);
  setze('scrollX', 0);
  setze('scrollY', 0);
  setze('pageXOffset', 0);
  setze('pageYOffset', 0);
  setze('getSelection', fenster.getSelection);
  setze('getComputedStyle', fenster.getComputedStyle);
  setze('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0));
  setze('cancelAnimationFrame', (id: number) => clearTimeout(id));
}

export function entfernePruefDom(): void {
  const ziel = globalThis as unknown as Record<string, unknown>;
  for (const [name, vorher] of stand) {
    if (vorher.da) ziel[name] = vorher.wert;
    else delete ziel[name];
  }
  stand.clear();
}
