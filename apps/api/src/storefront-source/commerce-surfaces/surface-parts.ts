import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';

/** Spec 2026-10-15 free commerce surfaces: the six parts YAPI designs, each a kit template (T1 + the checkout template). */
export const SURFACE_PARTS = ['card', 'productPage', 'cart', 'cartLine', 'added', 'checkout'] as const;
export type SurfacePart = typeof SURFACE_PARTS[number];
export type SurfaceTemplate = { part: SurfacePart; html: string; css: string };
/** JSON, never .html: an .html file would be listed as a store page (sitemap, page pickers, agent context). */
export const COMMERCE_TEMPLATES_FILE = 'commerce-templates.json';

export const SURFACE_CONTRACT: Record<SurfacePart, { attr: string; slotAttr: string; required: string[]; optional: string[]; controls: Array<{ tag: string; attr: string }> }> = {
  card: { attr: 'data-pagosya-product-template', slotAttr: 'data-product-field', required: ['name', 'price'], optional: ['image', 'description', 'options', 'badge'], controls: [{ tag: 'a', attr: 'data-product-link' }, { tag: 'button', attr: 'data-product-add' }] },
  productPage: { attr: 'data-pagosya-product-page-template', slotAttr: 'data-product-slot', required: ['gallery', 'title', 'pricing', 'buy'], optional: ['category', 'description', 'highlights', 'info', 'delivery', 'rating', 'reviews', 'bundles', 'related', 'breadcrumb'], controls: [] },
  cart: { attr: 'data-pagosya-cart-template', slotAttr: 'data-cart-slot', required: ['lines', 'total', 'action'], optional: ['suggestions', 'savings', 'note', 'policies', 'empty'], controls: [{ tag: 'button', attr: 'data-cart-close' }] },
  cartLine: { attr: 'data-pagosya-cart-line-template', slotAttr: 'data-cart-field', required: ['name', 'line-total', 'quantity'], optional: ['photo', 'option', 'unit', 'stock', 'remove'], controls: [] },
  added: { attr: 'data-pagosya-added-template', slotAttr: 'data-added-field', required: ['message'], optional: ['name', 'photo'], controls: [{ tag: 'button', attr: 'data-cart-open' }] },
  checkout: { attr: 'data-pagosya-checkout-template', slotAttr: 'data-checkout-slot', required: ['heading', 'review'], optional: ['back', 'status'], controls: [] },
};
export const SURFACE_LABELS: Record<SurfacePart, string> = { card: 'tarjetas de producto', productPage: 'página de producto', cart: 'carrito', cartLine: 'líneas del carrito', added: 'aviso al agregar', checkout: 'pago' };

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
type Template = DefaultTreeAdapterMap['template'];
const isElement = (node: Node): node is Element => 'tagName' in node;
function walk(node: Node, visit: (el: Element) => void) {
  if (isElement(node)) visit(node);
  for (const child of ('childNodes' in node ? node.childNodes : [])) walk(child, visit);
  if (isElement(node) && node.tagName === 'template') walk((node as Template).content as unknown as Node, visit);
}
function textOf(node: Node): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value;
  const own = 'childNodes' in node ? node.childNodes.map(textOf).join(' ') : '';
  return isElement(node) && node.tagName === 'template' ? own + textOf((node as Template).content as unknown as Node) : own;
}
/** Review I9: an allowlist, not a denylist. Templates hold layout and decoration; the kit brings every control and form. */
const TAGS = new Set(['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'footer', 'aside', 'nav', 'main', 'figure', 'figcaption', 'ul', 'ol', 'li', 'a', 'button', 'img', 'strong', 'em', 'small', 'b', 'i', 'br', 'hr', 'blockquote', 'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'ellipse']);
const ATTRS = new Set(['class', 'role', 'alt', 'title', 'href', 'src', 'style', 'hidden', 'type', 'loading', 'decoding', 'width', 'height', 'viewbox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'opacity', 'xmlns', 'focusable']);
const IMG_SLOTS = new Set(['photo', 'image']);
export const MAX_PART_HTML = 14_000;
export const MAX_PART_CSS = 8_000;
const PRICE = /(?:\bBs\.?|\bBOB|\$)\s?\d[\d.,]*|\d[\d.,]*\s?(?:Bs|BOB)\b/i;

/** CSS that reaches outside the page: @import, a url() other than an inline data: image, expression(). */
function unsafeCss(css: string): boolean {
  return /@import|expression\s*\(/i.test(css) || [...css.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)].some(m => !/^data:image\//i.test(m[2].trim()));
}
/** Selectors that do not use one of the template's own classes: a part's CSS may not restyle the store or the payment box. */
function unscopedSelectors(css: string, classes: Set<string>): string[] {
  const out: string[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const visit = (block: string) => {
    let depth = 0, start = 0, head = '';
    for (let i = 0; i < block.length; i++) {
      const c = block[i];
      if (c === '{') { if (depth === 0) { head = block.slice(start, i).trim(); start = i + 1; } depth++; }
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const body = block.slice(start, i);
          if (/^@(?:media|supports|container|layer|starting-style|scope)\b/i.test(head)) visit(body);
          else if (!/^@(?:keyframes|-webkit-keyframes|font-face|property)\b/i.test(head)) {
            for (const selector of head.split(',').map(x => x.trim()).filter(Boolean)) {
              const own = [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].some(m => classes.has(m[1]));
              if (!own) out.push(selector.slice(0, 60));
            }
          }
          start = i + 1;
        }
      }
    }
  };
  visit(text);
  return out;
}

/** Static checks before any browser runs: the template, its required slots and controls, nothing executable, no typed price. */
export function validateSurfaceTemplate(t: SurfaceTemplate): string[] {
  const contract = SURFACE_CONTRACT[t.part];
  const label = SURFACE_LABELS[t.part];
  const roots = parseFragment(t.html).childNodes.filter(isElement);
  const template = roots.length === 1 && roots[0].tagName === 'template' && roots[0].attrs.some(a => a.name === contract.attr) ? roots[0] as Template : undefined;
  if (!template) return [`La plantilla de ${label} debe ser un solo <template ${contract.attr}>.`];
  const reasons: string[] = [];
  // Six parts at these sizes stay well under the 180,000-character limit on each store file (review I8).
  if (t.html.length > MAX_PART_HTML) reasons.push(`La plantilla de ${label} es demasiado grande.`);
  if (t.css.length > MAX_PART_CSS) reasons.push(`El CSS de ${label} es demasiado grande.`);
  if (template.content.childNodes.filter(n => isElement(n as Node)).length !== 1) reasons.push(`La plantilla de ${label} necesita un solo elemento raíz.`);
  const slots = new Set<string>(); const seen: Array<{ tag: string; attrs: string[] }> = []; const classes = new Set<string>();
  const tags = new Set<string>(); const attrs = new Set<string>();
  let script = false, handler = false, jsLink = false, externalImage = false, unsafeStyle = false;
  walk(template.content as unknown as Node, el => {
    if (el.tagName === 'script') script = true;
    else if (!TAGS.has(el.tagName)) tags.add(el.tagName);
    for (const attr of el.attrs) {
      const name = attr.name.toLowerCase();
      // parse5 decodes entities, and browsers drop tabs and newlines in URLs: «java&#9;script:» is javascript:.
      const value = attr.value.replace(/[\s\u0000-\u001f]/g, '');
      if (/^on/.test(name)) handler = true;
      else if (!ATTRS.has(name) && !/^(?:aria|data)-[a-z0-9-]+$/.test(name)) attrs.add(name);
      if (/^javascript:/i.test(value)) jsLink = true;
      if (name === 'src' && value && !/^data:image\//i.test(value) && /^[a-z][a-z0-9+.-]*:|^\/\//i.test(value)) externalImage = true;
      if (name === 'style' && unsafeCss(attr.value)) unsafeStyle = true;
      if (name === 'class') for (const cls of attr.value.split(/\s+/).filter(Boolean)) classes.add(cls);
      if (attr.name === contract.slotAttr) {
        slots.add(attr.value);
        if (IMG_SLOTS.has(attr.value) && el.tagName !== 'img') reasons.push(`El espacio «${attr.value}» de ${label} debe ser un <img>.`);
      }
    }
    seen.push({ tag: el.tagName, attrs: el.attrs.map(a => a.name) });
  });
  for (const slot of contract.required) if (!slots.has(slot)) reasons.push(`Falta el espacio «${slot}» en ${label}.`);
  for (const control of contract.controls) if (!seen.some(c => c.tag === control.tag && c.attrs.includes(control.attr))) reasons.push(`Falta el control ${control.tag}[${control.attr}] en ${label}.`);
  if (script) reasons.push('Las plantillas no llevan scripts.');
  for (const tag of tags) reasons.push(`Las plantillas no llevan <${tag}>.`);
  for (const attr of attrs) reasons.push(`Las plantillas no llevan el atributo ${attr}.`);
  if (handler) reasons.push('Las plantillas no llevan atributos on*.');
  if (jsLink) reasons.push('Las plantillas no llevan enlaces javascript:.');
  if (externalImage) reasons.push('Las plantillas no cargan imágenes externas.');
  if (unsafeStyle) reasons.push('El CSS no puede importar hojas ni cargar URLs externas.');
  const typed = textOf(template as unknown as Node).match(PRICE);
  if (typed) reasons.push(`Las plantillas no escriben precios: «${typed[0].trim()}».`);
  if (t.css.includes('<')) reasons.push('El CSS no puede llevar «<».');
  if (/\bcontent\s*:[^;}]*\d/i.test(t.css)) reasons.push('El CSS no escribe precios ni números con content.');
  const outside = unscopedSelectors(t.css, classes);
  if (outside.length) reasons.push(`El CSS de ${label} solo puede usar las clases de su plantilla: «${outside.slice(0, 3).join('», «')}».`);
  if (unsafeCss(t.css)) reasons.push('El CSS no puede importar hojas ni cargar URLs externas.');
  return reasons;
}

/** The store's saved parts: { version: 1, parts: [{ part, html, css }] }. */
export function composeTemplatesFile(templates: SurfaceTemplate[]): string {
  return JSON.stringify({ version: 1, parts: templates.map(({ part, html, css }) => ({ part, html, css })) });
}
export function readTemplatesFile(content: string): SurfaceTemplate[] {
  let raw: any;
  try { raw = JSON.parse(content); } catch { return []; }
  if (!raw || raw.version !== 1 || !Array.isArray(raw.parts)) return [];
  return raw.parts.filter((p: any) => p && (SURFACE_PARTS as readonly string[]).includes(p.part) && typeof p.html === 'string' && typeof p.css === 'string')
    .map((p: any) => ({ part: p.part as SurfacePart, html: p.html, css: p.css }));
}
/** What a served page carries: each part's scoped CSS and its <template>. */
export function templatesMarkup(templates: SurfaceTemplate[]): string {
  // '<' never reaches a <style>: validated out, and escaped here as well (review I9).
  return templates.map(t => `<style data-commerce-part="${t.part}">${t.css.replace(/</g, '\\3c ')}</style>${t.html}`).join('\n');
}
