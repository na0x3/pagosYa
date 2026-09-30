import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kitPath } from '@pagosya/storefront-kit';
import { validatedCart } from '../src/source-storefront';
import type { Store } from '../src/api';

vi.mock('../src/privacy', () => ({ privacy: { mount: vi.fn(), analyticsAllowed: () => false } }));

const commerce = readFileSync(kitPath('commerce.js'), 'utf8');

describe('hosted cart validation', () => {
  it('keeps a valid subscription cadence', () => {
    expect(validatedCart([{ id: 'p1', quantity: 1, subscriptionCadence: 'MONTHLY' }], 'extraIds')).toEqual([{ id: 'p1', quantity: 1, subscriptionCadence: 'MONTHLY' }]);
  });
  it('rejects an unknown cadence', () => {
    expect(validatedCart([{ id: 'p1', quantity: 1, subscriptionCadence: 'DAILY' }], 'extraIds')).toBeNull();
  });
  it('leaves lines without a cadence unchanged', () => {
    expect(validatedCart([{ id: 'p1', quantity: 2 }])).toEqual([{ id: 'p1', quantity: 2 }]);
  });
});

const coffee = { id: 'coffee', name: 'Café', amount: 10000, currency: 'BOB', variants: [], extras: [], subscriptionOptions: [{ cadence: 'WEEKLY', discountPercent: 5 }, { cadence: 'MONTHLY', discountPercent: 10 }] };
const tea = { id: 'tea', name: 'Té', amount: 5000, currency: 'BOB', variants: [], extras: [], discountPercent: 40, subscriptionOptions: [{ cadence: 'MONTHLY', discountPercent: 10 }] };
const plain = { id: 'plain', name: 'Taza', amount: 3000, currency: 'BOB', variants: [], extras: [] };
const catalog = (over: Record<string, unknown> = {}) => ({ storeName: 'Tienda', checkoutMode: 'payment', subscriptionsEnabled: true, items: [coffee, tea, plain], categories: [], ...over }) as unknown as Store;
const windows: JSDOM[] = [];

function runtime(store: Store, cart: unknown[] = [], html = '<body><section data-pagosya-cart data-checkout-review></section><div data-pagosya-product></div><p data-pagosya-status></p></body>') {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS stylesheet')) throw error; });
  const dom = new JSDOM(html, { runScripts: 'outside-only', virtualConsole });
  windows.push(dom);
  const w = dom.window as any;
  w.PAGOSYA_HOSTED = true;
  w.PAGOSYA_PREVIEW_CART = cart;
  w.PAGOSYA_CONFIG = { slug: 'tienda', data: store, apiBaseUrl: 'https://api.test' };
  w.PAGOSYA_HOSTED_REQUEST = vi.fn(async () => ({ ok: true, body: {} }));
  w.matchMedia = () => ({ matches: true });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  Object.defineProperty(w, 'parent', { value: { postMessage: vi.fn() } });
  w.eval(commerce);
  return w;
}
const serialized = (w: any) => { const detail = { items: [] as unknown[] }; w.document.dispatchEvent(new w.CustomEvent('pagosya:serialize-cart', { detail })); return detail.items; };
const restore = (w: any, items: unknown[]) => w.document.dispatchEvent(new w.CustomEvent('pagosya:restore-cart', { detail: { items } }));

afterEach(() => { windows.splice(0).forEach(dom => dom.window.close()); vi.restoreAllMocks(); });

