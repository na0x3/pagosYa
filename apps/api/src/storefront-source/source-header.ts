/**
 * The platform header library (spec docs/superpowers/specs/2026-10-13-showcase-stores-and-header-library-design.md, part B).
 * One kit template per drawn shape (packages/storefront-kit/kit/headers/<shape>.html) and one stylesheet that reads only the
 * store's tokens; the kit runtime (commerce.js) owns the menu. A shop header carries Buscar, Mi cuenta and the kit cart
 * (data-cart-open / data-cart-count); a showcase header carries the business's main action instead.
 */
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { primaryActionLink, type PrimaryAction } from './source-primary-action';
import type { SourceSitePurpose } from './source-site-purpose';
import { ORDER_EMAIL_TEMPLATE_PATH } from '../order-emails/order-email-slots';

export const HEADER_SHAPES = ['centered-split', 'menu-button', 'info-bar', 'stacked', 'shrinking', 'wordmark-band', 'side-rail', 'bottom-pill', 'overlay', 'reveal'] as const;
export type HeaderShape = typeof HEADER_SHAPES[number];
/** The calm, safe shape for a store whose drawn shape is missing or unknown. */
export const FALLBACK_HEADER_SHAPE: HeaderShape = 'menu-button';
export type HeaderLink = { href: string; label: string };
export type RenderHeaderInput = {
  shape: HeaderShape; purpose: SourceSitePurpose; storeName: string; links: HeaderLink[];
  logoPath?: string; action?: PrimaryAction; fact?: string;
  /** False when the store has no buscar.html to link. */
  search?: boolean;
  /** '../' per folder level of the page the header goes on. */
  prefix?: string;
};

const kitFiles = new Map<string, string>();
const kitText = (file: string) => {
  if (!kitFiles.has(file)) kitFiles.set(file, readFileSync(kitPath('headers', file), 'utf8').trim());
  return kitFiles.get(file)!;
};
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A page-relative link gets the folder prefix; an anchor, an absolute URL, tel: or mailto: stays as it is. */
const local = (href: string, prefix: string) => /^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(href) ? href : prefix + href;

export function renderSourceHeader(input: RenderHeaderInput): string {
  const prefix = input.prefix ?? '';
  const showcase = input.purpose !== 'shop';
  const anchor = (link: HeaderLink) => `<a href="${escape(local(link.href, prefix))}">${escape(link.label)}</a>`;
  const nav = (items: HeaderLink[], label: string) => items.length ? `<nav class="pyh-nav" aria-label="${label}">${items.map(anchor).join('')}</nav>` : '';
  const half = Math.ceil(input.links.length / 2);
  const search = !showcase && input.search !== false;
  const link = showcase ? primaryActionLink(input.action ?? { kind: 'form' }) : null;
  const actionHref = link ? escape(local(link.href, prefix)) : '';
  const parts: Record<string, string> = {
    brand: `<a class="pyh-brand" href="${escape(prefix)}index.html">${input.logoPath ? `<img class="pyh-logo" src="${escape(local(input.logoPath, prefix))}" alt="">` : ''}<span data-store-name>${escape(input.storeName)}</span></a>`,
    nav: nav(input.links, 'Principal'),
    navStart: nav(input.links.slice(0, half), 'Principal'),
    navEnd: nav(input.links.slice(half), 'Más secciones'),
    tools: showcase ? '' : `${search ? `<a class="pyh-tool" href="${escape(prefix)}buscar.html">Buscar</a>` : ''}<a class="pyh-tool" href="#" data-pagosya-account="login">Mi cuenta</a>`,
    cta: link
      ? `<a class="pyh-action" href="${actionHref}"${link.attributes}>${link.label}</a>`
      : '<button type="button" class="pyh-cart" data-cart-open><span class="pyh-cart-word">Carrito</span> <span class="pyh-cart-count" data-cart-count>0</span></button>',
    toggle: '<button type="button" class="pyh-toggle" data-pagosya-header-toggle aria-expanded="false" aria-controls="pyh-menu"><span class="pyh-toggle-bars" aria-hidden="true"></span><span class="pyh-toggle-label">Menú</span></button>',
    menu: `<div class="pyh-menu" id="pyh-menu" data-pagosya-header-menu hidden><div class="pyh-menu-panel" role="dialog" aria-modal="true" aria-label="Menú"><button type="button" class="pyh-close" data-pagosya-header-close>Cerrar</button>${input.links.length ? `<nav class="pyh-menu-nav" aria-label="Menú">${input.links.map(anchor).join('')}</nav>` : ''}<div class="pyh-menu-tools">${link
      ? `<a class="pyh-menu-link pyh-menu-action" href="${actionHref}"${link.attributes}>${link.label}</a>`
      : `${search ? `<a class="pyh-menu-link" href="${escape(prefix)}buscar.html">Buscar</a>` : ''}<a class="pyh-menu-link" href="#" data-pagosya-account="login">Mi cuenta</a>`}</div></div></div>`,
    fact: input.fact?.trim() ? `<p class="pyh-fact">${escape(input.fact.trim())}</p>` : '',
  };
  // A callback, never a replacement string: a store name containing "$&" must stay literal.
  const body = kitText(`${input.shape}.html`).replace(/\{\{(\w+)\}\}/g, (_match, key: string) => parts[key] ?? '');
  return `<header data-pagosya-header data-shape="${input.shape}" data-purpose="${showcase ? 'showcase' : 'shop'}" class="pyh pyh--${input.shape}"><style data-pagosya-header-style>${kitText('headers.css')}</style>${body}</header>`;
}

