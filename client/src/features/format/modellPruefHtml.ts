const LEER = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'col', 'wbr']);
const SKIP = new Set(['script', 'style', 'iframe', 'object', 'embed']);
const FLACH = new Set(['html', 'head', 'body']);

interface HtmlZiel {
  appendChild: (kind: HtmlZiel) => HtmlZiel;
  childNodes: HtmlZiel[];
  nodeType: number;
  tagName?: string;
  textContent: string;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, wert: string) => void;
}

interface HtmlDok {
  createElement: (name: string) => HtmlZiel;
  createTextNode: (text: string) => HtmlZiel;
}

function decode(text: string): string {
  return text
    .replace(/&nbsp;/gi, '\u00a0')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function encode(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function tagAngabe(kern: string): { name: string; attrs: Array<[string, string]> } {
  const m = /^([a-zA-Z][\w-]*)/.exec(kern.trim());
  if (!m?.[1]) return { name: '', attrs: [] };
  const attrs: Array<[string, string]> = [];
  const rest = kern.slice(m[0].length);
  const attrRe = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let treffer: RegExpExecArray | null;
  while ((treffer = attrRe.exec(rest))) {
    attrs.push([treffer[1]!, treffer[2] ?? treffer[3] ?? treffer[4] ?? '']);
  }
  return { name: m[1].toLowerCase(), attrs };
}

export function leseHtml(ziel: HtmlZiel, dok: HtmlDok, html: string): void {
  const stack: HtmlZiel[] = [ziel];
  let i = 0;
  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const zu = html.indexOf('-->', i + 4);
      i = zu < 0 ? html.length : zu + 3;
      continue;
    }
    if (html[i] !== '<') {
      const zu = html.indexOf('<', i);
      const text = decode(html.slice(i, zu < 0 ? html.length : zu));
      i = zu < 0 ? html.length : zu;
      if (text) stack[stack.length - 1]!.appendChild(dok.createTextNode(text));
      continue;
    }
    const zu = html.indexOf('>', i + 1);
    if (zu < 0) break;
    const roh = html.slice(i + 1, zu);
    i = zu + 1;
    if (roh.startsWith('/')) {
      const name = roh.slice(1).trim().toLowerCase();
      if (!FLACH.has(name) && stack.length > 1) stack.pop();
      continue;
    }
    const schliess = roh.endsWith('/');
    const { name, attrs } = tagAngabe(schliess ? roh.slice(0, -1) : roh);
    if (!name || SKIP.has(name) || FLACH.has(name)) continue;
    const el = dok.createElement(name);
    for (const [key, wert] of attrs) el.setAttribute(key, wert);
    stack[stack.length - 1]!.appendChild(el);
    if (!schliess && !LEER.has(name)) stack.push(el);
  }
}

export function schreibeHtml(knoten: HtmlZiel): string {
  if (knoten.nodeType === 3) return encode(knoten.textContent ?? '');
  if (knoten.nodeType !== 1) return '';
  const name = (knoten.tagName ?? '').toLowerCase();
  const inner = knoten.childNodes.map(schreibeHtml).join('');
  let attrs = '';
  for (const key of ['href', 'data-list', 'data-task', 'data-line', 'data-empty', 'class', 'type', 'checked']) {
    const wert = knoten.getAttribute(key);
    if (wert == null) continue;
    attrs += ` ${key}="${encode(wert)}"`;
  }
  if (LEER.has(name)) return `<${name}${attrs}>`;
  return `<${name}${attrs}>${inner}</${name}>`;
}
