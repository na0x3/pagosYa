import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { kitPath } from '@pagosya/storefront-kit';

const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2];
const block = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, 'i'))?.[0];
// The whole element opening at `start`, counting nested tags of the same name.
const element = (html: string, start: number) => {
  const open = html.slice(start).match(/^<([a-z][\w-]*)\b[^>]*>/i);
  if (!open) return undefined;
  if (/\/>$/.test(open[0]) || /^(?:area|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i.test(open[1])) return open[0];
  const tags = new RegExp(`<(\\/?)${open[1]}\\b[^>]*>`, 'gi');
  tags.lastIndex = start + open[0].length;
  for (let depth = 1, tag; (tag = tags.exec(html));) {
    if (tag[1]) depth -= 1; else if (!tag[0].endsWith('/>')) depth += 1;
    if (!depth) return html.slice(start, tags.lastIndex);
  }
};
const idPattern = (id: string) => new RegExp(`<[a-z][\\w-]*\\b[^>]*\\sid\\s*=\\s*(["'])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1[^>]*>`, 'i');
const PANEL = /(\s*)(<[a-z][\w-]*\b[^>]*\bdata-pagosya-shared-shell\s*=\s*(["'])header-panel\3[^>]*>)/i;
// Recognize the previous stock shell too, so existing stores still inherit their brand.
const normalize = (html: string) => html.replace(/href=(["'])index\.html#catalogo\1/g, 'href="productos.html"').replace(/\s+/g, ' ').trim();
const STOCK_CATALOG_ORDER = '<aside class="commerce-order" aria-label="Tu pedido"><h2>Tu pedido</h2><div data-pagosya-cart></div></aside>';
const CATALOG_STYLE = '\n.commerce-catalog{max-width:1200px;margin:0 auto;padding:clamp(20px,4vw,48px)}.commerce-catalog-title{font-family:var(--store-heading-font,var(--brand-heading-font,inherit));font-size:clamp(28px,4vw,48px);line-height:1.15;margin:0 0 24px}.commerce-catalog-return{display:inline-flex;align-items:center;min-height:44px;margin-top:24px;color:inherit;text-underline-offset:4px}\n';

/** Share the homepage's design with stock commerce pages; custom page content stays authored. */
export async function withSourceCommerceDesign(files: SourceProjectFileDto[], trustedTemplate?: string): Promise<SourceProjectFileDto[]> {
  const home = files.find(file => file.path === 'index.html')?.content;
  if (!home) return files;
  const template = trustedTemplate ?? await readFile(kitPath('product.html'), 'utf8');
  const homeHead = block(home, 'head') || '';
  const styles = [...homeHead.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]).filter(tag => {
    const href = attribute(tag, 'href');
    return attribute(tag, 'rel') === 'stylesheet' && href && files.some(file => file.path === href.replace(/^\.\//, ''));
  });
  const homeHeader = block(home.split(/<main\b/i)[0], 'header');
  // Spec 2026-10-13: a platform header is drawn on every page by withSourceHeader at save, so it is never copied here, nor its panels.
  const platformHeader = Boolean(homeHeader && /^<header\b[^>]*\bdata-pagosya-header(?=[\s=>\/])/i.test(homeHeader));
  // Panels the header opens (aria-controls) but that live elsewhere in index.html, e.g. a fullscreen menu.
  const homePanels = homeHeader && !platformHeader ? [...new Set([...homeHeader.matchAll(/\baria-controls\s*=\s*(["'])(.*?)\1/gi)].flatMap(match => match[2].split(/\s+/)).filter(Boolean))]
    .filter(id => !idPattern(id).test(homeHeader)).map(id => {
      const start = home.search(idPattern(id));
      return start < 0 ? undefined : { id, html: element(home, start) };
    }).filter((panel): panel is { id: string; html: string } => Boolean(panel?.html)) : [];
  const homeFooter = block(home.split(/<\/main>/i).at(-1)!, 'footer');
  const homeClasses = attribute(home.match(/<body\b[^>]*>/i)?.[0] || '', 'class');
  const routes = new Set(files.map(file => file.path));
  return files.map(file => {
    if (file.path === 'commerce-pages.css') {
      const css = file.content.includes('.commerce-catalog-title') ? file.content : file.content + CATALOG_STYLE;
      return { ...file, content: css.trimStart().startsWith('@layer pagosya-commerce') ? css : `@layer pagosya-commerce {\n${css}\n}\n` };
    }
    if (file.path === 'index.html' || !file.path.endsWith('.html') || file.encoding === 'base64') return file;
    // Also match productos.html/coleccion.html (data-catalog-full): they share product.html's
    // stock shell and must adopt the store's brand styles and a customized header/footer too.
    if (!/data-pagosya-(?:product|checkout)-page|data-catalog-full/.test(file.content)) return file;
    const relative = (url: string) => {
      if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(url)) return url;
      const [, path, suffix] = url.match(/^([^?#]*)(.*)$/s)!;
      return (posix.relative(posix.dirname(file.path), path || 'index.html') || 'index.html') + suffix;
    };
    const rebase = (html: string) => html.replace(/\b(href|src)\s*=\s*(["'])(.*?)\2/gi, (_match, name, quote, url) => `${name}=${quote}${relative(url)}${quote}`);
    let content = file.content;
    // Upgrade only the exact stock catalog anatomy. The cart remains available
    // through its normal trigger/checkout; it should not dominate an empty catalog.
    if (/data-catalog-full/.test(content) && content.includes(STOCK_CATALOG_ORDER)) {
      content = content.replace(STOCK_CATALOG_ORDER, '<a class="commerce-catalog-return" href="index.html">Volver a la tienda</a><div data-pagosya-cart hidden></div>')
        .replace('id="commerce-content" tabindex="-1"', 'id="commerce-content" class="commerce-catalog" tabindex="-1"')
        .replace('class="commerce-page-title"', 'class="commerce-catalog-title"');
    }
    let stockShell = false;
    for (const [name, shared] of [['header', platformHeader ? undefined : homeHeader], ['footer', homeFooter]] as const) {
      const current = block(content, name), stock = block(template, name);
      if (shared && current && stock && (normalize(current) === normalize(stock) || attribute(current.match(/^<[^>]*>/)![0], 'data-pagosya-shared-shell') === name)) {
        content = content.replace(current, () => rebase(shared.replace(new RegExp(`<${name}\\b`, 'i'), `<${name} data-pagosya-shared-shell="${name}"`)));
        if (name === 'header') {
          // Drop last save's copies first, so a re-run replaces them and an authored panel still wins.
          for (let match; (match = content.match(PANEL));) {
            const start = match.index! + match[1].length;
            content = content.slice(0, match.index) + content.slice(start + (element(content, start) ?? match[2]).length);
          }
          const panels = homePanels.filter(panel => !idPattern(panel.id).test(content)).map(panel => '\n' + rebase(panel.html.replace(/^<[a-z][\w-]*\b/i, tag => `${tag} data-pagosya-shared-shell="header-panel"`)));
          const header = block(content, 'header')!;
          if (panels.length) content = content.replace(header, () => header + panels.join(''));
        }
        stockShell = true;
      }
    }
    if (stockShell && homeClasses) content = content.replace(/<body\b[^>]*>/i, tag => {
      const classes = [...new Set(`${attribute(tag, 'class') || ''} ${homeClasses}`.trim().split(/\s+/))].join(' ');
      return /\bclass\s*=/i.test(tag) ? tag.replace(/\bclass\s*=\s*(["']).*?\1/i, `class="${classes}"`) : tag.replace('>', ` class="${classes}">`);
    });
    // Include the same local styles (and fonts) even on older or nested pages.
    const head = block(content, 'head');
    if (head) {
      const linked = [...head.matchAll(/<link\b[^>]*>/gi)].map(match => attribute(match[0], 'href'));
      const missing = styles.filter(tag => {
        const href = attribute(tag, 'href')!;
        return routes.has(href.replace(/^\.\//, '')) && !linked.some(url => url && posix.normalize(posix.join(posix.dirname(file.path), url)) === href.replace(/^\.\//, ''));
      }).map(rebase);
      if (missing.length) content = content.replace(/<\/head>/i, missing.join('\n') + '\n</head>');
    }
    return { ...file, content };
  });
}
