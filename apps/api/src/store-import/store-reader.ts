/** One «Importar tienda» for any shop (owner 2026-10-25: «accept websites from wix and etc»): Shopify's public catalog first, then
 *  WooCommerce's Store API, then any shop's sitemap and product pages (Wix, Tiendanube, Squarespace, VTEX…). A password-protected
 *  or unreachable shop stops the chain: only «this is not that platform» moves on to the next reader. */
import { readShopifyStore, ShopifyReadError } from './shopify-reader';
import { readSitemapStore } from './sitemap-reader';
import type { ShopifyStoreData } from './shopify-types';
import { readWooStore } from './woocommerce-reader';

export type StoreRead = ShopifyStoreData & { platform: string };

export async function readAnyStore(raw: string, readers = { shopify: readShopifyStore, woo: readWooStore, sitemap: readSitemapStore }): Promise<StoreRead> {
  const next = (error: unknown) => { if (!(error instanceof ShopifyReadError) || error.code !== 'not_shopify') throw error; };
  try { return { ...(await readers.shopify(raw)), platform: 'Shopify' }; } catch (error) { next(error); }
  try { return { ...(await readers.woo(raw)), platform: 'WooCommerce' }; } catch (error) { next(error); }
  return readers.sitemap(raw);
}
