import type { CarrierAdapter } from '../shipping/carriers/carrier';

/** Extensions framework (spec 2026-09-27 §4): first-party modules only pagosYa writes. */
export type ExtensionCategory = 'analytics' | 'ads' | 'seo' | 'catalogs' | 'shipping' | 'messaging' | 'payments';

export const CATEGORY_LABELS: Record<ExtensionCategory, string> = {
  analytics: 'Analítica', ads: 'Publicidad', seo: 'Tráfico y SEO', catalogs: 'Catálogos', shipping: 'Envíos', messaging: 'Mensajería', payments: 'Pagos',
};

export type ExtensionSettings = Record<string, string | boolean>;
export type ExtensionField = { key: string; label: string; type: 'text' | 'select' | 'toggle'; help?: string; where?: string; placeholder?: string; required?: boolean; pattern?: RegExp; normalize?: (value: string) => string; options?: Array<{ value: string; label: string }> };
export type ExtensionSecret = { key: string; label: string; help?: string; pattern?: RegExp };
export type StoreEventType = 'order.paid' | 'order.status_changed' | 'refund.succeeded';
export type StoreEventRecord = { id: string; storeId: string; type: StoreEventType; payload: Record<string, unknown>; createdAt: Date };
export type ExtensionContext = { storeId: string; settings: ExtensionSettings; secrets: Record<string, string> };

export interface ExtensionManifest {
  id: string; name: string; category: ExtensionCategory; tier: 'free' | 'pro';
  logo: string | null; summary: string; description: string; docsUrl?: string;
  settings: ExtensionField[]; secrets?: ExtensionSecret[];
  /**
   * Source of `function(c, tag, on){…}`, run behind the consent gate: `c` is the validated settings,
   * `tag(src)` appends an async script, `on('purchase', fn)` receives `{ orderId, value, currency }`
   * (value in major units, currency upper-case); `w` and `d` are `window` and `document`.
   */
  storefrontLoader?: string;
  verificationMeta?: { name: string; settingKey: string };
  productFeed?: { platform: 'google' | 'meta'; steps: string[] };
  shippingCarrier?: CarrierAdapter;
  onEvent?(event: StoreEventRecord, context: ExtensionContext): Promise<void>;
}
