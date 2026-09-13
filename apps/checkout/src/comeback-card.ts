import { API_BASE_URL } from './api';
import '../../api/src/stores/source-kit/retention.js';

/** Payment proof unlocks only this order; the private email link unlocks past visits. */
export async function mountComebackCard(root: HTMLElement, trackingToken: string, paymentIntentId?: string) {
  root.querySelector('[data-payment-comeback]')?.remove();
  const panel = document.createElement('section');
  panel.dataset.paymentComeback = '';
  panel.hidden = true;
  root.append(panel);
  const request = async (path = '') => {
    const response = await fetch(`${API_BASE_URL}/retention/payment-card${path}`, {
      method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackingToken }),
    });
    if (!response.ok) throw new Error('No se pudo cargar la tarjeta.');
    return response.json();
  };
  try {
    const card = await request();
    if (!card || !panel.isConnected || (paymentIntentId && card.paymentIntentId !== paymentIntentId)) { panel.remove(); return; }
    (window as any).PAGOSYA_COMEBACK_RENDER(panel, card, { apiBaseUrl: API_BASE_URL, onEmail: () => request('/email') });
    panel.hidden = false;
  } catch {
    // An optional reward must never replace or interrupt a successful receipt.
    panel.remove();
  }
}
