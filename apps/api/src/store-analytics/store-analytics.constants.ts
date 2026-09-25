/**
 * The G1 allow-lists. The kit (`packages/storefront-kit/kit/commerce.js`) and the host page
 * (`apps/checkout/src/store-analytics.ts`) keep their own copies; tests pin all three equal.
 */
export const ANALYTICS_EVENT_TYPES = [
  'page_view', 'cta_click', 'product_card_impression', 'product_card_click', 'product_view', 'add_to_cart',
  'cart_open', 'checkout_step', 'pay_click', 'whatsapp_click', 'contact_submit', 'search',
] as const;
export type AnalyticsEventType = typeof ANALYTICS_EVENT_TYPES[number];

/** The only values an authored `data-track` attribute may carry. */
export const ANALYTICS_TRACK_LABELS = ['hero-cta', 'nav-cart', 'nav-catalog', 'card', 'add', 'checkout', 'pay', 'whatsapp', 'contact', 'promo', 'social', 'newsletter'] as const;
export const ANALYTICS_CHECKOUT_STEPS = ['review', 'delivery', 'contact', 'payment'] as const;

/** Events that describe one product and are useless without its id. */
export const ANALYTICS_PRODUCT_EVENTS: readonly AnalyticsEventType[] = ['product_card_impression', 'product_card_click', 'product_view', 'add_to_cart'];
export const ANALYTICS_MAX_BATCH = 20;
/** Raw events are kept 13 calendar months (umbrella decision 5); rollups are kept. */
export const ANALYTICS_RETENTION_MONTHS = 13;
