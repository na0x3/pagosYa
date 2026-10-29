import { describe, expect, it, vi } from 'vitest';
import { forwardPixelEvent } from './store-pixels';

// Overnight 2026-10-29: a hosted store's kit runs in a sandbox with no gtag/fbq/ttq, so product views, adds to cart and
// checkout starts never reached the merchant's ads. The kit now hands them up; this page passes them to the tags it has.
describe('forwardPixelEvent', () => {
  const runtime = () => ({ gtag: vi.fn(), fbq: vi.fn(), ttq: { track: vi.fn() } });
  it('passes an allowed event to every loaded tag, amounts in major units', () => {
    const r = runtime();
    expect(forwardPixelEvent({ type: 'pagosya:pixel', event: 'add_to_cart', value: 4500, currency: 'bob' }, r)).toBe(true);
    expect(r.gtag).toHaveBeenCalledWith('event', 'add_to_cart', { value: 45, currency: 'BOB' });
    expect(r.fbq).toHaveBeenCalledWith('track', 'AddToCart', { value: 45, currency: 'BOB' });
    expect(r.ttq.track).toHaveBeenCalledWith('AddToCart', { value: 45, currency: 'BOB' });
  });
  it('sends no amount it cannot trust', () => {
    const r = runtime();
    forwardPixelEvent({ event: 'checkout_started', value: 'x', currency: 'BOB' }, r);
    forwardPixelEvent({ event: 'product_view', value: 100, currency: '<script>' }, r);
    expect(r.fbq).toHaveBeenNthCalledWith(1, 'track', 'InitiateCheckout', {});
    expect(r.fbq).toHaveBeenNthCalledWith(2, 'track', 'ViewContent', {});
  });
  it('ignores any other event name, and a page with no tags (no consent) does nothing', () => {
    const r = runtime();
    expect(forwardPixelEvent({ event: 'purchase', value: 100, currency: 'BOB' }, r)).toBe(false);
    expect(forwardPixelEvent({ event: 'toString' }, r)).toBe(false);
    expect(r.fbq).not.toHaveBeenCalled();
    expect(forwardPixelEvent({ event: 'add_to_cart', value: 100, currency: 'BOB' }, {})).toBe(true);
  });
});
