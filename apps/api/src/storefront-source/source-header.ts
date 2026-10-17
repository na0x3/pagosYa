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
import type { IconSlot, StoreControls } from './store-controls';
import { patchConfigFile, readConfigFile } from './store-look';

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
  /** The store's control language (spec 2026-10-14 store controls); without one the header is drawn exactly as before. */
  controls?: StoreControls;
  /** A showcase whose merchant asked for the account button (config.js header.account, 2026-10-16): «Mi cuenta» in the menu,
   *  in the bar of the shapes that have tools and on the side rail. A shop always has it; without it a showcase is as before. */
  account?: boolean;
};

/** The side rail's account button, upright like the rail's main action when it is a word. Only on a rail that has one, so
 *  every other header keeps its bytes. */
const RAIL_ACCOUNT_CSS = '@media (min-width:861px){.pyh--side-rail .pyh-rail-account{justify-content:center;width:44px;min-height:44px}.pyh--side-rail .pyh-rail-account:not(:has(svg)){writing-mode:vertical-rl;transform:rotate(180deg);padding:12px 0;font-size:14px}}';

const kitFiles = new Map<string, string>();
const kitText = (file: string) => {
  if (!kitFiles.has(file)) kitFiles.set(file, readFileSync(kitPath('headers', file), 'utf8').trim());
  return kitFiles.get(file)!;
};
let controlsCss: string | undefined;
/** The controls stylesheet (spec 2026-10-14), read once per process like the header templates; it rides in the header beside
 *  headers.css, so it reaches every page the platform header is drawn on, kit pages included. */
const controlsStyle = () => (controlsCss ??= readFileSync(kitPath('controls.css'), 'utf8').trim());
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A page-relative link gets the folder prefix; an anchor, an absolute URL, tel: or mailto: stays as it is. */
const local = (href: string, prefix: string) => /^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(href) ? href : prefix + href;

/** One record icon as inline SVG: path data only (sanitizeControls checked it), filled with the control's own colour. */
const controlIcon = (controls: StoreControls, slot: IconSlot) => {
  const d = controls.icons[slot];
  return d ? `<svg class="ctl-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" clip-rule="evenodd"><path fill="currentColor" fill-rule="evenodd" d="${escape(d)}"/></svg>` : '';
};
/** The inner layer that carries the shape: the icon and/or the word as the layout says; a word whenever the icon is missing. */
const controlFace = (icon: string, word: string, layout: string, wordClass = 'ctl-word') => {
  const drawIcon = layout !== 'word' && icon !== '', drawWord = layout !== 'icon' || !drawIcon;
  return `<span class="ctl-face">${drawIcon ? icon : ''}${drawWord ? `<span class="${wordClass}" aria-hidden="true">${escape(word)}</span>` : ''}</span>`;
};
/** The record on the header element: enums as attributes, numbers as the --ctl-* variables controls.css reads. */
const controlAttributes = (controls: StoreControls) => {
  const { shape } = controls;
  return ` data-controls-outline="${shape.outline}" data-controls-border="${shape.border}" data-controls-fill="${shape.fill}" data-controls-colour="${shape.colour}" data-controls-badge="${controls.badge}" style="--ctl-corner:${shape.corner}px;--ctl-notch:${shape.notch}px;--ctl-tilt:${shape.tilt}deg;--ctl-weight:${shape.weight}px"`;
};

