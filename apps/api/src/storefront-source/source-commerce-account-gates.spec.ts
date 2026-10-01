import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');

async function gate(views: string[], config: Record<string, unknown> = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test' }, hosted = false) {
  const anchors = views.map(view => `<a href="#" data-pagosya-account="${view}">Ir</a>`).join('');
  const dom = new JSDOM(`<html><head></head><body><button data-cart-open>Pedido</button><section data-pagosya-catalog></section><section data-pagosya-cart></section><main>${anchors}</main><footer><nav data-pagosya-pages></nav></footer><p data-pagosya-status></p></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  if (hosted) { w.PAGOSYA_HOSTED = true; w.PAGOSYA_HOSTED_REQUEST = jest.fn(async () => ({ ok: true, body: {} })); w.__messages = []; w.addEventListener('message', (event: any) => w.__messages.push(event.data)); }
  w.PAGOSYA_CONFIG = { ...config, data: { storeName: 'Marca', items: [] } };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ storeName: 'Marca', items: [] }) }));
  w.eval(commerce);
  await new Promise(resolve => setTimeout(resolve, 60));
  return w;
}
const link = (w: any, view: string) => w.document.querySelector(`a[data-pagosya-account="${view}"]`) as HTMLAnchorElement;

describe('account gate buttons in the storefront runtime', () => {
  it('point each gate at the shopper account on the checkout origin', async () => {
    const views: Record<string, string> = {
      login: 'https://pay.test/cuenta/marca', register: 'https://pay.test/cuenta/marca/registro', 'forgot-password': 'https://pay.test/cuenta/marca/recuperar',
      'reset-password': 'https://pay.test/cuenta/marca/recuperar', orders: 'https://pay.test/cuenta/marca/pedidos', addresses: 'https://pay.test/cuenta/marca/direcciones',
      profile: 'https://pay.test/cuenta/marca/perfil', subscriptions: 'https://pay.test/cuenta/marca/suscripciones',
    };
    const w = await gate(Object.keys(views));
    for (const [view, href] of Object.entries(views)) expect(link(w, view).href).toBe(href);
    w.close();
  });

  it('shows "Cuenta no disponible", with no link, when the store has no checkout address', async () => {
    const w = await gate(['login', 'orders'], { slug: 'marca', apiBaseUrl: 'https://api.test' });
    for (const view of ['login', 'orders']) {
      expect(link(w, view).hasAttribute('href')).toBe(false);
      expect(link(w, view).getAttribute('aria-disabled')).toBe('true');
      expect(link(w, view).textContent).toBe('Cuenta no disponible');
    }
    w.close();
  });

  it('never links an unknown or hostile view', async () => {
    const w = await gate(['__proto__', 'x', 'constructor']);
    for (const view of ['__proto__', 'x', 'constructor']) expect(link(w, view).hasAttribute('href')).toBe(false);
    w.close();
  });

  it('asks the host to open the account page when a gate is clicked in a hosted store', async () => {
    const w = await gate(['orders'], undefined, true);
    link(w, 'orders').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(w.__messages).toContainEqual({ type: 'pagosya:source-external', url: 'https://pay.test/cuenta/marca/pedidos' });
    w.close();
  });
});