describe('kit cart with subscription lines', () => {
  it('round-trips a subscription line next to a one-time line of the same product', () => {
    const items = [{ id: 'coffee', quantity: 1 }, { id: 'coffee', quantity: 2, subscriptionCadence: 'MONTHLY' }];
    expect(serialized(runtime(catalog(), items))).toEqual(items);
  });

  it('drops persisted subscription lines when subscriptions are off or checkout is not online payment', () => {
    const items = [{ id: 'coffee', quantity: 1 }, { id: 'coffee', quantity: 1, subscriptionCadence: 'MONTHLY' }];
    for (const over of [{ subscriptionsEnabled: false }, { checkoutMode: 'whatsapp' }, { checkoutMode: 'external' }]) {
      expect(serialized(runtime(catalog(over), items))).toEqual([{ id: 'coffee', quantity: 1 }]);
    }
  });

  it('drops a cadence the product does not offer and keeps only one cadence per cart', () => {
    const items = [{ id: 'tea', quantity: 1, subscriptionCadence: 'WEEKLY' }, { id: 'coffee', quantity: 1, subscriptionCadence: 'MONTHLY' }, { id: 'coffee', quantity: 1, subscriptionCadence: 'WEEKLY' }];
    expect(serialized(runtime(catalog(), items))).toEqual([{ id: 'coffee', quantity: 1, subscriptionCadence: 'MONTHLY' }]);
  });

  it('prices a subscription line as the lower of one-time and discounted base, labelled with its cadence', () => {
    const w = runtime(catalog(), [{ id: 'coffee', quantity: 1, subscriptionCadence: 'MONTHLY' }, { id: 'tea', quantity: 1, subscriptionCadence: 'MONTHLY' }]);
    const text = w.document.querySelector('[data-pagosya-cart]').textContent.replace(/\s+/g, ' ');
    expect(text).toContain('Suscripción · cada mes');
    // Coffee: 100 - 10% = 90. Tea: one-time is 40% off (30) and beats 50 - 10% (45).
    expect(text.replace(/ /g, ' ')).toMatch(/Subtotal\s*Bs\s*120/);
  });

  it('asks for consent only at payment and sends it with the cadence', async () => {
    const w = runtime(catalog(), [{ id: 'coffee', quantity: 1, subscriptionCadence: 'MONTHLY' }]);
    const label = w.document.querySelector('.commerce-consent');
    expect(label.textContent.trim()).toBe('Acepto que este pedido se repita cada mes. Antes de cada entrega recibiré un enlace para pagar; no se cobra nada automáticamente. Puedo saltar, pausar o cancelar cuando quiera.');
    const pay = w.document.querySelector('[data-pay]');
    pay.click();
    await new Promise(resolve => setTimeout(resolve));
    expect(w.PAGOSYA_HOSTED_REQUEST).not.toHaveBeenCalled();
    expect(w.document.querySelector('[data-pagosya-status]').textContent).toBe('Acepta las condiciones de la suscripción para continuar.');
    w.document.querySelector('[name=subscriptionConsent]').checked = true;
    w.document.querySelector('[data-pay]').click();
    await new Promise(resolve => setTimeout(resolve));
    const [action, body] = w.PAGOSYA_HOSTED_REQUEST.mock.calls[0];
    expect(action).toBe('checkout');
    expect(body).toMatchObject({ subscriptionConsent: true, items: [{ paymentLinkId: 'coffee', subscriptionCadence: 'MONTHLY', quantity: 1 }] });
  });

  it('does not ask for consent or send it for one-time carts', async () => {
    const w = runtime(catalog(), [{ id: 'coffee', quantity: 1 }]);
    expect(w.document.querySelector('.commerce-consent')).toBeNull();
    w.document.querySelector('[data-pay]').click();
    await new Promise(resolve => setTimeout(resolve));
    expect(w.PAGOSYA_HOSTED_REQUEST.mock.calls[0][1]).not.toHaveProperty('subscriptionConsent');
  });
});

