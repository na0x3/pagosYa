import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');

const base = { storeName: 'Marca', items: [{ id: 'p1', name: 'Café', amount: 2000, currency: 'BOB', stock: null, imageUrls: [] }] };
async function shop(kind: string, extra: Record<string, unknown> = {}, live?: Record<string, unknown>, fetchImpl?: () => Promise<unknown>) {
  const dom = new JSDOM(`<html><head></head><body><button data-cart-open>Pedido</button><section data-pagosya-catalog></section><section data-pagosya-cart></section><main><div data-pagosya-page="${kind}"></div></main><footer><nav data-pagosya-pages></nav></footer><p data-pagosya-status></p></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.matchMedia = () => ({ matches: true });
  const data = { ...base, ...extra };
  w.PAGOSYA_PREVIEW = !live;
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data };
  w.fetch = jest.fn(fetchImpl ?? (async () => ({ ok: true, json: async () => ({ ...data, ...live }) })));
  w.eval(commerce);
  await new Promise(resolve => setTimeout(resolve, 60));
  return w;
}
const mount = (w: any) => w.document.querySelector('[data-pagosya-page]') as HTMLElement;
const noindex = (w: any) => w.document.querySelector('meta[name="robots"][content="noindex"]');
const UNAVAILABLE = 'Esta información aún no está disponible.';
const HOSTILE = 'Hola <script>alert(1)</script> `x` ${y} "z"';

describe('information pages in the storefront runtime', () => {
  it('shows the about text as escaped paragraphs under the tagline, and is indexable', async () => {
    const w = await shop('about', { tagline: 'Café de altura', aboutText: `Primero.\n\n${HOSTILE}` });
    expect(mount(w).textContent).toContain('Café de altura');
    expect(mount(w).querySelectorAll('p').length).toBeGreaterThanOrEqual(3);
    expect(mount(w).innerHTML).toContain('&lt;script&gt;');
    expect(mount(w).querySelector('script')).toBeNull();
    expect(noindex(w)).toBeNull();
    w.close();
  });

  it('says the page is unavailable, links home and asks not to be indexed when there is nothing to show', async () => {
    const w = await shop('about', {});
    expect(mount(w).textContent).toContain(UNAVAILABLE);
    expect(mount(w).querySelector('a[href="index.html"]')).not.toBeNull();
    expect(noindex(w)).not.toBeNull();
    w.close();
  });

  it.each([['refund', 'returns'], ['privacy', 'privacy'], ['terms', 'terms']])('%s shows only the policy the merchant wrote, escaped', async (kind, key) => {
    const w = await shop(kind, { policies: { [key]: HOSTILE } });
    expect(mount(w).innerHTML).toContain('&lt;script&gt;');
    expect(mount(w).querySelector('script')).toBeNull();
    const empty = await shop(kind, { policies: { returns: '', privacy: '  ', terms: undefined } });
    expect(mount(empty).textContent).toContain(UNAVAILABLE);
    w.close(); empty.close();
  });

  it.each([null, [], 'texto', 7, { returns: 5, privacy: null, terms: [] }])('treats malformed policies %j as not written', async policies => {
    const w = await shop('refund', { policies });
    expect(mount(w).textContent).toContain(UNAVAILABLE);
    w.close();
  });

  it('links a well-formed phone and email, never a malformed one, and lists locations with hours', async () => {
    const w = await shop('contact', {
      contactPhone: '+591 7000 0000', contactEmail: 'hola@marca.bo',
      locations: [{ id: 'l1', name: 'Centro', address: 'Av. <b>6</b>', pickupEnabled: true, deliveryEnabled: false, openingHours: [{ day: 1, open: '09:00', close: '18:00', closed: false }, { day: 0, open: '', close: '', closed: true }] }],
    });
    expect(mount(w).querySelector('a[href="tel:+59170000000"]')).not.toBeNull();
    expect(mount(w).querySelector('a[href="mailto:hola@marca.bo"]')).not.toBeNull();
    expect(mount(w).textContent).toContain('lunes: 09:00 a 18:00');
    expect(mount(w).textContent).toContain('domingo: cerrado');
    expect(mount(w).innerHTML).toContain('Av. &lt;b&gt;6&lt;/b&gt;');
    const bad = await shop('contact', { contactPhone: 'javascript:alert(1)', contactEmail: '"><img src=x onerror=alert(1)>' });
    expect(bad.document.querySelector('[data-pagosya-page] a[href^="javascript"]')).toBeNull();
    expect(bad.document.querySelector('[data-pagosya-page] img')).toBeNull();
    w.close(); bad.close();
  });

  it('shows the delivery policy and the places that deliver or allow pickup on the shipping page', async () => {
    const w = await shop('shipping', { policies: { delivery: 'Entregamos en 48 horas.' }, locations: [{ id: 'l1', name: 'Centro', pickupEnabled: true, deliveryEnabled: true, openingHours: [] }] });
    expect(mount(w).textContent).toContain('Entregamos en 48 horas.');
    expect(mount(w).textContent).toContain('Retiro en tienda · Entrega a domicilio');
    const none = await shop('shipping', {});
    expect(mount(none).textContent).toContain(UNAVAILABLE);
    w.close(); none.close();
  });

  it('builds the FAQ only from stated facts, and needs at least two answers', async () => {
    const one = await shop('faq', { contactEmail: 'hola@marca.bo' });
    expect(mount(one).textContent).toContain(UNAVAILABLE);
    const w = await shop('faq', { checkoutMode: 'payment', shippingEnabled: true, contactEmail: 'hola@marca.bo', locations: [{ id: 'l1', name: 'Centro', address: 'Av. 6', pickupEnabled: true, deliveryEnabled: false, openingHours: [] }] });
    const text = mount(w).textContent!;
    for (const question of ['¿Hacen envíos?', '¿Puedo retirar mi pedido?', '¿Dónde están?', '¿Cómo pago?', '¿Cómo los contacto?']) expect(text).toContain(question);
    const partial = await shop('faq', { checkoutMode: 'payment', contactEmail: 'hola@marca.bo' });
    expect(mount(partial).textContent).toContain('¿Cómo pago?');
    expect(mount(partial).textContent).not.toContain('¿Hacen envíos?');
    expect(mount(partial).textContent).not.toContain('¿Dónde están?');
    one.close(); w.close(); partial.close();
  });

  it('always shows the cookies page, and says the store uses no cookies', async () => {
    const w = await shop('cookies', {});
    expect(mount(w).textContent).toContain('no usa cookies');
    expect(noindex(w)).toBeNull();
    w.close();
  });

  it('shows a not-found message with a link home', async () => {
    const w = await shop('notfound', {});
    expect(mount(w).textContent).toContain('no existe');
    expect(mount(w).querySelector('a[href="index.html"]')).not.toBeNull();
    w.close();
  });

  it('fills a page from the live store, not from the published data', async () => {
    const w = await shop('refund', { policies: {} }, { policies: { returns: 'Cambios en 7 días.' } });
    expect(mount(w).textContent).toContain('Cambios en 7 días.');
    expect(noindex(w)).toBeNull();
    w.close();
  });
});

describe('information pages while the live store is slow or unavailable', () => {
  const never = () => new Promise<never>(() => {});
  const down = async () => ({ ok: false, status: 429, json: async () => ({}) });

  it('shows the fixed pages at once, without waiting for the live store', async () => {
    for (const kind of ['cookies', 'notfound']) {
      const w = await shop(kind, {}, {}, never);
      expect({ kind, text: mount(w).textContent!.length > 20 }).toEqual({ kind, text: true });
      w.close();
    }
  });

  it('does not show "no disponible" for a page that needs store data while that data is still loading', async () => {
    const w = await shop('refund', { policies: { returns: 'Cambios en 7 días.' } }, {}, never);
    expect(mount(w).textContent).not.toContain(UNAVAILABLE);
    w.close();
  });

  it('falls back to the published data when the live store fails, and never asks search engines to drop the page for it', async () => {
    const w = await shop('refund', { policies: { returns: 'Cambios en 7 días.' } }, {}, down);
    expect(mount(w).textContent).toContain('Cambios en 7 días.');
    expect(noindex(w)).toBeNull();
    const empty = await shop('refund', {}, {}, down);
    expect(mount(empty).textContent).toContain(UNAVAILABLE);
    expect(noindex(empty)).toBeNull();
    w.close(); empty.close();
  });
});

describe('information page styling', () => {
  it('inherits the template colours and lays the nav out in a row', () => {
    const at = commerce.indexOf('.pagosya-info-nav');
    expect(at).toBeGreaterThan(-1);
    const css = commerce.slice(at, at + 600);
    expect(css).toMatch(/display:flex/);
    expect(css).toMatch(/color:inherit/);
  });
});
