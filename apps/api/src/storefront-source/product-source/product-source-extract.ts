/** A product page's HTML → the listing YAPI builds a store around (spec 2026-10-18 product link store, decision 3). Pure.
 *  JSON-LD first (Shopify, Alibaba, AliExpress, take.app and most shops publish it for Google), then Open Graph and product meta
 *  tags, then Amazon's own page, which has neither. */
import { parseFragment } from 'parse5';

export type ProductListingOption = { name: string; values: string[] };
export type ProductListing = { url: string; name: string; description: string; price: number | null; currency: string | null; images: string[]; options: ProductListingOption[] };
export type ProductPageBlock = 'blocked' | 'login';

const MAX_IMAGES = 12;
const MAX_VALUES = 24;

/** Entities and tags out, spaces folded: listing titles arrive as «Licuadora Port&aacute;til». */
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const fragment = parseFragment(`<p>${value.replace(/<[^>]*>/g, ' ')}</p>`) as { childNodes: Array<{ childNodes?: Array<{ value?: string }> }> };
  const plain = (fragment.childNodes[0]?.childNodes ?? []).map(node => node.value ?? '').join('');
  return plain.replace(/\s+/g, ' ').trim().slice(0, max);
}

function absolute(raw: unknown, page: string): string | null {
  const value = typeof raw === 'string' ? raw : raw && typeof raw === 'object' && typeof (raw as { url?: unknown }).url === 'string' ? (raw as { url: string }).url : '';
  if (!value.trim()) return null;
  try {
    const url = new URL(value.trim().replace(/&amp;/g, '&'), page);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch { return null; }
}

function images(values: unknown[], page: string): string[] {
  return [...new Set(values.map(value => absolute(value, page)).filter((url): url is string => Boolean(url)))].slice(0, MAX_IMAGES);
}

/** «18.30», 18.3, «1.302,21», «BOB291.54», «US$ 29,99». */
export function listingPrice(raw: unknown): number | null {
  const value = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw : '';
  const figure = value.replace(/[^\d.,]/g, '').replace(/[.,]+$/, '');
  if (!/\d/.test(figure)) return null;
  // The last separator is a decimal point only when one or two digits follow it: «1.302» is a thousand and three hundred, «18,3» and «1.302,21» carry cents.
  const last = Math.max(figure.lastIndexOf('.'), figure.lastIndexOf(','));
  const cents = last >= 0 && figure.length - last - 1 <= 2 ? figure.slice(last + 1) : '';
  const whole = (cents ? figure.slice(0, last) : figure).replace(/[.,]/g, '');
  const amount = Number(cents ? `${whole}.${cents}` : whole);
  return Number.isFinite(amount) && amount > 0 && amount < 10_000_000 ? Math.round(amount * 100) / 100 : null;
}

export function listingCurrency(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (/^[A-Z]{3}$/.test(value)) return value;
  if (/^US\$|^USD/.test(value)) return 'USD';
  if (/^BS\.?|^BOB/.test(value)) return 'BOB';
  const code = /^([A-Z]{3})\s?\d/.exec(value)?.[1];
  return code ?? null;
}

type LdNode = Record<string, unknown>;
function ldProducts(html: string): LdNode[] {
  const found: LdNode[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const types = ([] as unknown[]).concat((node as LdNode)['@type'] ?? []);
    if (types.includes('Product') || types.includes('ProductGroup')) found.push(node as LdNode);
    walk((node as LdNode)['@graph']);
  };
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(match[1].trim())); } catch { /* A broken block is skipped; another may still be whole. */ }
  }
  // A ProductGroup carries the options; a lone Product is the usual case.
  return found.sort((a, b) => Number(([] as unknown[]).concat(b['@type']).includes('ProductGroup')) - Number(([] as unknown[]).concat(a['@type']).includes('ProductGroup')));
}

function ldOptions(product: LdNode): ProductListingOption[] {
  const variants = Array.isArray(product.hasVariant) ? product.hasVariant as LdNode[] : [];
  const groups = new Map<string, Set<string>>();
  const add = (name: string, value: unknown) => {
    const clean = text(value, 40);
    if (!clean) return;
    if (!groups.has(name)) groups.set(name, new Set());
    groups.get(name)!.add(clean);
  };
  for (const variant of variants) {
    if (!variant || typeof variant !== 'object') continue;
    if (variant.color) add('Color', variant.color);
    if (variant.size) add('Talla', typeof variant.size === 'object' ? (variant.size as LdNode).name : variant.size);
    if (variant.material) add('Material', variant.material);
    for (const property of Array.isArray(variant.additionalProperty) ? variant.additionalProperty as LdNode[] : []) {
      const name = text(property?.name, 40);
      if (name) add(name, property.value);
    }
  }
  return [...groups].filter(([, values]) => values.size > 1).map(([name, values]) => ({ name, values: [...values].slice(0, MAX_VALUES) }));
}