describe('kit product page choice', () => {
  const page = '<body><section data-pagosya-cart></section><div data-pagosya-product-page></div><p data-pagosya-status></p></body>';
  // The page reads the query at boot, so set it before evaluating the runtime.
  const boot = (id: string, store: Store = catalog(), cart: unknown[] = []) => {
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS stylesheet')) throw error; });
    const dom = new JSDOM(page, { runScripts: 'outside-only', virtualConsole });
    windows.push(dom);
    const w = dom.window as any;
    Object.assign(w, { PAGOSYA_HOSTED: true, PAGOSYA_PREVIEW_CART: cart, PAGOSYA_PREVIEW_QUERY: `?id=${id}`, PAGOSYA_CONFIG: { slug: 'tienda', data: store, apiBaseUrl: 'https://api.test' }, PAGOSYA_HOSTED_REQUEST: vi.fn(async () => ({ ok: true, body: {} })), matchMedia: () => ({ matches: true }) });
    w.HTMLElement.prototype.scrollIntoView = () => {};
    Object.defineProperty(w, 'parent', { value: { postMessage: vi.fn() } });
    w.eval(commerce);
    return w;
  };
  const choose = (w: any, mode: string, cadence?: string) => {
    const radio = w.document.querySelector(`[name=purchaseMode][value=${mode}]`);
    radio.checked = true; radio.dispatchEvent(new w.Event('change', { bubbles: true }));
    if (cadence) { const select = w.document.querySelector('select[name=subscriptionCadence]'); select.value = cadence; select.dispatchEvent(new w.Event('change', { bubbles: true })); }
  };
  const buy = (w: any) => w.document.querySelector('.product-detail__buy');

  it('offers Compra única or Suscríbete y ahorra with the best discount and the no-auto-charge note', () => {
    const w = boot('coffee');
    const text = w.document.querySelector('[data-subscription-choice]').textContent.replace(/\s+/g, ' ');
    expect(text).toContain('Cómo lo quieres');
    expect(text).toContain('Compra única');
    expect(text).toContain('Suscríbete y ahorra hasta 10%');
    expect(text).toContain('No se cobra automáticamente');
    expect(w.document.querySelector('select[name=subscriptionCadence]').disabled).toBe(true);
  });

  it.each([{ subscriptionsEnabled: false }, { checkoutMode: 'whatsapp' }, { checkoutMode: 'external' }])('offers no choice when %o', over => {
    expect(boot('coffee', catalog(over)).document.querySelector('[data-subscription-choice]')).toBeNull();
  });

  it('offers no choice for a product without subscription options', () => {
    expect(boot('plain').document.querySelector('[data-subscription-choice]')).toBeNull();
  });

  it('adds a subscription line with the chosen frequency, and one-time stays separate', () => {
    const w = boot('coffee');
    buy(w).click();
    choose(w, 'subscribe', 'WEEKLY');
    expect(w.document.querySelector('select[name=subscriptionCadence]').disabled).toBe(false);
    buy(w).click();
    expect(serialized(w)).toEqual([{ id: 'coffee', quantity: 1 }, { id: 'coffee', quantity: 1, subscriptionCadence: 'WEEKLY' }]);
    expect(w.document.querySelector('[data-subscription-price]').textContent.replace(/\u00a0/g, ' ')).toBe('Bs 95,00 cada semana');
  });

  it('blocks a second frequency inline with the API message', () => {
    const w = boot('coffee', catalog(), [{ id: 'tea', quantity: 1, subscriptionCadence: 'MONTHLY' }]);
    choose(w, 'subscribe', 'WEEKLY');
    const message = 'Por ahora solo puedes suscribirte a una frecuencia por pedido. Separa las frecuencias en pedidos distintos.';
    expect(w.document.querySelector('[data-subscription-conflict]').textContent).toBe(message);
    buy(w).click();
    expect(serialized(w)).toEqual([{ id: 'tea', quantity: 1, subscriptionCadence: 'MONTHLY' }]);
    choose(w, 'subscribe', 'MONTHLY');
    expect(w.document.querySelector('[data-subscription-conflict]').hidden).toBe(true);
    buy(w).click();
    expect(serialized(w)).toEqual([{ id: 'tea', quantity: 1, subscriptionCadence: 'MONTHLY' }, { id: 'coffee', quantity: 1, subscriptionCadence: 'MONTHLY' }]);
  });
});
