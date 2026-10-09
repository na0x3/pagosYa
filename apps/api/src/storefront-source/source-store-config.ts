/** The store facts every storefront revision carries in config.js, shared by YAPI generation and Plantillas so a
 * template-built store and a generated one hold the same data. */
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PublicStoresService } from '../stores/public-stores.service';

export type SourcePublicStore = Awaited<ReturnType<PublicStoresService['getStorePublic']>>;

/** The public API origin stores call; refuses a non-http(s) URL, credentials, or plain http in production. */
export function sourcePublicApiUrl(config: Pick<ConfigService, 'get'>): URL {
  const apiBaseUrl = process.env.PUBLIC_API_URL || `http://localhost:${config.get<number>("app.port") || 3001}/v1`;
  const apiUrl = new URL(apiBaseUrl);
  if (!/^https?:$/.test(apiUrl.protocol) || apiUrl.username || apiUrl.password) throw new ServiceUnavailableException("PUBLIC_API_URL no es una URL pública válida.");
  if (config.get<string>("app.environment") === "production" && apiUrl.protocol !== "https:") throw new ServiceUnavailableException("PUBLIC_API_URL debe usar HTTPS en producción.");
  return apiUrl;
}

/** config.js `data`: the store's public facts with every photo made absolute against the API. A first revision
 * takes payments. */
export function sourceStoreConfigData(publicStore: SourcePublicStore, apiUrl: URL, firstRevision: boolean) {
  return {
    storeName: publicStore.storeName, creditsEnabled: publicStore.creditsEnabled, digitalGoodsEnabled: publicStore.digitalGoodsEnabled, shippingEnabled: publicStore.shippingEnabled, shippingPickupEnabled: publicStore.shippingPickupEnabled, shippingCarriersEnabled: publicStore.shippingCarriersEnabled, bundlesEnabled: publicStore.bundlesEnabled, subscriptionsEnabled: publicStore.subscriptionsEnabled, logoUrl: publicStore.logoUrl, tagline: publicStore.tagline, checkoutMode: firstRevision ? "payment" : publicStore.checkoutMode,
    contactPhone: publicStore.contactPhone, leadCaptureUrl: publicStore.leadCaptureUrl,
    aboutText: publicStore.aboutText, contactEmail: publicStore.contactEmail, policies: publicStore.policies,
    contactFormEnabled: publicStore.contactFormEnabled, contactTitle: publicStore.contactTitle, contactSubtitle: publicStore.contactSubtitle,
    categories: publicStore.categories, locations: publicStore.locations,
    cartRecommendationsEnabled: publicStore.cartRecommendationsEnabled, cartRecommendationProductIds: publicStore.cartRecommendationProductIds, bundles: publicStore.bundles,
    items: publicStore.items.map((item) => ({ ...item, imageUrls: item.imageUrls.map((url) => new URL(url, apiUrl).href), variants: item.variants?.map(variant => ({ ...variant, ...(variant.imageUrl ? { imageUrl: new URL(variant.imageUrl, apiUrl).href } : {}) })), extras: item.extras?.map(extra => ({ ...extra, ...(extra.imageUrl ? { imageUrl: new URL(extra.imageUrl, apiUrl).href } : {}) })) })),
  };
}

/** The store's catalog as it is now, written into config.js: a preview built from saved files (a revision, or a
 *  draft on top of one) would otherwise show the products the store had when those files were saved. */
export function withLiveCatalog<T extends { path: string; content: string }>(files: T[], catalog: unknown): T[] {
  return files.map(file => {
    if (file.path !== 'config.js') return file;
    const match = file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
    if (!match) return file;
    const config = JSON.parse(match[1]);
    return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, data: catalog })};` };
  });
}
