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
const PRICE = /(?:\bBs\.?|\bBOB|\$)\s?\d[\d.,]*|\d[\d.,]*\s?(?:Bs|BOB)\b/i;

/** Static checks before any browser runs: the template, its required slots and controls, nothing executable, no typed price. */
export function validateSurfaceTemplate(t: SurfaceTemplate): string[] {
  const contract = SURFACE_CONTRACT[t.part];
  const label = SURFACE_LABELS[t.part];
  const roots = parseFragment(t.html).childNodes.filter(isElement);
  const template = roots.length === 1 && roots[0].tagName === 'template' && roots[0].attrs.some(a => a.name === contract.attr) ? roots[0] as Template : undefined;
  if (!template) return [`La plantilla de ${label} debe ser un solo <template ${contract.attr}>.`];
  const reasons: string[] = [];
  if (template.content.childNodes.filter(n => isElement(n as Node)).length !== 1) reasons.push(`La plantilla de ${label} necesita un solo elemento raíz.`);
  const slots = new Set<string>(); const seen: Array<{ tag: string; attrs: string[] }> = [];
  let script = false, handler = false, jsLink = false;
  walk(template.content as unknown as Node, el => {
    if (el.tagName === 'script') script = true;
    for (const attr of el.attrs) {
      if (/^on/i.test(attr.name)) handler = true;
      if (/^\s*javascript:/i.test(attr.value)) jsLink = true;
      if (attr.name === contract.slotAttr) slots.add(attr.value);
    }
    seen.push({ tag: el.tagName, attrs: el.attrs.map(a => a.name) });
  });
  for (const slot of contract.required) if (!slots.has(slot)) reasons.push(`Falta el espacio «${slot}» en ${label}.`);
  for (const control of contract.controls) if (!seen.some(c => c.tag === control.tag && c.attrs.includes(control.attr))) reasons.push(`Falta el control ${control.tag}[${control.attr}] en ${label}.`);
  if (script) reasons.push('Las plantillas no llevan scripts.');
  if (handler) reasons.push('Las plantillas no llevan atributos on*.');
  if (jsLink) reasons.push('Las plantillas no llevan enlaces javascript:.');
  const typed = textOf(template as unknown as Node).match(PRICE);
  if (typed) reasons.push(`Las plantillas no escriben precios: «${typed[0].trim()}».`);
  if (/@import|url\(\s*['"]?\s*(?:https?:)?\/\//i.test(t.css) || /expression\s*\(/i.test(t.css)) reasons.push('El CSS no puede importar hojas ni cargar URLs externas.');
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
  return templates.map(t => `<style data-commerce-part="${t.part}">${t.css.replace(/<\/style/gi, '')}</style>${t.html}`).join('\n');
}
