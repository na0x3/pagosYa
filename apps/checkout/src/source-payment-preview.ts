import { normalizeCheckoutBranding } from "@pagosya/shared-types";
import type { CheckoutSession } from './api';

/** Preview data can only create a display session, never a PaymentIntent. */
export function readSourcePaymentPreview(hash: string): CheckoutSession {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const amount = Number(params.get('amount'));
  const currency = params.get('currency') || '';
  const merchantName = params.get('merchantName') || '';
  const description = params.get('description') || '';
  if (!Number.isSafeInteger(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency) || !merchantName || merchantName.length > 120 || description.length > 1500) throw new Error('El pedido de prueba no es válido. Vuelve a la tienda e inténtalo de nuevo.');
  const method = params.get('fulfillmentMethod');
  const fulfillment = method === 'delivery' || method === 'pickup' ? { method, address: (params.get('deliveryAddress') || '').slice(0, 300) } : undefined;
  return { id: 'source-payment-preview', amount, currency, merchantName, description, status: 'REQUIRES_PAYMENT_METHOD', branding: normalizeCheckoutBranding(null, merchantName), recipient: null, trackingToken: null, metadata: { cart: [], ...(fulfillment ? { fulfillment } : {}) } };
}

export function closeSourcePaymentPreview() {
  const value = new URLSearchParams(location.hash.slice(1)).get('parent_origin');
  if (!value || window.parent === window) return;
  try {
    const origin = new URL(value);
    if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname))) return;
    window.parent.postMessage({ source: 'pagosya-checkout', type: 'PAYMENT_PREVIEW_CLOSED' }, origin.origin);
  } catch { /* An invalid recipient cannot receive preview events. */ }
}

/** Only the trusted Studio parent can supply preview identity, never an authored iframe. */
export function bindPreviewBranding(session: CheckoutSession, onChange: () => void) {
  const origin = new URLSearchParams(location.hash.slice(1)).get('parent_origin');
  const listener = (event: MessageEvent) => {
    if (window.parent === window || event.source !== window.parent || event.origin !== origin || event.data?.source !== 'pagosya-studio' || event.data?.type !== 'CHECKOUT_PREVIEW_BRANDING') return;
    session.branding = normalizeCheckoutBranding(event.data.branding, session.merchantName);
    onChange();
  };
  window.addEventListener('message', listener);
  window.addEventListener('pagehide', () => window.removeEventListener('message', listener), { once: true });
}
