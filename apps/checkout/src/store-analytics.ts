import { privacy } from './privacy';
import { API_BASE_URL } from './api';

/** G1 allow-lists: the API's store-analytics.constants and the kit's commerce.js keep the same (tests pin them). */
export const ANALYTICS_EVENT_TYPES = ['page_view', 'cta_click', 'product_card_impression', 'product_card_click', 'product_view', 'add_to_cart', 'cart_open', 'checkout_step', 'pay_click', 'whatsapp_click', 'contact_submit', 'search'] as const;
export const ANALYTICS_TRACK_LABELS = ['hero-cta', 'nav-cart', 'nav-catalog', 'card', 'add', 'checkout', 'pay', 'whatsapp', 'contact', 'promo', 'social', 'newsletter'] as const;
export const ANALYTICS_CHECKOUT_STEPS = ['review', 'delivery', 'contact', 'payment'] as const;
type AnalyticsEvent = { type: string; productId?: string; target?: string; step?: string; path?: string };
const includes = (list: readonly string[], value: unknown): value is string => typeof value === 'string' && list.includes(value);
const PRODUCT_EVENTS = ['product_card_impression', 'product_card_click', 'product_view', 'add_to_cart'];
const BATCH = 20;

/** Keeps only allow-listed events and fields: whatever the store's frame posts, nothing else leaves this page. */
function clean(raw: unknown): AnalyticsEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  if (!includes(ANALYTICS_EVENT_TYPES, input.type)) return null;
  const event: AnalyticsEvent = { type: input.type };
  const productId = typeof input.productId === 'string' && /^[\w-]{1,64}$/.test(input.productId) ? input.productId : undefined;
  if (PRODUCT_EVENTS.includes(event.type)) { if (!productId) return null; event.productId = productId; }
  if (event.type === 'cta_click') { if (!includes(ANALYTICS_TRACK_LABELS, input.target)) return null; event.target = input.target; if (productId) event.productId = productId; }
  if (event.type === 'checkout_step') { if (!includes(ANALYTICS_CHECKOUT_STEPS, input.step)) return null; event.step = input.step; }
  if (typeof input.path === 'string' && /^[a-z0-9][a-z0-9_-]{0,60}\.html$/.test(input.path)) event.path = input.path;
  return event;
}

/** The host of the page that sent the shopper here, when it is another site; never the address itself. */
function referrerHost(): string | undefined {
  try {
    if (!document.referrer) return;
    const url = new URL(document.referrer);
    return url.origin === location.origin || !/^https?:$/.test(url.protocol) ? undefined : url.hostname.replace(/^www\./, '');
  } catch { return; }
}

/**
 * Store analytics (G1) for a hosted store. Nothing is kept or sent in an owner preview or without the shopper's
 * consent (GPC included, see privacy.js). Events share the funnel's session id, card impressions count once per
 * product per session, the referrer host goes with the session's first page view, and batches of up to 20 leave
 * every 5 s, at 20 queued, and when the page is hidden or left. A failed batch is dropped: analytics never retries
 * into double counts or interrupts buying.
 */
export function createStoreAnalytics(slug: string, preview: boolean, session: () => string | undefined) {
  const key = `pagosya:analytics:${slug}`;
  let queue: AnalyticsEvent[] = [], queueSession = '', referrer: string | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const allowed = () => !preview && privacy.analyticsAllowed(slug);
  const memory = (id: string): { id: string; seen: string[]; referred: boolean } => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved?.id === id && Array.isArray(saved.seen)) return { id, seen: saved.seen.filter((value: unknown) => typeof value === 'string').slice(-500), referred: saved.referred === true };
    } catch {}
    return { id, seen: [], referred: false };
  };
  const remember = (state: { id: string; seen: string[]; referred: boolean }) => { try { sessionStorage.setItem(key, JSON.stringify(state)); } catch {} };
  function flush() {
    if (timer) { clearTimeout(timer); timer = undefined; }
    if (!allowed()) { queue = []; referrer = undefined; return; }
    while (queue.length) {
      const events = queue.splice(0, BATCH);
      const body = JSON.stringify({ sessionId: queueSession, events, ...(referrer ? { referrer } : {}) });
      referrer = undefined;
      try {
        void fetch(`${API_BASE_URL}/stores/public/${encodeURIComponent(slug)}/events`, {
          method: 'POST', credentials: 'omit', keepalive: true, headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(2500),
        }).catch(() => {});
      } catch { /* Analytics must never interrupt buying. */ }
    }
  }
  function record(raw: unknown) {
    if (!allowed()) { queue = []; return; }
    const event = clean(raw);
    const id = event && session();
    if (!event || !id) return;
    if (id !== queueSession) { flush(); queueSession = id; }
    const state = memory(id);
    if (event.type === 'product_card_impression') {
      if (state.seen.includes(event.productId!)) return;
      state.seen.push(event.productId!); remember(state);
    }
    if (event.type === 'page_view' && !state.referred) { state.referred = true; remember(state); referrer = referrerHost(); }
    queue.push(event);
    if (queue.length >= BATCH) flush();
    else if (!timer) timer = setTimeout(flush, 5000);
  }
  const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
  const consent = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail?.slug === slug && !detail.analytics) { queue = []; referrer = undefined; } };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagosya:privacy-change', consent);
  return {
    record,
    flush,
    dispose() { flush(); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagosya:privacy-change', consent); },
  };
}

/** Units per product across cart lines (variants and extras of one product add up). */
export function productQuantities(lines: Iterable<[string, number]>, productOf: (key: string) => string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [key, quantity] of lines) { const id = productOf(key); totals.set(id, (totals.get(id) || 0) + quantity); }
  return totals;
}
/** The products that gained units between two carts: the legacy storefront's add_to_cart events. */
export const addedProducts = (before: Map<string, number>, after: Map<string, number>): string[] =>
  [...after].filter(([id, quantity]) => quantity > (before.get(id) || 0)).map(([id]) => id);