const SLOT = /<header\b[^>]*\bdata-pagosya-header(?=[\s=>\/])[^>]*>/i;
const EMPTY_SLOT = '<header data-pagosya-header></header>';
/** The kit's stock commerce header, or the copy withSourceCommerceDesign used to put there. */
const STOCK_HEADER = /<header\b[^>]*(?:\bclass\s*=\s*["']commerce-header["']|\bdata-pagosya-shared-shell\s*=\s*["']header["'])[^>]*>/i;
const SHARED_PANEL = /<([a-z][\w-]*)\b[^>]*\bdata-pagosya-shared-shell\s*=\s*["']header-panel["'][^>]*>/i;
const KIT_PAGE = /data-pagosya-(?:product|checkout)-page|data-catalog-full/;
/** The words frameInputs counts as a fact (design-engine/frame-draw.ts): hours, days, delivery and pickup. */
const FACT_WORDS = /(horario|abrimos|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d{1,2}:\d{2}|env[ií]o|delivery|entrega|recojo|retiro|pickup)/i;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
export const decodeEntities = (value: string) => value.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_match, name: string) => ENTITIES[name]);

/** The whole element that opens at `start`, counting nested tags of the same name; null when it never closes. */
export function elementAt(html: string, start: number): string | null {
  const open = html.slice(start).match(/^<([a-z][\w-]*)\b[^>]*>/i);
  if (!open) return null;
  const tags = new RegExp(`<(\\/?)${open[1]}\\b[^>]*>`, 'gi');
  tags.lastIndex = start + open[0].length;
  for (let depth = 1, tag: RegExpExecArray | null; (tag = tags.exec(html));) {
    if (tag[1]) depth -= 1; else if (!tag[0].endsWith('/>')) depth += 1;
    if (!depth) return html.slice(start, tags.lastIndex);
  }
  return null;
}

/** The element `pattern` finds, replaced by `replacement` (the whole element, nested tags included); null when absent. */
function replaceElement(html: string, pattern: RegExp, replacement: string): string | null {
  const match = pattern.exec(html);
  const whole = match ? elementAt(html, match.index) : null;
  return match && whole ? html.slice(0, match.index) + replacement + html.slice(match.index + whole.length) : null;
}

/** The sections index.html marks for the menu: data-nav-label with an id, in page order, at most six. */
function navSections(html: string): Array<{ id: string; label: string }> {
  const sections: Array<{ id: string; label: string }> = [];
  for (const match of html.matchAll(/<[a-z][\w-]*\b[^>]*\bdata-nav-label\s*=\s*(["'])(.*?)\1[^>]*>/gi)) {
    const id = match[0].match(/\sid\s*=\s*(["'])([^"']+)\1/i)?.[2];
    const label = decodeEntities(match[2]).replace(/\s+/g, ' ').trim().slice(0, 40);
    if (id && label && !sections.some(section => section.id === id)) sections.push({ id, label });
    if (sections.length === 6) break;
  }
  return sections;
}

/** The info bar's one real fact (spec: "one real fact from the brief"): a sentence naming hours or delivery, else the address. */
export function headerFact(businessInformation: unknown, locations: unknown[] = []): string {
  const text = typeof businessInformation === 'string' ? businessInformation : '';
  const sentence = text.split(/(?<=[.!?])\s+|\n+/).map(part => part.trim()).find(part => part && FACT_WORDS.test(part));
  if (sentence) return sentence.length > 90 ? `${sentence.slice(0, 88).replace(/\s+\S*$/, '')}…` : sentence;
  const place = locations.find((entry): entry is { address?: unknown } => Boolean(entry) && typeof entry === 'object');
  const address = typeof place?.address === 'string' ? place.address.trim() : '';
  return address ? `Estamos en ${address}`.slice(0, 90) : '';
}

/** Every page's platform header back to its empty slot: what an edit works on, so YAPI never edits platform markup. */
export function emptySourceHeaders<F extends { path: string; content: string; encoding?: string }>(files: F[]): F[] {
  return files.map(file => {
    if (file.encoding === 'base64' || !/\.html$/i.test(file.path)) return file;
    const content = replaceElement(file.content, SLOT, EMPTY_SLOT);
    return content === null || content === file.content ? file : { ...file, content };
  });
}

export type SourceHeaderInput = {
  /** The drawn shape (frame-draw.json `header`); anything else falls back to FALLBACK_HEADER_SHAPE. */
  shape?: string; purpose: SourceSitePurpose; storeName: string; logoPath?: string; action?: PrimaryAction; fact?: string;
  /** Pages the platform adds after this step, so the header may link them (buscar.html, contacto.html…). */
  platformPages?: string[];
  /** The store's saved files: a page whose saved version had the slot gets it back if an edit removed it. */
  previous?: Array<{ path: string; content: string }>;
};

/**
 * The platform header on every HTML page of a static store (spec 2026-10-13, B2): the drawn shape, rendered from the store's
 * name, logo, purpose and action and the sections index.html marks with data-nav-label. A store whose index.html has no slot
 * (an older store) comes back untouched. Kit commerce pages trade their stock or copied header for the slot. Idempotent.
 */
export function withSourceHeader<F extends { path: string; content: string; encoding?: string }>(files: F[], input: SourceHeaderInput): { files: F[]; rendered: boolean; shape: HeaderShape; fallback: boolean; missing: string[] } {
  const known = (HEADER_SHAPES as readonly string[]).includes(input.shape ?? '');
  const shape = known ? input.shape as HeaderShape : FALLBACK_HEADER_SHAPE;
  const index = files.find(file => file.path === 'index.html' && file.encoding !== 'base64');
  if (!index || !SLOT.test(index.content)) return { files, rendered: false, shape, fallback: !known, missing: [] };
  const sections = navSections(index.content);
  const exists = new Set([...files.map(file => file.path), ...(input.platformPages ?? [])]);
  const pages: Array<[string, string]> = input.purpose === 'shop' ? [['productos.html', 'Productos'], ['nosotros.html', 'Nosotros'], ['contacto.html', 'Contacto']] : [['nosotros.html', 'Nosotros'], ['contacto.html', 'Contacto']];
  const pageLinks = pages.filter(([path]) => exists.has(path)).map(([href, label]) => ({ href, label }));
  const missing: string[] = [];
  const out = files.map(file => {
    if (file.encoding === 'base64' || !/\.html$/i.test(file.path) || file.path === ORDER_EMAIL_TEMPLATE_PATH) return file;
    let content = file.content;
    if (!SLOT.test(content) && KIT_PAGE.test(content)) content = replaceElement(content, STOCK_HEADER, EMPTY_SLOT) ?? content;
    if (!SLOT.test(content) && input.previous?.some(saved => saved.path === file.path && SLOT.test(saved.content))) content = content.replace(/<body\b[^>]*>/i, tag => `${tag}${EMPTY_SLOT}`);
    for (let panel = SHARED_PANEL.exec(content); panel; panel = SHARED_PANEL.exec(content)) {
      const whole = elementAt(content, panel.index) ?? panel[0];
      content = content.slice(0, panel.index) + content.slice(panel.index + whole.length);
    }
    const home = file.path === 'index.html';
    const links = sections.length ? sections.map(section => ({ href: home ? `#${section.id}` : `index.html#${section.id}`, label: section.label })) : pageLinks;
    const header = renderSourceHeader({ shape, purpose: input.purpose, storeName: input.storeName, links, logoPath: input.logoPath, action: input.action, fact: input.fact, search: exists.has('buscar.html'), prefix: '../'.repeat(file.path.split('/').length - 1) });
    const drawn = replaceElement(content, SLOT, header);
    if (drawn === null) { missing.push(file.path); return file; }
    return drawn === file.content ? file : { ...file, content: drawn };
  });
  return { files: out, rendered: true, shape, fallback: !known, missing };
}

/** What a static edit of a store that has the slot must know: the header is the platform's, the menu comes from data-nav-label. */
export const SOURCE_PLATFORM_HEADER_EDIT = 'PLATFORM HEADER: <header data-pagosya-header></header> on every page is filled by the platform at save time with the store name, the menu and the store\'s actions. Leave that element empty and in place; never write, restyle or remove it. To change the menu, add or remove data-nav-label="…" (with an id) on the sections of index.html; to change its colours or fonts, change --store-background, --store-foreground, --store-accent, --store-accent-foreground, --store-heading-font or --store-body-font in styles.css.';
