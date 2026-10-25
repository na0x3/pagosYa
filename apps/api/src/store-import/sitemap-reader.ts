/** Any other shop → pagosYa (owner 2026-10-25: «accept websites from wix and etc»): Wix, Tiendanube, Squarespace, VTEX and most
 *  others publish a sitemap and describe each product page with schema.org Product data (JSON-LD) or Open Graph tags. Read the
 *  product pages the sitemap lists, keep only what a page states about itself, and return the neutral store shape. */
import { fetchPublic, PublicFetchError } from './public-fetch';
import { ShopifyReadError, shopifyOrigin } from './shopify-reader';
import type { ShopifyCollection, ShopifyProduct, ShopifyStoreData } from './shopify-types';

export type TextGet = (url: string) => Promise<{ status: number; body: string }>;
/** Page reads are slow: a sitemap import stops at this many products and says so. */
export const MAX_SITEMAP_PRODUCTS = 300;
const MAX_CHILD_SITEMAPS = 12;
const PRODUCT_URL = /\/(?:product-page|products?|producto|productos|item|items|p|tienda|shop|store|catalogo)\/[^/?#]+/i;
const PRODUCT_SITEMAP = /product|producto|store-products|catalog|item/i;

function publicGet(origin: URL): TextGet {
  return async url => {
    const target = new URL(url, origin);
    // Only the shop's own host (and its www twin): a sitemap cannot send the importer elsewhere.
    const bare = (host: string) => host.replace(/^www\./, '');
    try {
      const response = await fetchPublic(target, { accept: 'text/html,application/xml,text/xml;q=0.9,*/*;q=0.5', maxBytes: 4_000_000, timeoutMs: 15_000, allowHost: host => bare(host) === bare(origin.hostname) });
      return { status: response.status, body: response.body.toString('utf8') };
    } catch (error) {
      if (error instanceof PublicFetchError && error.code !== 'unreachable') return { status: 0, body: '' };
      throw new ShopifyReadError('unreachable', 'La tienda no respondió. Intenta de nuevo en unos minutos.');
    }
  };
}

const locs = (xml: string) => [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map(match => match[1].replace(/&amp;/g, '&'));
const decode = (value: string) => value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (value: unknown) => typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';

/** The product URLs a shop's sitemap lists, product sitemaps first. */
export async function sitemapProductUrls(origin: URL, get: TextGet): Promise<string[]> {
  let root = await get(new URL('/sitemap.xml', origin).href);
  if (root.status !== 200 || !/<(?:urlset|sitemapindex)\b/i.test(root.body)) root = await get(new URL('/sitemap_index.xml', origin).href);
  if (root.status !== 200 || !/<(?:urlset|sitemapindex)\b/i.test(root.body)) return [];
  const urls: string[] = [];
  if (/<sitemapindex\b/i.test(root.body)) {
    const children = locs(root.body);
    const products = children.filter(url => PRODUCT_SITEMAP.test(url));
    for (const child of (products.length ? products : children).slice(0, MAX_CHILD_SITEMAPS)) {
      const page = await get(child);
      if (page.status !== 200) continue;
      // A product sitemap lists products whatever their path (Wix: /product-page/…); any other only its product-looking pages.
      urls.push(...locs(page.body).filter(url => PRODUCT_SITEMAP.test(child) || PRODUCT_URL.test(new URL(url, origin).pathname)));
    }
  } else urls.push(...locs(root.body).filter(url => PRODUCT_URL.test(new URL(url, origin).pathname)));
  return [...new Set(urls)];
}

type PageProduct = { name: string; description: string; images: string[]; category: string; currency: string;
  offers: Array<{ name: string; sku: string; price: string; available: boolean }> };

function jsonLdProducts(html: string): any[] {
  const found: any[] = [];
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const type = node['@type'];
    if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) found.push(node);
    if (type === 'ProductGroup' && Array.isArray(node.hasVariant)) found.push({ ...node, '@type': 'Product', offers: node.hasVariant.flatMap((variant: any) => ([] as any[]).concat(variant.offers || []).map((offer: any) => ({ ...offer, name: variant.name, sku: variant.sku }))) });
    if (node['@graph']) visit(node['@graph']);
  };
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1].trim())); } catch { /* A broken block is skipped; the page's other blocks and its meta tags still count. */ }
  }
  return found;
}

const meta = (html: string, key: string) => {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${key.replace(/[.:]/g, '\\$&')}["'][^>]*>`, 'i');
  const tag = html.match(pattern)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '').trim() : '';
};