function fromLd(product: LdNode, page: string): Omit<ProductListing, 'url'> {
  const variants = Array.isArray(product.hasVariant) ? product.hasVariant as LdNode[] : [];
  const offers = ([] as unknown[]).concat(product.offers ?? [], ...variants.map(variant => variant?.offers ?? [])).filter((offer): offer is LdNode => Boolean(offer) && typeof offer === 'object');
  const offer = offers.find(item => listingPrice(item.price ?? item.lowPrice) !== null);
  return {
    name: text(product.name, 200),
    description: text(product.description, 4000),
    price: offer ? listingPrice(offer.price ?? offer.lowPrice) : null,
    currency: offer ? listingCurrency(offer.priceCurrency) : null,
    images: images([...([] as unknown[]).concat(product.image ?? []), ...variants.flatMap(variant => ([] as unknown[]).concat(variant?.image ?? []))], page),
    options: ldOptions(product),
  };
}

function metas(html: string, name: string): string[] {
  const values: string[] = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (key?.toLowerCase() === name && content !== undefined) values.push(content);
  }
  return values;
}

function fromAmazon(html: string, page: string): Omit<ProductListing, 'url'> | null {
  const title = /id="productTitle"[^>]*>([\s\S]*?)<\/span>/i.exec(html)?.[1];
  if (!title) return null;
  const core = html.slice(Math.max(0, html.search(/id="(?:corePrice_feature_div|corePriceDisplay_desktop_feature_div|apex_desktop)"/i)));
  const shown = /class="a-offscreen">([^<]{1,30})</i.exec(core)?.[1] ?? '';
  const bullets = /id="feature-bullets"[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i.exec(html)?.[1] ?? '';
  return {
    name: text(title, 200),
    description: text(bullets.replace(/<\/li>/gi, '. '), 4000),
    price: listingPrice(shown),
    currency: listingCurrency(shown),
    images: images([...html.matchAll(/"hiRes":"(https:[^"]+)"/g)].map(match => match[1]), page),
    options: [],
  };
}

/** The listing on this page, or null when the page shows no product (a name and at least one photo). */
export function extractProductListing(html: string, page: string): ProductListing | null {
  const ld = ldProducts(html)[0];
  const listing = ld ? fromLd(ld, page) : fromAmazon(html, page);
  const metaImages = images(metas(html, 'og:image'), page);
  const merged = {
    name: listing?.name || text(metas(html, 'og:title')[0], 200),
    description: listing?.description || text(metas(html, 'og:description')[0] ?? metas(html, 'description')[0], 4000),
    price: listing?.price ?? listingPrice(metas(html, 'product:price:amount')[0] ?? metas(html, 'og:price:amount')[0]),
    currency: listing?.currency ?? listingCurrency(metas(html, 'product:price:currency')[0] ?? metas(html, 'og:price:currency')[0]),
    images: listing?.images.length ? listing.images : metaImages,
    options: listing?.options ?? [],
  };
  return merged.name && merged.images.length ? { url: page, ...merged } : null;
}

/** A captcha, a robot check, a verification wall or a login page instead of the product (spike 2026-10-18: Temu's
 *  «Security verification», Mercado Libre's account-verification, AliExpress's robot check, Cloudflare's «Just a moment»). */
export function productPageBlock(html: string, finalUrl: string, status: number): ProductPageBlock | null {
  const path = (() => { try { return new URL(finalUrl).pathname.toLowerCase(); } catch { return ''; } })();
  const title = (/<title[^>]*>([^<]*)/i.exec(html)?.[1] ?? '').toLowerCase();
  if (/\/(?:login|signin|sign-in|ap\/signin)|login\.html/.test(path) || /^(?:log ?in|iniciar sesi[oó]n|temu \| login)/.test(title.trim())) return 'login';
  if ([401, 403, 429, 503].includes(status) || /verification|captcha|punish|challenge/.test(path)
    || /captcha|security verification|just a moment|un momento|robot|access denied|attention required|verificaci[oó]n/.test(title)
    // AliExpress's robot check keeps the shop's own page around it: only its markers show (call this on a page with no listing).
    || /_____tmd_____|punish-component|x5secdata|cf-chl-|g-recaptcha/.test(html)) return 'blocked';
  return null;
}
