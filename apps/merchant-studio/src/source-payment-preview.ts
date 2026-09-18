import { sourceCheckoutBranding } from "@pagosya/shared-types";
import { CHECKOUT_ORIGIN } from './api';
import type { SourceSnapshot } from './source-preview';
import './source-payment-preview.css';

import { sourcePaymentSummary } from './source-payment-summary';

/** Hosted payment UI is a sibling of authored source, outside its opaque sandbox. */
export function bindSourcePaymentPreview(sourceFrame: () => HTMLIFrameElement | null, snapshot: () => SourceSnapshot | null) {
  let active: HTMLDialogElement | null = null;
  const listener = (event: MessageEvent) => {
    const frame = sourceFrame();
    if (!frame || event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.type !== 'pagosya:source-payment-preview' || active) return;
    const current = snapshot();
    if (!current) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'source-payment-dialog';
    dialog.setAttribute('aria-label', 'Formulario de pago de pagosYa');
    dialog.innerHTML = '<header><strong>pagosYa · Pago de prueba</strong><button type="button" data-close>Volver al pedido</button></header><p role="status">Abriendo el formulario de pagosYa…</p><iframe title="Formulario de pago de pagosYa" allow="geolocation" referrerpolicy="no-referrer"></iframe>';
    const payment = dialog.querySelector('iframe')!;
    const status = dialog.querySelector('p')!;
    const controller = new AbortController();
    let timer: number | undefined;
    const close = () => { clearTimeout(timer); controller.abort(); dialog.close(); dialog.remove(); active = null; frame.focus(); };
    dialog.querySelector('[data-close]')!.addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    document.body.append(dialog); active = dialog; dialog.showModal();
    try {
      const summary = sourcePaymentSummary(current, event.data.cart);
      const config = current.files.find(f => f.path === 'config.js')?.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
      const store = config ? JSON.parse(config[1]).data : {};
      const branding = sourceCheckoutBranding({ ...store, name: summary.merchantName }, current);
      dialog.querySelector('strong')!.textContent = `${summary.merchantName} · Pago de prueba`;
      dialog.style.background = branding.background;
      dialog.style.color = branding.foreground;
      status.textContent = `Abriendo el pago de ${summary.merchantName}…`;
      const url = new URL('/?source_payment_preview=1', CHECKOUT_ORIGIN);
      const fulfillment = event.data.fulfillment;
      const delivery: Record<string, string> = fulfillment?.method === 'delivery' || fulfillment?.method === 'pickup' ? { fulfillmentMethod: fulfillment.method, deliveryAddress: typeof fulfillment.address === 'string' ? fulfillment.address.slice(0, 300) : '' } : {};
      url.hash = new URLSearchParams({ ...delivery, ...Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, String(value)])), parent_origin: location.origin }).toString();
      window.addEventListener('message', event => {
        if (event.source !== payment.contentWindow || event.origin !== url.origin || event.data?.source !== 'pagosya-checkout') return;
        if (event.data.type === 'CHECKOUT_READY') { clearTimeout(timer); status.hidden = true; payment.contentWindow?.postMessage({ source: 'pagosya-studio', type: 'CHECKOUT_PREVIEW_BRANDING', branding }, url.origin); }
        if (event.data.type === 'PAYMENT_PREVIEW_CLOSED') close();
      }, { signal: controller.signal });
      payment.src = url.href;
      timer = window.setTimeout(() => { status.textContent = 'No pudimos abrir el formulario. Vuelve al pedido e inténtalo de nuevo.'; }, 15000);
    } catch (error) { payment.remove(); status.textContent = error instanceof Error ? error.message : 'No pudimos abrir el formulario.'; }
  };
  window.addEventListener('message', listener);
  window.addEventListener('pagehide', () => { window.removeEventListener('message', listener); active?.close(); }, { once: true });
}
