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