export function renderSourceHeader(input: RenderHeaderInput): string {
  const prefix = input.prefix ?? '';
  const showcase = input.purpose !== 'shop';
  const account = showcase && input.account === true;
  const accountLink = (className: string) => `<a class="${className}" href="#" data-pagosya-account="login">Mi cuenta</a>`;
  const anchor = (link: HeaderLink) => `<a href="${escape(local(link.href, prefix))}">${escape(link.label)}</a>`;
  const nav = (items: HeaderLink[], label: string) => items.length ? `<nav class="pyh-nav" aria-label="${label}">${items.map(anchor).join('')}</nav>` : '';
  const half = Math.ceil(input.links.length / 2);
  const search = !showcase && input.search !== false;
  const link = showcase ? primaryActionLink(input.action ?? { kind: 'form' }) : null;
  const actionHref = link ? escape(local(link.href, prefix)) : '';
  const menuTools = link
    ? `<a class="pyh-menu-link pyh-menu-action" href="${actionHref}"${link.attributes}>${link.label}</a>${account ? accountLink('pyh-menu-link') : ''}`
    : `${search ? `<a class="pyh-menu-link" href="${escape(prefix)}buscar.html">Buscar</a>` : ''}<a class="pyh-menu-link" href="#" data-pagosya-account="login">Mi cuenta</a>`;
  const menu = (close: string) => `<div class="pyh-menu" id="pyh-menu" data-pagosya-header-menu hidden><div class="pyh-menu-panel" role="dialog" aria-modal="true" aria-label="Menú">${close}${input.links.length ? `<nav class="pyh-menu-nav" aria-label="Menú">${input.links.map(anchor).join('')}</nav>` : ''}<div class="pyh-menu-tools">${menuTools}</div></div></div>`;
  const parts: Record<string, string> = {
    brand: `<a class="pyh-brand" href="${escape(prefix)}index.html">${input.logoPath ? `<img class="pyh-logo" src="${escape(local(input.logoPath, prefix))}" alt="">` : ''}<span data-store-name>${escape(input.storeName)}</span></a>`,
    nav: nav(input.links, 'Principal'),
    navStart: nav(input.links.slice(0, half), 'Principal'),
    navEnd: nav(input.links.slice(half), 'Más secciones'),
    tools: showcase ? (account ? accountLink('pyh-tool') : '') : `${search ? `<a class="pyh-tool" href="${escape(prefix)}buscar.html">Buscar</a>` : ''}<a class="pyh-tool" href="#" data-pagosya-account="login">Mi cuenta</a>`,
    cta: link
      ? `<a class="pyh-action" href="${actionHref}"${link.attributes}>${link.label}</a>`
      : '<button type="button" class="pyh-cart" data-cart-open><span class="pyh-cart-word">Carrito</span> <span class="pyh-cart-count" data-cart-count>0</span></button>',
    toggle: '<button type="button" class="pyh-toggle" data-pagosya-header-toggle aria-expanded="false" aria-controls="pyh-menu"><span class="pyh-toggle-bars" aria-hidden="true"></span><span class="pyh-toggle-label">Menú</span></button>',
    menu: menu('<button type="button" class="pyh-close" data-pagosya-header-close>Cerrar</button>'),
    fact: input.fact?.trim() ? `<p class="pyh-fact">${escape(input.fact.trim())}</p>` : '',
    account: account ? '<a class="pyh-tool pyh-rail-account" href="#" data-pagosya-account="login" aria-label="Mi cuenta"><span class="pyh-rail-word">Mi cuenta</span></a>' : '',
  };
  // Spec 2026-10-14 store controls: the record's icons, words and layout on the cart, account, search, menu and close controls.
  // The hooks the kit and shoppers rely on (data-cart-open, data-cart-count, data-pagosya-account, the menu's toggle and close,
  // accessible names) stay exactly as they are; screen readers hear «Carrito, N productos» and «Mi cuenta», never the record's words.
  const controls = input.controls;
  if (controls) {
    const { layout, words } = controls;
    // Label in Name (WCAG 2.5.3): when the face shows a word, the accessible name starts with that same word.
    const shown = (icon: string, layout: string) => layout !== 'icon' || icon === '';
    const cartWord = words.cart ?? 'Carrito';
    const cartIcon = controlIcon(controls, 'cart'), accountIcon = controlIcon(controls, 'account');
    const cartName = shown(cartIcon, layout.cart) ? cartWord : 'Carrito';
    const accountWord = words.account ?? 'Mi cuenta';
    const accountName = shown(accountIcon, layout.account) ? accountWord : 'Mi cuenta';
    const accountTool = `<a class="pyh-tool" href="#" data-pagosya-account="login" aria-label="${escape(accountName)}" data-ctl="account">${controlFace(accountIcon, accountWord, layout.account)}</a>`;
    parts.tools = showcase ? (account ? accountTool : '') : `${search ? `<a class="pyh-tool" href="${escape(prefix)}buscar.html" aria-label="Buscar" data-ctl="search">${controlFace(controlIcon(controls, 'search'), 'Buscar', layout.account)}</a>` : ''}${accountTool}`;
    // The rail is 88px wide: its account button is the icon alone, or the word when the record has no account icon.
    if (account) parts.account = `<a class="pyh-tool pyh-rail-account" href="#" data-pagosya-account="login" aria-label="Mi cuenta" data-ctl="account">${controlFace(accountIcon, accountWord, 'icon')}</a>`;
    if (!link) parts.cta = `<button type="button" class="pyh-cart" data-cart-open data-ctl="cart">${controlFace(cartIcon, cartWord, layout.cart, 'ctl-word pyh-cart-word')}<span class="ctl-sr">${escape(cartName)}, </span><span class="pyh-cart-count ctl-badge" data-cart-count data-empty>0</span><span class="ctl-sr" data-ctl-unit> productos</span></button>`;
    parts.toggle = `<button type="button" class="pyh-toggle" data-pagosya-header-toggle aria-expanded="false" aria-controls="pyh-menu" data-ctl="menu"><span class="ctl-face">${controlIcon(controls, 'menu') || '<span class="pyh-toggle-bars" aria-hidden="true"></span>'}<span class="pyh-toggle-label ctl-word">Menú</span></span></button>`;
    parts.menu = menu(`<button type="button" class="pyh-close" data-pagosya-header-close aria-label="Cerrar" data-ctl="close">${controlFace(controlIcon(controls, 'close'), 'Cerrar', 'icon+word')}</button>`);
  }
  // A callback, never a replacement string: a store name containing "$&" must stay literal.
  const body = kitText(`${input.shape}.html`).replace(/\{\{(\w+)\}\}/g, (_match, key: string) => parts[key] ?? '');
  const railAccount = account && input.shape === 'side-rail' ? `<style data-pagosya-header-account-style>${RAIL_ACCOUNT_CSS}</style>` : '';
  return `<header data-pagosya-header data-shape="${input.shape}" data-purpose="${showcase ? 'showcase' : 'shop'}" class="pyh pyh--${input.shape}"${controls ? controlAttributes(controls) : ''}><style data-pagosya-header-style>${kitText('headers.css')}</style>${controls ? `<style data-pagosya-controls-style>${controlsStyle()}</style>` : ''}${railAccount}${body}</header>`;
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

/** A menu label compared without case or accents («Contáctanos» is not «Contacto», but «CONTACTO» is). */
const menuKey = (label: string) => label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

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

/** Does a saved store carry the platform header (spec 2026-10-13)? Its controls are then the platform's to draw (spec 2026-10-14). */
export function hasPlatformHeader(files: ReadonlyArray<{ path: string; content: string; encoding?: string }>): boolean {
  return files.some(file => file.encoding !== 'base64' && /\.html$/i.test(file.path) && SLOT.test(file.content));
}

export type SourceHeaderInput = {
  /** The drawn shape (frame-draw.json `header`); anything else falls back to FALLBACK_HEADER_SHAPE. */
  shape?: string; purpose: SourceSitePurpose; storeName: string; logoPath?: string; action?: PrimaryAction; fact?: string;
  /** Pages the platform adds after this step, so the header may link them (buscar.html, contacto.html…). */
  platformPages?: string[];
  /** The store's saved files: a page whose saved version had the slot gets it back if an edit removed it, and the header keeps
   *  the logo the saved one showed when this save names none. */
  previous?: Array<{ path: string; content: string }>;
  /** This build owns the header (a Sep-5 author run): a page the author gave its own header, or none, gets the slot. */
  claim?: boolean;
  /** The store's control language (spec 2026-10-14); drawn into every page's header. */
  controls?: StoreControls;
  /** The showcase account button; by default config.js header.account, this save's or else the saved one. */
  account?: boolean;
};

/** The slot in place of the page's own top header (the first <header> before <main>), or first in <body> when it has none. */
function claimSlot(html: string): string {
  const main = html.search(/<main\b/i);
  const own = /<header\b[^>]*>/i.exec(html);
  if (own && (main < 0 || own.index < main)) {
    const whole = elementAt(html, own.index);
    if (whole) return html.slice(0, own.index) + EMPTY_SLOT + html.slice(own.index + whole.length);
  }
  return html.replace(/<body\b[^>]*>/i, tag => `${tag}${EMPTY_SLOT}`);
}

/**
 * The platform header on every HTML page of a static store (spec 2026-10-13, B2): the drawn shape, rendered from the store's
 * name, logo, purpose and action and the sections index.html marks with data-nav-label. A store whose index.html has no slot
 * (an older store) comes back untouched. Kit commerce pages trade their stock or copied header for the slot. Idempotent.
 */
export function withSourceHeader<F extends { path: string; content: string; encoding?: string }>(files: F[], input: SourceHeaderInput): { files: F[]; rendered: boolean; shape: HeaderShape; fallback: boolean; missing: string[] } {
  const known = (HEADER_SHAPES as readonly string[]).includes(input.shape ?? '');
  const shape = known ? input.shape as HeaderShape : FALLBACK_HEADER_SHAPE;
  const index = files.find(file => file.path === 'index.html' && file.encoding !== 'base64');
  const hadSlot = (path: string) => Boolean(input.previous?.some(saved => saved.path === path && SLOT.test(saved.content)));
  // The header is the platform's when this build claims it or the saved home had the slot (an edit may have removed it there).
  if (!index || !(SLOT.test(index.content) || input.claim || hadSlot('index.html'))) return { files, rendered: false, shape, fallback: !known, missing: [] };
  const savedLogo = input.previous?.find(saved => saved.path === 'index.html')?.content.match(/<img class="pyh-logo" src="([^"]+)"/)?.[1];
  const logoPath = input.logoPath ?? (savedLogo ? decodeEntities(savedLogo) : undefined);
  const sections = navSections(SLOT.test(index.content) ? index.content : claimSlot(index.content));
  const exists = new Set([...files.map(file => file.path), ...(input.platformPages ?? [])]);
  const pages: Array<[string, string]> = input.purpose === 'shop' ? [['productos.html', 'Productos'], ['nosotros.html', 'Nosotros'], ['contacto.html', 'Contacto']] : [['nosotros.html', 'Nosotros'], ['contacto.html', 'Contacto']];
  const pageLinks = pages.filter(([path]) => exists.has(path)).map(([href, label]) => ({ href, label }));
  const account = input.account ?? headerAccountOn(files) ?? headerAccountOn(input.previous ?? []) ?? false;
  const missing: string[] = [];
  const out = files.map(file => {
    if (file.encoding === 'base64' || !/\.html$/i.test(file.path) || file.path === ORDER_EMAIL_TEMPLATE_PATH) return file;
    let content = file.content;
    if (!SLOT.test(content) && KIT_PAGE.test(content)) content = replaceElement(content, STOCK_HEADER, EMPTY_SLOT) ?? content;
    if (!SLOT.test(content) && (input.claim || hadSlot(file.path))) content = claimSlot(content);
    for (let panel = SHARED_PANEL.exec(content); panel; panel = SHARED_PANEL.exec(content)) {
      const whole = elementAt(content, panel.index) ?? panel[0];
      content = content.slice(0, panel.index) + content.slice(panel.index + whole.length);
    }
    const home = file.path === 'index.html';
    // The standard pages come first so every page reaches them; a home section named like one of them is not repeated.
    const pageLabels = new Set(pageLinks.map(link => menuKey(link.label)));
    const sectionLinks = sections.filter(section => !pageLabels.has(menuKey(section.label))).map(section => ({ href: home ? `#${section.id}` : `index.html#${section.id}`, label: section.label }));
    const links = [...pageLinks, ...sectionLinks].slice(0, 6);
    const header = renderSourceHeader({ shape, purpose: input.purpose, storeName: input.storeName, links, logoPath, action: input.action, fact: input.fact, search: exists.has('buscar.html'), prefix: '../'.repeat(file.path.split('/').length - 1), ...(input.controls ? { controls: input.controls } : {}), ...(account ? { account } : {}) });
    const drawn = replaceElement(content, SLOT, header);
    if (drawn === null) { missing.push(file.path); return file; }
    return drawn === file.content ? file : { ...file, content: drawn };
  });
  return { files: out, rendered: true, shape, fallback: !known, missing };
}

