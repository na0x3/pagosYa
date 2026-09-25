import { API_BASE_URL } from './api';
import '@pagosya/storefront-kit/kit/retention.js';

/** Test sales in the source preview: a sample first stamp, no API call, visit or email. */
export function mountComebackPreviewCard(root: HTMLElement, card: { brand: Record<string, unknown>; visitsRequired: number; rewardLabel: string }, customerName?: string | null) {
  root.querySelector('[data-payment-comeback]')?.remove();
  const panel = document.createElement('section');
  panel.dataset.paymentComeback = 'preview';
  root.append(panel);
  presentComeback(panel, { ...card, customerName: customerName || 'Cliente de ejemplo', visits: 1, availableRewards: 0, currentPurchaseOnly: true }, {});
}

/**
 * The card opens centered once the printed receipt is closed; afterwards a
 * button under the receipt reopens it.
 */
function presentComeback(panel: HTMLElement, card: Record<string, unknown>, options: Record<string, unknown>) {
  panel.classList.add('comeback-reveal');
  panel.innerHTML = '<button type="button" class="comeback-reopen" data-comeback-open><span aria-hidden="true">✦</span> Ver mi tarjeta Comeback</button><dialog class="comeback-dialog" aria-labelledby="comeback-dialog-title"><button type="button" class="comeback-dialog-close" data-comeback-close aria-label="Cerrar tarjeta">×</button><p class="comeback-dialog-eyebrow">¡Sumaste un sello!</p><h2 id="comeback-dialog-title" class="comeback-dialog-title">Vuelve y gana tu premio</h2><div data-comeback-card></div><button type="button" class="comeback-dialog-done" data-comeback-close>Listo</button></dialog>';
  const dialog = panel.querySelector('dialog')!;
  (window as any).PAGOSYA_COMEBACK_RENDER(panel.querySelector('[data-comeback-card]'), card, { apiBaseUrl: API_BASE_URL, heading: false, ...options });
  const open = () => { if (!panel.isConnected || dialog.open) return; if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', ''); };
  const close = () => { if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); panel.querySelector<HTMLElement>('[data-comeback-open]')?.focus(); };
  panel.querySelector('[data-comeback-open]')!.addEventListener('click', open);
  panel.querySelectorAll('[data-comeback-close]').forEach(button => button.addEventListener('click', close));
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  // Wait for the receipt celebration (mounted right after this panel) so the two moments do not stack.
  window.setTimeout(() => {
    if (document.querySelector('.payment-success-overlay')) document.addEventListener('pagosya:receipt-closed', () => window.setTimeout(open, 180), { once: true });
    else open();
  }, 250);
}

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
    presentComeback(panel, card, { onEmail: () => request('/email') });
    panel.hidden = false;
  } catch {
    // An optional reward must never replace or interrupt a successful receipt.
    panel.remove();
  }
}
