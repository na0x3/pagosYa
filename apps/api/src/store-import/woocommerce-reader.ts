/** WooCommerce → pagosYa (owner 2026-10-25: «accept websites from wix and etc»). A WooCommerce shop answers its public Store API
 *  without a key: products with prices, photos, categories and variation attributes. Neutral output, the same shape a Shopify
 *  read gives, so the preview, the writer and the design step do not change. */
import { fetchPublic, PublicFetchError } from './public-fetch';
import { MAX_PRODUCTS, ShopifyReadError, shopifyOrigin } from './shopify-reader';
import type { ShopifyCollection, ShopifyProduct, ShopifyStoreData } from './shopify-types';

export type WooGet = (path: string) => Promise<{ status: number; json: any }>;
const PAGE = 100;

function publicGet(origin: URL): WooGet {
  return async path => {
    try {
      const response = await fetchPublic(new URL(path, origin), { accept: 'application/json', maxBytes: 8_000_000, timeoutMs: 15_000 });
      let json: any = null;
      if (/json/i.test(response.contentType)) { try { json = JSON.parse(response.body.toString('utf8')); } catch { json = null; } }
      return { status: response.status, json };
    } catch (error) {
      if (error instanceof PublicFetchError && error.code !== 'unreachable') throw new ShopifyReadError('not_shopify', 'No pudimos leer esa dirección como una tienda pública.');
      throw new ShopifyReadError('unreachable', 'La tienda no respondió. Intenta de nuevo en unos minutos.');
    }
  };
}

/** «1250» with two minor digits → «12.50»: string arithmetic, never a float. */
export function minorToDecimal(minor: unknown, digits: unknown): string {
  const raw = String(minor ?? '').trim();
  if (!/^\d{1,15}$/.test(raw)) return '';
  const places = Number.isInteger(Number(digits)) ? Math.max(0, Math.min(4, Number(digits))) : 2;
  if (!places) return raw;
  const padded = raw.padStart(places + 1, '0');
  return `${padded.slice(0, -places)}.${padded.slice(-places)}`;
}

const text = (value: unknown) => typeof value === 'string' ? value : '';

function product(raw: any): ShopifyProduct {
  const prices = raw.prices || {};
  const price = minorToDecimal(prices.price, prices.currency_minor_unit);
  const regular = minorToDecimal(prices.regular_price, prices.currency_minor_unit);
  const compareAtPrice = regular && price && regular !== price ? regular : null;
  const options = (Array.isArray(raw.attributes) ? raw.attributes : []).filter((attribute: any) => attribute?.has_variations && text(attribute.name));
  const optionNames: string[] = options.map((attribute: any) => text(attribute.name).trim());
  const variations: any[] = Array.isArray(raw.variations) ? raw.variations : [];
  // The Store API lists a variation's attribute values but not its own price: every variation takes the product's price, and the
  // review says so (warnings in readWooStore).
  const variants = variations.length && optionNames.length
    ? variations.map(variation => {
      const values = optionNames.map(name => {
        const match = (variation.attributes || []).find((attribute: any) => text(attribute?.name).trim().toLowerCase() === name.toLowerCase());
        const term = options.find((attribute: any) => text(attribute.name).trim() === name)?.terms?.find((t: any) => t?.slug === match?.value || t?.name === match?.value);
        return text(term?.name || match?.value).trim();
      });
      return { id: String(variation.id), options: values.filter(Boolean), sku: null, price, compareAtPrice, available: raw.is_in_stock !== false, grams: 0 };
    }).filter(variant => variant.options.length === optionNames.length)
    : [];
  return {
    handle: text(raw.slug) || String(raw.id), title: text(raw.name).trim(), bodyHtml: text(raw.description) || text(raw.short_description),
    productType: text(raw.categories?.[0]?.name).trim(), tags: (Array.isArray(raw.tags) ? raw.tags : []).map((tag: any) => text(tag?.name)).filter(Boolean),
    optionNames: variants.length ? optionNames : [],
    variants: variants.length ? variants : [{ id: String(raw.id), options: [], sku: text(raw.sku) || null, price, compareAtPrice, available: raw.is_in_stock !== false, grams: 0 }],
    images: (Array.isArray(raw.images) ? raw.images : []).map((image: any) => text(image?.src)).filter(Boolean),
  };
}

/** The Store API's first page answers only on a WooCommerce shop: anything else is «not WooCommerce». */
export async function readWooStore(raw: string, get?: WooGet): Promise<ShopifyStoreData> {
  const origin = shopifyOrigin(raw);
  const fetchJson = get ?? publicGet(origin);
  const products: ShopifyProduct[] = [], categories = new Map<string, ShopifyCollection>();
  let truncated = false, currency = '', variablePrices = false;
  for (let page = 1; ; page++) {
    const response = await fetchJson(`/wp-json/wc/store/v1/products?per_page=${PAGE}&page=${page}`);
    if (response.status !== 200 || !Array.isArray(response.json)) {
      if (page === 1) throw new ShopifyReadError('not_shopify', 'Esa dirección no es una tienda WooCommerce pública.');
      break;
    }
    for (const raw of response.json) {
      if (!raw || typeof raw !== 'object' || !text(raw.name)) continue;
      if (products.length >= MAX_PRODUCTS) { truncated = true; break; }
      const item = product(raw);
      if (!item.variants[0]?.price) continue;
      products.push(item);
      currency ||= text(raw.prices?.currency_code).toUpperCase();
      if (item.variants.length > 1) variablePrices = true;
      for (const category of Array.isArray(raw.categories) ? raw.categories : []) {
        const handle = text(category?.slug); if (!handle) continue;
        const collection = categories.get(handle) ?? { handle, title: text(category.name).trim() || handle, description: '', productHandles: [] };
        collection.productHandles.push(item.handle); categories.set(handle, collection);
      }
    }
    if (truncated || response.json.length < PAGE) break;
  }
  if (!products.length) throw new ShopifyReadError('not_shopify', 'No encontramos productos publicados en esa tienda WooCommerce.');
  const warnings = variablePrices ? ['WooCommerce no publica el precio de cada variante: todas toman el precio del producto. Revisa las que cuestan distinto.'] : [];
  return { host: origin.hostname, origin: origin.href, name: origin.hostname.replace(/^www\./, '').split('.')[0], currency: currency || 'BOB',
    products, collections: [...categories.values()].filter(collection => collection.handle !== 'uncategorized').slice(0, 50), articles: [], truncated, stockKnown: false, warnings };
}