/** What a static edit of a store that has the slot must know: the header is the platform's, the menu comes from data-nav-label,
 *  and it is the only menu (2026-10-16: baek got a fixed sidebar of YAPI's own, drawn under the platform's side rail). */
export const SOURCE_PLATFORM_HEADER_EDIT = 'PLATFORM HEADER: <header data-pagosya-header></header> on every page is filled by the platform at save time with the store name, the menu and the store\'s actions. Leave that element empty and in place; never write, restyle or remove it. To change the menu, add or remove data-nav-label="…" (with an id) on the sections of index.html; to change its colours or fonts, change --store-background, --store-foreground, --store-accent, --store-accent-foreground, --store-heading-font or --store-body-font in styles.css. It is the store\'s only menu: never build a header, top bar, sidebar or menu of your own (fixed, sticky or in the page), and never place anything under or beside it to stand in for it. A login or «Mi cuenta» button in the header is the platform\'s as well: it appears when the merchant asks for it, so never draw one yourself. When the merchant asks the menu for something these levers cannot do, say so in your reply instead of building it.';

/** config.js header.account (2026-10-16): the showcase account button on or off; undefined without config.js or a choice. */
export function headerAccountOn(files: ReadonlyArray<{ path: string; content: string }>): boolean | undefined {
  const value = readConfigFile(files).header?.account;
  return typeof value === 'boolean' ? value : undefined;
}

