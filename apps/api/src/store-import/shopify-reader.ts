import { fetchPublic, PublicFetchError } from './public-fetch';
import type { ShopifyArticle, ShopifyCollection, ShopifyProduct, ShopifyStoreData } from './shopify-types';

export const MAX_PRODUCTS = 1000;
const MAX_COLLECTIONS = 50;
const POLICIES = ['refund-policy', 'shipping-policy', 'privacy-policy', 'terms-of-service'];
// Shopify creates these itself; they are not the merchant's collections.
const IGNORED_COLLECTIONS = new Set(['frontpage', 'all']);
const UNREACHABLE = 'Shopify no respondió. Intenta de nuevo en unos minutos.';
const PROTECTED = 'Tu tienda está protegida con contraseña. Exporta tus productos desde Shopify (Productos → Exportar) y sube el CSV aquí.';

export class ShopifyReadError extends Error {
  constructor(readonly code: 'not_shopify' | 'protected' | 'unreachable', message: string) { super(message); }
}
export type JsonGet = (path: string) => Promise<{ status: number; finalPath: string; json: any }>;

export function shopifyOrigin(raw: string): URL {
  const trimmed = raw.trim();
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed.replace(/^http:/i, 'https:') : `https://${trimmed}`); }
  catch { throw new ShopifyReadError('not_shopify', 'Escribe la dirección de tu tienda, por ejemplo mitienda.com.'); }
  return new URL(url.origin + '/');
}

function publicGet(origin: URL): JsonGet {
  return async path => {
    try {
      const response = await fetchPublic(new URL(path, origin), { accept: 'application/json', maxBytes: 8_000_000, timeoutMs: 15_000 });
      let json: any = null;
      if (/json/i.test(response.contentType)) { try { json = JSON.parse(response.body.toString('utf8')); } catch { json = null; } }
      return { status: response.status, finalPath: response.url.pathname, json };
    } catch (error) {
      if (error instanceof PublicFetchError && error.code !== 'unreachable') throw new ShopifyReadError('not_shopify', 'No pudimos leer esa dirección como una tienda pública.');
      throw new ShopifyReadError('unreachable', 'Shopify no respondió. Intenta de nuevo en unos minutos.');
    }
  };
}

const text = (value: unknown) => typeof value === 'string' ? value : '';

function product(raw: any): ShopifyProduct {
  return {
    handle: text(raw.handle), title: text(raw.title).trim(), bodyHtml: text(raw.body_html), productType: text(raw.product_type).trim(),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : text(raw.tags).split(',').map(tag => tag.trim()).filter(Boolean),
    optionNames: Array.isArray(raw.options) ? raw.options.map((option: any) => text(option?.name)).filter(Boolean) : [],
    variants: (raw.variants || []).map((variant: any) => ({
      id: String(variant.id), options: [variant.option1, variant.option2, variant.option3].filter((value: unknown) => typeof value === 'string'),
      sku: variant.sku ? String(variant.sku) : null, price: String(variant.price ?? ''), compareAtPrice: variant.compare_at_price ? String(variant.compare_at_price) : null,
      available: variant.available !== false, grams: Number(variant.grams) || 0,
      ...(variant.featured_image?.src ? { imageSrc: String(variant.featured_image.src) } : {}),
    })),
    images: (raw.images || []).map((image: any) => text(image?.src)).filter(Boolean),
  };
}

/** Reads a public Shopify store (spec 2026-09-27 §2). Only products are required; collections and pages degrade to warnings. */
export async function readShopifyStore(raw: string, get?: JsonGet): Promise<ShopifyStoreData> {
  const origin = shopifyOrigin(raw);
  const fetchJson = get ?? publicGet(origin);
  const warnings: string[] = [];
  const meta = await fetchJson('/meta.json');
  if (meta.finalPath === '/password') throw new ShopifyReadError('protected', PROTECTED);
  if (meta.status === 429 || meta.status >= 500) throw new ShopifyReadError('unreachable', UNREACHABLE);
  if (meta.status !== 200 || !/\.myshopify\.com$/.test(text(meta.json?.myshopify_domain))) throw new ShopifyReadError('not_shopify', 'Esa dirección no es una tienda Shopify.');

  const products: ShopifyProduct[] = [];
  let truncated = false;
  for (let page = 1; ; page++) {
    const response = await fetchJson(`/products.json?limit=250&page=${page}`);
    if (response.finalPath === '/password') throw new ShopifyReadError('protected', PROTECTED);
    // A rate limit or a server error is not the end of the catalog (final review, Important #3).
    if (response.status === 429 || response.status >= 500) throw new ShopifyReadError('unreachable', UNREACHABLE);
    if (page === 1 && [401, 403, 404].includes(response.status)) throw new ShopifyReadError('protected', PROTECTED);
    const items: any[] = Array.isArray(response.json?.products) ? response.json.products : [];
    if (!items.length) break;
    if (products.length >= MAX_PRODUCTS) { truncated = true; break; }
    products.push(...items.slice(0, MAX_PRODUCTS - products.length).map(product));
    if (items.length < 250) break;
  }

  const collections: ShopifyCollection[] = [];
  try {
    const listed = await fetchJson('/collections.json?limit=250');
    if (!Array.isArray(listed.json?.collections)) throw new Error('no collections');
    for (const raw of listed.json.collections.filter((c: any) => !IGNORED_COLLECTIONS.has(c.handle) && c.products_count !== 0).slice(0, MAX_COLLECTIONS)) {
      const productHandles: string[] = [];
      for (let page = 1; page <= 4; page++) {
        const items: any[] = (await fetchJson(`/collections/${encodeURIComponent(raw.handle)}/products.json?limit=250&page=${page}`)).json?.products || [];
        productHandles.push(...items.map(item => text(item.handle)).filter(Boolean));
        if (items.length < 250) break;
      }
      collections.push({ handle: text(raw.handle), title: text(raw.title).trim(), description: text(raw.description), productHandles });
    }
  } catch { warnings.push('No pudimos leer tus colecciones; los productos se importan igual.'); }

  const articles: ShopifyArticle[] = [];
  try {
    const listed = await fetchJson('/pages.json?limit=250');
    if (!Array.isArray(listed.json?.pages)) throw new Error('no pages');
    for (const page of listed.json.pages) articles.push({ kind: 'page', handle: text(page.handle), title: text(page.title).trim(), bodyHtml: text(page.body_html) });
  } catch { warnings.push('No pudimos leer tus páginas.'); }
  for (const handle of POLICIES) {
    const policy = (await fetchJson(`/policies/${handle}.json`).catch(() => null))?.json?.policy;
    if (policy && text(policy.body).trim()) articles.push({ kind: 'policy', handle, title: text(policy.title).trim(), bodyHtml: text(policy.body) });
  }

  return { host: origin.hostname, shopDomain: text(meta.json.myshopify_domain).toLowerCase(), origin: origin.href, name: text(meta.json.name).trim() || origin.hostname, currency: text(meta.json.currency).toUpperCase() || 'BOB',
    products, collections, articles, truncated, stockKnown: false, warnings };
}