/** What one product page says about itself: JSON-LD Product first, Open Graph product tags otherwise. */
export function pageProduct(html: string, pageUrl: string): PageProduct | null {
  const absolute = (value: string) => { try { return new URL(value, pageUrl).href; } catch { return ''; } };
  const ld = jsonLdProducts(html)[0];
  if (ld) {
    const images = ([] as any[]).concat(ld.image || []).map((image: any) => absolute(typeof image === 'string' ? image : text(image?.url || image?.contentUrl))).filter(Boolean);
    const rawOffers: any[] = ([] as any[]).concat(ld.offers || []).flatMap((offer: any) => offer?.['@type'] === 'AggregateOffer' && Array.isArray(offer.offers) ? offer.offers : [offer]);
    const offers = rawOffers.map(offer => ({ name: text(offer?.name), sku: text(offer?.sku), price: text(offer?.price ?? offer?.lowPrice ?? offer?.priceSpecification?.price),
      available: !/OutOfStock|SoldOut|Discontinued/i.test(text(offer?.availability)) })).filter(offer => /^\d+(?:\.\d+)?$/.test(offer.price));
    const currency = text(([] as any[]).concat(ld.offers || [])[0]?.priceCurrency) || text(rawOffers[0]?.priceCurrency);
    if (text(ld.name) && offers.length) return { name: decode(text(ld.name)), description: text(ld.description), images, category: text(ld.category).split(/[>/]/).pop()?.trim() || '', currency: currency.toUpperCase(), offers };
  }
  const name = meta(html, 'og:title'), price = meta(html, 'product:price:amount') || meta(html, 'og:price:amount');
  if (!name || !/^\d+(?:[.,]\d+)?$/.test(price)) return null;
  return { name, description: meta(html, 'og:description') || meta(html, 'description'), images: [absolute(meta(html, 'og:image'))].filter(Boolean), category: '',
    currency: (meta(html, 'product:price:currency') || meta(html, 'og:price:currency')).toUpperCase(), offers: [{ name: '', sku: '', price: price.replace(',', '.'), available: !/out ?of ?stock|agotado/i.test(meta(html, 'product:availability') || meta(html, 'og:availability')) }] };
}

const handleOf = (pageUrl: string) => decodeURIComponent(new URL(pageUrl).pathname.split('/').filter(Boolean).pop() || '').slice(0, 120) || pageUrl;

function toProduct(found: PageProduct, pageUrl: string): ShopifyProduct {
  // Several offers that each name themselves are the variants (one option, «Opción»); a single offer is a simple product.
  const named = found.offers.length > 1 && found.offers.every(offer => offer.name && offer.name !== found.name);
  const variants = (named ? found.offers : [found.offers.reduce((min, offer) => Number(offer.price) < Number(min.price) ? offer : min)]).map((offer, index) => ({
    id: `${handleOf(pageUrl)}#${index + 1}`, options: named ? [offer.name.replace(found.name, '').replace(/^[\s\-–—:/]+/, '').trim() || offer.name] : [],
    sku: offer.sku || null, price: offer.price, compareAtPrice: null, available: offer.available, grams: 0 }));
  return { handle: handleOf(pageUrl), title: found.name, bodyHtml: found.description, productType: found.category, tags: [], optionNames: named ? ['Opción'] : [], variants, images: found.images.slice(0, 12) };
}

const PLATFORMS: Array<[RegExp, string]> = [[/wixstatic\.com|wix\.com|_wixCIDX/i, 'Wix'], [/tiendanube|nuvemshop|mitiendanube/i, 'Tiendanube'], [/squarespace/i, 'Squarespace'], [/vtex/i, 'VTEX'], [/jumpseller/i, 'Jumpseller']];

/** Reads a shop from its sitemap and product pages; four pages at a time, at most MAX_SITEMAP_PRODUCTS products. */
export async function readSitemapStore(raw: string, get?: TextGet): Promise<ShopifyStoreData & { platform: string }> {
  const origin = shopifyOrigin(raw);
  const fetchText = get ?? publicGet(origin);
  const urls = await sitemapProductUrls(origin, fetchText);
  if (!urls.length) throw new ShopifyReadError('not_shopify', 'No encontramos la lista de productos de esa tienda. Exporta tus productos como CSV desde tu plataforma y súbelo aquí.');
  const products: ShopifyProduct[] = [], currencies = new Map<string, number>(), categories = new Map<string, ShopifyCollection>();
  let platform = '', skipped = 0, next = 0;
  const pages = urls.slice(0, MAX_SITEMAP_PRODUCTS);
  await Promise.all(Array.from({ length: Math.min(4, pages.length) }, async () => {
    while (next < pages.length) {
      const url = pages[next++];
      let page: { status: number; body: string };
      try { page = await fetchText(url); } catch { skipped++; continue; }
      if (page.status !== 200) { skipped++; continue; }
      platform ||= PLATFORMS.find(([pattern]) => pattern.test(page.body))?.[1] || '';
      const found = pageProduct(page.body, url);
      if (!found) { skipped++; continue; }
      const item = toProduct(found, url);
      if (products.some(existing => existing.handle === item.handle)) continue;
      products.push(item);
      if (found.currency) currencies.set(found.currency, (currencies.get(found.currency) ?? 0) + 1);
      if (found.category) {
        const handle = found.category.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (handle) { const collection = categories.get(handle) ?? { handle, title: found.category, description: '', productHandles: [] }; collection.productHandles.push(item.handle); categories.set(handle, collection); }
      }
    }
  }));
  if (!products.length) throw new ShopifyReadError('not_shopify', 'Las páginas de esa tienda no dicen el precio de sus productos. Exporta tus productos como CSV y súbelo aquí.');
  const currency = [...currencies].sort((a, b) => b[1] - a[1])[0]?.[0] || 'BOB';
  const warnings = [
    'Leímos cada producto de su página pública: revisa precios, variantes y stock antes de publicar.',
    ...(skipped ? [`${skipped} páginas no se pudieron leer como producto y quedaron fuera.`] : []),
  ];
  return { platform: platform || 'tu tienda', host: origin.hostname, origin: origin.href, name: origin.hostname.replace(/^www\./, '').split('.')[0], currency,
    products, collections: [...categories.values()].slice(0, 50), articles: [], truncated: urls.length > MAX_SITEMAP_PRODUCTS, stockKnown: false, warnings };
}