/** config.js with header.account set; a save without config.js takes the saved one first, so the choice reaches the store. */
export function withHeaderAccountConfig<T extends { path: string; content: string }>(files: T[], previous: ReadonlyArray<{ path: string; content: string }>, show: boolean): T[] {
  const saved = previous.find(file => file.path === 'config.js');
  const withConfig = files.some(file => file.path === 'config.js') || !saved ? files : [...files, { ...saved } as unknown as T];
  return patchConfigFile(withConfig, config => ({ ...config, header: { ...(config.header ?? {}), account: show } }));
}

const ACCOUNT_ASK = /(?<!\p{L})(log ?in|sign ?in|iniciar sesi[oó]n|inicio de sesi[oó]n|(?:mi|su|tu) cuenta|cuentas? de (?:clientes?|usuarios?)|acceso (?:de|para) clientes|[ií]cono de (?:usuario|cuenta))(?!\p{L})/iu;
const ACCOUNT_PLACE = /(?<!\p{L})(sidebar|barra|men[uú]|encabezado|header|cabecera|navegaci[oó]n|arriba|bot[oó]n|botones|[ií]cono|icon)/iu;
const ACCOUNT_REMOVE = /(?<!\p{L})(quita|qu[ií]ta(?:le|lo)|elimina|saca|oculta|borra|remueve|sin)(?!\p{L})/iu;
/** The merchant's words ask for the header's account button (true), ask to take it away (false), or say nothing of it. */
export function instructionAsksHeaderAccount(text: string): boolean | undefined {
  const asked = ACCOUNT_ASK.exec(text);
  if (!asked || !ACCOUNT_PLACE.test(text)) return undefined;
  return !ACCOUNT_REMOVE.test(text.slice(Math.max(0, asked.index - 40), asked.index));
}

/** A style card's hero with the platform header in place of the one it was drawn with: the cards preview what will be built. */
export function swapPreviewHeader(html: string, header: string): string {
  return replaceElement(html, /<header\b[^>]*>/i, header) ?? header + html;
}
