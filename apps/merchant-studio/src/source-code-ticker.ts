import './source-code-ticker.css';

/**
 * While YAPI builds, a small editor types code into the chat. The model's answer arrives whole, not streamed, so these
 * are not the new lines being written: they are this store's own code — its current components and stylesheet — or,
 * before it has a site, code written from its own name and products. Decorative (hidden from assistive tech, the
 * progress checklist carries the status), paused with the tab, still for people who reduce motion.
 */

type SourceFile = { path: string; content: string; encoding?: string };
type CatalogItem = { name?: unknown; priceText?: unknown; price?: unknown };

const VISIBLE_LINES = 13;
const LINES_PER_FILE = 36;
const MAX_LINES = 180;
const quote = (value: unknown) => JSON.stringify(String(value ?? '').slice(0, 60));

/** The store's authored code (components and stylesheet), or code built from its data before a site exists. */
export function codeTickerLines(input: { files?: SourceFile[]; storeName?: string; items?: CatalogItem[] }): string[] {
  const authored = (input.files || []).filter(file => file.encoding !== 'base64' && typeof file.content === 'string'
    && (/^components\/.+\.tsx$/.test(file.path) || file.path === 'styles/globals.css' || file.path === 'index.html'));
  // The page first, its shared chrome next, the stylesheet last: the order a person would read the store in.
  const rank = (path: string) => path.endsWith('home.tsx') ? 0 : path.endsWith('.tsx') ? 1 : 2;
  const lines: string[] = [];
  for (const file of authored.sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path))) {
    const body = file.content.split('\n').map(line => line.replace(/\s+$/, '')).filter(line => line.trim() && line.length <= 140).slice(0, LINES_PER_FILE);
    if (body.length) lines.push(`// ${file.path}`, ...body);
    if (lines.length >= MAX_LINES) break;
  }
  if (lines.length) return lines.slice(0, MAX_LINES);
  const items = (input.items || []).filter(item => item && item.name).slice(0, 6);
  return [
    '// components/store-data.tsx',
    `export const store = { name: ${quote(input.storeName || 'Tu tienda')} } as const;`,
    '// components/catalogo.tsx',
    'export const productos = [',
    ...(items.length ? items.map(item => `  { nombre: ${quote(item.name)}, precio: ${quote(item.priceText ?? item.price ?? '')} },`) : ['  // Tus productos aparecen aquí']),
    '];',
    '// components/home.tsx',
    "import { store } from './store-data';",
    "import { productos } from './catalogo';",
    'export default function Home() {',
    '  return <main id="contenido">',
    '    <h1>{store.name}</h1>',
    '    <section id="productos">',
    '      {productos.map(p => <ProductCard key={p.nombre} {...p} />)}',
    '    </section>',
    '  </main>;',
    '}',
  ];
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const TOKEN = /(\/\/.*$|\/\*.*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)|(<\/?[A-Za-z][\w.]*|\/?>)|\b(import|from|export|default|function|return|const|let|as|await|async|if|else|new|true|false|null|type)\b|(#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em|vw|vh|%|s|ms)?\b)|([A-Za-z-]+)(?==|\s*:\s)/g;
const CLASSES = ['tk-com', 'tk-str', 'tk-tag', 'tk-key', 'tk-num', 'tk-attr'];

/** One line of code as HTML: every token is escaped before it is wrapped, so store text can never become markup. */
export function highlightCodeLine(line: string): string {
  let html = '', last = 0;
  for (const match of line.matchAll(TOKEN)) {
    const index = match.index!;
    html += escapeHtml(line.slice(last, index));
    const group = match.slice(1).findIndex(Boolean);
    html += `<span class="${CLASSES[group]}">${escapeHtml(match[0])}</span>`;
    last = index + match[0].length;
  }
  return html + escapeHtml(line.slice(last));
}

export function mountCodeTicker(host: HTMLElement, lines: string[]): { element: HTMLElement; destroy(): void } {
  const element = document.createElement('figure');
  element.className = 'code-ticker';
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = '<figcaption><span class="code-ticker__dots"><i></i><i></i><i></i></span><span class="code-ticker__file"></span><span class="code-ticker__live">escribiendo</span></figcaption><pre><code></code></pre>';
  host.append(element);
  const code = element.querySelector('code')!, file = element.querySelector<HTMLElement>('.code-ticker__file')!;
  const shown: string[] = [];
  let lineIndex = 0, charIndex = 0, number = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const row = (text: string, n: number, caret = false) => `<span class="code-ticker__line"><i>${n}</i>${highlightCodeLine(text)}${caret ? '<b class="code-ticker__caret"></b>' : ''}</span>`;
  const paint = (partial?: string) => {
    const start = number - shown.length + 1;
    code.innerHTML = shown.map((text, i) => row(text, start + i)).join('') + (partial !== undefined ? row(partial, number + 1, true) : '');
  };
  const push = (text: string) => {
    if (text.startsWith('// ') && /\.(tsx|css|html)$/.test(text)) file.textContent = text.slice(3);
    shown.push(text); number++;
    if (shown.length > VISIBLE_LINES - 1) shown.shift();
  };
  if (!lines.length) return { element, destroy: () => element.remove() };
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (still) {
    lines.slice(0, VISIBLE_LINES).forEach(push);
    paint();
    return { element, destroy: () => element.remove() };
  }
  const tick = () => {
    const line = lines[lineIndex];
    // A person types in bursts; a leading indent appears at once.
    charIndex = charIndex === 0 ? line.length - line.trimStart().length : charIndex;
    charIndex = Math.min(line.length, charIndex + 1 + Math.floor(Math.random() * 3));
    if (charIndex >= line.length) {
      push(line); paint();
      lineIndex = (lineIndex + 1) % lines.length; charIndex = 0;
      timer = setTimeout(tick, line.startsWith('// ') ? 380 : 110);
      return;
    }
    paint(line.slice(0, charIndex));
    timer = setTimeout(tick, 26);
  };
  const onVisibility = () => { clearTimeout(timer); if (!document.hidden) timer = setTimeout(tick, 60); };
  document.addEventListener('visibilitychange', onVisibility);
  timer = setTimeout(tick, 60);
  return {
    element,
    destroy() { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); element.remove(); },
  };
}
