/**
 * Ad and analytics events a hosted store's kit hands up from its sandbox: product view, add to cart, checkout started
 * (overnight 2026-10-29 — inside the sandbox there is no gtag/fbq/ttq, so these never reached the merchant's ads).
 * The merchant's tags live on this page and exist only after the shopper accepted statistics, so a missing tag means
 * «do not track». Only these three events pass, and an amount only with a three-letter currency; the purchase is
 * reported by the payment result screen, never from the store.
 */
export const PIXEL_EVENTS: Readonly<Record<string, readonly [google: string, meta: string]>> = {
  product_view: ['view_item', 'ViewContent'],
  add_to_cart: ['add_to_cart', 'AddToCart'],
  checkout_started: ['begin_checkout', 'InitiateCheckout'],
};

type Runtime = {
  gtag?: (...args: unknown[]) => void;
  fbq?: (...args: unknown[]) => void;
  ttq?: { track?: (...args: unknown[]) => void };
};

/** True when `data` named an allowed event (sent to whichever tags are loaded); false for anything else. */
export function forwardPixelEvent(data: unknown, runtime: Runtime): boolean {
  if (!data || typeof data !== 'object') return false;
  const { event, value, currency } = data as Record<string, unknown>;
  if (typeof event !== 'string' || !Object.prototype.hasOwnProperty.call(PIXEL_EVENTS, event)) return false;
  const [google, meta] = PIXEL_EVENTS[event];
  // The kit counts in integer centavos; every provider expects major units.
  const amount = typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1e10 ? value / 100 : 0;
  const code = typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : '';
  const payload = amount && code ? { value: amount, currency: code } : {};
  try { runtime.gtag?.('event', google, payload); } catch { /* a broken tag never breaks the store */ }
  try { runtime.fbq?.('track', meta, payload); } catch { /* idem */ }
  try { runtime.ttq?.track?.(meta, payload); } catch { /* idem */ }
  return true;
}
