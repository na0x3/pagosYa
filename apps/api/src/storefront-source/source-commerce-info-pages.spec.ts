import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');

const base = { storeName: 'Marca', items: [{ id: 'p1', name: 'Café', amount: 2000, currency: 'BOB', stock: null, imageUrls: [] }] };
async function shop(kind: string, extra: Record<string, unknown> = {}, live?: Record<string, unknown>, fetchImpl?: () => Promise<unknown>, query = '') {
  const dom = new JSDOM(`<html><head></head><body><button data-cart-open>Pedido</button><section data-pagosya-catalog></section><section data-pagosya-cart></section><main><div data-pagosya-page="${kind}"></div></main><footer><nav data-pagosya-pages></nav></footer><p data-pagosya-status></p></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.matchMedia = () => ({ matches: true });
  const data = { ...base, ...extra };
  w.PAGOSYA_PREVIEW = !live;
  if (query) w.PAGOSYA_PREVIEW_QUERY = query;
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

describe('catalog pages in the storefront runtime', () => {
  const cafe = (n: number, extra: Record<string, unknown> = {}) => ({ id: `p${n}`, name: `Café ${n}`, description: 'Grano de altura', amount: 6500, currency: 'BOB', stock: 5, imageUrls: ['/v1/uploads/a.jpg'], tags: ['origen'], ...extra });
  const items = [cafe(1), cafe(2, { name: 'Té verde', description: 'Hojas enteras', tags: [] }), cafe(3, { name: 'Taza <b>azul</b>', description: '', imageUrls: ['javascript:alert(1)'] })];

  it('lists only the collections that hold products, with their count and link, and every product', async () => {
    const w = await shop('collections', { items, collections: [{ name: 'Cafés', slug: 'cafes', productIds: ['p1', 'p2', 'gone'] }, { name: 'Vacía', slug: 'vacia', productIds: [] }, { name: 'Sin ids', slug: 'x' }] });
    const links = Array.from(mount(w).querySelectorAll('a')).map((a: any) => a.getAttribute('href'));
    expect(links).toContain('coleccion.html?c=cafes');
    expect(links).toContain('productos.html');
    expect(links).not.toContain('coleccion.html?c=vacia');
    expect(mount(w).textContent).toContain('Cafés');
    expect(mount(w).textContent).toContain('2 productos');
    const none = await shop('collections', { items, collections: [] });
    expect(mount(none).textContent).toContain(UNAVAILABLE);
    w.close(); none.close();
  });

  it('shows the search form and waits for a query', async () => {
    const w = await shop('search', { items });
    expect(mount(w).querySelector('form[role="search"] input[name="q"]')).not.toBeNull();
    expect(mount(w).querySelectorAll('li').length).toBe(0);
    expect(noindex(w)).toBeNull();
    w.close();
  });

  it('finds products ignoring case and accents, and links each to its page', async () => {
    const w = await shop('search', { items }, undefined, undefined, '?q=CAFE');
    expect(mount(w).querySelector('a[href="product.html?id=p1"]')).not.toBeNull();
    expect(mount(w).querySelector('a[href="product.html?id=p2"]')).toBeNull();
    expect(mount(w).textContent).toContain('Café 1');
    expect(mount(w).textContent).toMatch(/Bs|BOB/);
    w.close();
  });

  it('needs every word of the query, matching name, description and tags', async () => {
    const both = await shop('search', { items }, undefined, undefined, '?q=cafe+altura');
    expect(both.document.querySelectorAll('[data-pagosya-page] li')).toHaveLength(1);
    expect(both.document.querySelector('[data-pagosya-page] a[href="product.html?id=p1"]')).not.toBeNull();
    const tag = await shop('search', { items }, undefined, undefined, '?q=origen');
    expect(tag.document.querySelectorAll('[data-pagosya-page] li')).toHaveLength(2);
    const miss = await shop('search', { items }, undefined, undefined, '?q=cafe+zzz');
    expect(mount(miss).textContent).toContain('No encontramos productos');
    expect(miss.document.querySelectorAll('[data-pagosya-page] li')).toHaveLength(0);
    both.close(); tag.close(); miss.close();
  });

  it('escapes the query and product names, and never uses an unsafe image address', async () => {
    const w = await shop('search', { items }, undefined, undefined, '?q=' + encodeURIComponent('<script>alert(1)</script>'));
    expect(mount(w).querySelector('script')).toBeNull();
    expect(mount(w).innerHTML).toContain('&lt;script&gt;');
    const named = await shop('search', { items }, undefined, undefined, '?q=taza');
    expect(named.document.querySelector('[data-pagosya-page] b')).toBeNull();
    expect(named.document.querySelector('[data-pagosya-page] img[src^="javascript"]')).toBeNull();
    w.close(); named.close();
  });

  it('caps the results at 48 and the query at 80 characters', async () => {
    const many = Array.from({ length: 60 }, (_, i) => cafe(i + 1, { name: `Taza ${i + 1}` }));
    const w = await shop('search', { items: many }, undefined, undefined, '?q=taza');
    expect(w.document.querySelectorAll('[data-pagosya-page] li')).toHaveLength(48);
    const long = await shop('search', { items }, undefined, undefined, '?q=' + 'a'.repeat(200));
    expect((long.document.querySelector('[data-pagosya-page] input[name="q"]') as HTMLInputElement).value.length).toBe(80);
    w.close(); long.close();
  });

  it('is unavailable while the store has no products', async () => {
    const w = await shop('search', { items: [] });
    expect(mount(w).textContent).toContain(UNAVAILABLE);
    w.close();
  });

  it('links the catalog pages in the nav only when they have content', async () => {
    const full = await shop('about', { tagline: 'x', items, collections: [{ name: 'Cafés', slug: 'cafes', productIds: ['p1'] }] });
    const labels = Array.from(full.document.querySelectorAll('[data-pagosya-pages] a')).map((a: any) => a.textContent);
    expect(labels.slice(0, 2)).toEqual(['Colecciones', 'Buscar']);
    const empty = await shop('about', { tagline: 'x', items: [] });
    const emptyLabels = Array.from(empty.document.querySelectorAll('[data-pagosya-pages] a')).map((a: any) => a.textContent);
    expect(emptyLabels).not.toContain('Colecciones');
    expect(emptyLabels).not.toContain('Buscar');
    full.close(); empty.close();
  });
});
