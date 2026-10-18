/** The product-link reader (spec 2026-10-18 product link store, decision 1): cheap first, stopping at the first tier that finds the
 *  product. (1) The DNS-pinned fetcher, (2) the guarded browser, (3) a paid scraping service when PRODUCT_SOURCE_PROXY_URL is set,
 *  else the caller asks the merchant for screenshots or photos. */
import { readSourceReferenceResource } from '../source-website-fetch';
import { extractProductListing, productPageBlock, type ProductListing, type ProductPageBlock } from './product-source-extract';
import type { ProductLink } from './product-source-links';
import { PRODUCT_SOURCE_USER_AGENT, renderProductPage } from './product-source-render';

export type ProductSourceTier = 'fetch' | 'browser' | 'service';
export type ProductSourceFailure = ProductPageBlock | 'not-product' | 'unavailable';
export type ProductSourceResult = { ok: true; listing: ProductListing; tier: ProductSourceTier } | { ok: false; reason: ProductSourceFailure };
type Page = { url: string; html: string; status: number };
export type ProductSourceDeps = { fetch: (url: string) => Promise<Page | null>; render: (url: string) => Promise<Page | null>; proxyTemplate?: string };

/** A page the safe fetcher read, or a 403 stand-in when the site refused it (the fetcher throws on any non-200 answer). */
async function fetchPage(url: string, timeoutMs: number): Promise<Page | null> {
  try {
    const page = await readSourceReferenceResource(url, 'html', AbortSignal.timeout(timeoutMs), undefined, undefined, PRODUCT_SOURCE_USER_AGENT);
    return { url: page.url, html: page.body.toString('utf8'), status: 200 };
  } catch (error) {
    return (error as Error)?.message === 'Reference page unavailable' ? { url, html: '', status: 403 } : null;
  }
}

export const productSourceDeps = (): ProductSourceDeps => ({
  fetch: url => fetchPage(url, 12_000),
  render: renderProductPage,
  proxyTemplate: process.env.PRODUCT_SOURCE_PROXY_URL?.includes('{url}') ? process.env.PRODUCT_SOURCE_PROXY_URL : undefined,
});

export async function readProductSource(link: ProductLink, deps: ProductSourceDeps = productSourceDeps()): Promise<ProductSourceResult> {
  // Facebook, Instagram and TikTok need a login: never fetched (decision 2).
  if (link.social) return { ok: false, reason: 'login' };
  let block: ProductPageBlock | null = null, loaded = false;
  let thin: { listing: ProductListing; tier: ProductSourceTier } | undefined;
  const tiers: Array<[ProductSourceTier, () => Promise<Page | null>]> = [
    ['fetch', () => deps.fetch(link.url)],
    ['browser', () => deps.render(link.url)],
    ...(deps.proxyTemplate ? [['service', () => fetchPage(deps.proxyTemplate!.replace('{url}', encodeURIComponent(link.url)), 70_000)] as [ProductSourceTier, () => Promise<Page | null>]] : []),
  ];
  for (const [tier, read] of tiers) {
    const page = await read().catch(() => null);
    if (!page) continue;
    // The service answers from its own address: the product's address is still the merchant's link.
    const listing = page.html && extractProductListing(page.html, tier === 'service' ? link.url : page.url);
    // A name and one photo with no price (AliExpress's plain page, live 2026-10-18) is kept while a later tier tries for the
    // whole listing.
    if (listing && listing.price !== null && listing.images.length > 1) return { ok: true, listing, tier };
    if (listing && (!thin || listing.images.length + Number(listing.price !== null) > thin.listing.images.length + Number(thin.listing.price !== null))) thin = { listing, tier };
    loaded ||= page.status === 200 && Boolean(page.html);
    block = productPageBlock(page.html, page.url, page.status) ?? block;
  }
  if (thin) return { ok: true, ...thin };
  return { ok: false, reason: block ?? (loaded ? 'not-product' : 'unavailable') };
}
