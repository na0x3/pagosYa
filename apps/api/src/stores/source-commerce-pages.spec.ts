import { sourceCommerceRoutes } from './source-commerce-pages';
describe('Authored commerce routes', () => {
  const pages = [
    {path:'index.html',content:'<div data-pagosya-cart></div>'},
    {path:'pages/checkout.html',content:'<header>Brand navigation</header><div data-pagosya-cart data-checkout-review="review"></div>'},
    {path:'pages/producto.html',content:'<div data-pagosya-cart></div>'},
  ];
  it('routes a legacy homepage cart to its designed checkout without guessing custom product query contracts', () => {
    expect(sourceCommerceRoutes(pages)).toEqual({checkoutPage:'pages/checkout.html',productPage:undefined});
  });
  it('preserves an explicit authored page and refuses missing, external or ambiguous routes', () => {
    const several=[...pages,{path:'other.html',content:'<main data-pagosya-checkout-page></main>'}];
    expect(sourceCommerceRoutes(several,{checkoutPage:'other.html'}).checkoutPage).toBe('other.html');
    expect(sourceCommerceRoutes(several,{checkoutPage:'https://example.com'}).checkoutPage).toBeUndefined();
    expect(sourceCommerceRoutes(several).checkoutPage).toBeUndefined();
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// Reuse the workspace's existing DOM test dependency; no browser download or
// production dependency is needed to execute the entire plain-JS runtime.
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(join(__dirname, 'source-kit/commerce.js'), 'utf8');
const variant = (id: string, color: string, size: string, amount = 2500, stock: number | null = 2) => ({
  id, name: `${color} / ${size}`, amount, stock,
  options: [{ name: 'Color', value: color }, { name: 'Talla', value: size }],
});
const product = () => ({
  id: 'shirt', name: 'Camisa', amount: 2000, currency: 'BOB', stock: null,
  imageUrls: ['https://shop.test/base.jpg'],
  variants: [variant('red-s', 'Rojo', 'S'), variant('red-m', 'Rojo', 'M', 3000, 0),
    { ...variant('blue-m', 'Azul', 'M', 4000, 1), imageUrl: 'https://shop.test/blue.jpg' }],
});

describe('Inline storefront product options', () => {
  const windows: any[] = [];
  const errors: Error[] = [];
  async function shop({ items = [product()] as any[], mode = 'preview', fullPage = false, template = '', saved = [] as any[], settings = {}, refreshedItems = items, onStart }: { items?: any[]; mode?: string; fullPage?: boolean; template?: string; saved?: any[]; settings?: Record<string, unknown>; refreshedItems?: any[]; onStart?: (w: any) => void } = {}) {
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (error: Error) => {
      // jsdom does not implement cascade layers; runtime and event errors still fail.
      if (!error.message.includes('Could not parse CSS stylesheet')) errors.push(error);
    });
    const dom = new JSDOM(`<html><head></head><body>${template}<button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog></section><section data-pagosya-cart></section>${fullPage ? '<main data-pagosya-product-page></main>' : ''}<p data-pagosya-status></p></body></html>`, { url: 'https://shop.test/product.html?id=shirt', runScripts: 'outside-only', virtualConsole });
    const w = dom.window; windows.push(w);
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
    w.HTMLElement.prototype.scrollIntoView = () => {};
    w.matchMedia = () => ({ matches: true });
    w.PAGOSYA_PREVIEW = mode === 'preview';
    w.PAGOSYA_HOSTED = mode === 'hosted';
    w.PAGOSYA_PREVIEW_CART = saved;
    const data = { storeName: 'Marca', items, ...settings };
    w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: mode === 'demo', data };
    const quote = { subtotal: 4000, discountAmount: 0, amount: 4000, currency: 'BOB', shippingOptions: [] };
    w.fetch = jest.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/store') ? { ...data, items: refreshedItems } : quote }));
    w.PAGOSYA_HOSTED_REQUEST = jest.fn(async () => ({ ok: true, body: quote }));
    (mode === 'demo' ? w.sessionStorage : w.localStorage).setItem('pagosya:cart:marca', JSON.stringify(saved));
    w.eval(commerce);
    onStart?.(w);
    await new Promise(resolve => setImmediate(resolve));
    const query = (selector: string) => w.document.querySelector(selector);
    const click = (selector: string) => { expect(query(selector)).not.toBeNull(); query(selector).click(); };
    const choose = (group: number, value: string) => {
      const button = [...w.document.querySelectorAll(`[data-product-option="${group}"]`)].find((b: any) => b.textContent === value) as any;
      expect(button).toBeDefined(); button.click(); return button;
    };
    const serialize = () => { const detail: any = {}; w.document.dispatchEvent(new w.CustomEvent('pagosya:serialize-cart', { detail })); return detail.items; };
    return { w, query, click, choose, serialize };
  }
  afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

  it.each([false, true])('renders labeled groups in the modal/full page (%s), resolves sparse combinations and updates price/photo', async fullPage => {
    const { query, click, choose } = await shop({ fullPage });
    if (!fullPage) click('.menu-add');
    expect(query('[data-pagosya-product]').querySelectorAll('fieldset legend').length).toBe(2);
    expect(query('[data-variant-add]').disabled).toBe(true);
    choose(0, 'Rojo');
    expect(choose(1, 'M').disabled).toBe(true);
    choose(1, 'S');
    expect(query('[data-variant-add]').disabled).toBe(false);
    expect(query('.product-detail__price').textContent).toMatch(/25[,.]00/);
    expect(query('.product-detail__photo').src).toBe('https://shop.test/base.jpg');
    expect(choose(0, 'Azul').getAttribute('aria-pressed')).toBe('true');
    expect(query('[data-variant-add]').disabled).toBe(true);
    expect(choose(1, 'S').disabled).toBe(true);
    choose(1, 'M');
    expect(query('.product-detail__price').textContent).toMatch(/40[,.]00/);
    expect(query('.product-detail__photo').src).toBe('https://shop.test/blue.jpg');
    expect(query('[data-product-image="1"]').getAttribute('aria-pressed')).toBe('true');
    click('[data-product-prev]');
    expect(query('.product-detail__photo').src).toBe('https://shop.test/base.jpg');
  });

  it('keeps different variants as distinct priced cart lines and enforces hidden stock and shared product limits', async () => {
    const p = product(); p.variants[2].stock = null;
    const { query, click, choose, serialize, w } = await shop({ items: [{ ...p, purchaseLimit: 2, discountPercent: 10, variants: p.variants.map(v => ({ ...v, purchaseLimit: v.id === 'blue-m' ? 1 : v.stock })) }] });
    click('.menu-add'); choose(0, 'Azul'); choose(1, 'M'); click('[data-variant-add]');
    expect(query('[data-variant-add]').disabled).toBe(true);
    choose(0, 'Rojo'); choose(1, 'S'); click('[data-variant-add]');
    expect(serialize()).toEqual([{ id: 'shirt', variantId: 'blue-m', quantity: 1 }, { id: 'shirt', variantId: 'red-s', quantity: 1 }]);
    expect(query('.order-items').textContent).toContain('Azul / M');
    expect(query('.order-total strong').textContent).toMatch(/58[,.]50/);
    expect([...w.document.querySelectorAll('.order-items [data-add]')].every((b: any) => b.disabled)).toBe(true);
    click('.order-items [data-remove]');
    expect(serialize()).toEqual([{ id: 'shirt', variantId: 'red-s', quantity: 1 }]);
    choose(0, 'Azul'); choose(1, 'M'); expect(query('[data-variant-add]').disabled).toBe(false);
  });

  it.each(['preview', 'demo'])('lets %s shoppers select options without a real purchase request', async mode => {
    const { w, click, choose, query } = await shop({ mode });
    click('.menu-add'); choose(0, 'Azul'); choose(1, 'M'); click('[data-variant-add]');
    click('[data-product-close]'); click('[data-checkout]'); click('[data-pay]');
    if (mode === 'demo') expect(query('[data-finish-demo]')).not.toBeNull();
    else {
      expect(query('[data-pay]').disabled).toBe(true);
      expect(query('[data-pagosya-checkout]').textContent).toContain('El pago estará disponible en la tienda publicada.');
    }
    expect(w.fetch).not.toHaveBeenCalled(); expect(w.PAGOSYA_HOSTED_REQUEST).not.toHaveBeenCalled();
    if (mode === 'demo') expect(JSON.parse(w.sessionStorage.getItem('pagosya:cart:marca'))[0].variantId).toBe('blue-m');
  });

  it('sends stable variant IDs for bundle, credit, shipping quotes and checkout through the hosted bridge', async () => {
    const { w, click, choose, query } = await shop({ mode: 'hosted', settings: { shippingEnabled: true, bundlesEnabled: true, creditsEnabled: true } });
    click('.menu-add'); choose(0, 'Azul'); choose(1, 'M'); click('[data-variant-add]');
    click('[data-product-close]'); click('[data-checkout]');
    query('[name=method]').value = 'delivery'; query('[name=shippingAddress]').value = 'Calle 1';
    click('[data-shipping-quote]'); click('[data-credit-apply]');
    await new Promise(resolve => setImmediate(resolve));
    query('[name=shippingZoneId]').innerHTML = '<option value="zone">Zona</option>';
    click('[data-pay]');
    await new Promise(resolve => setImmediate(resolve));
    const calls = w.PAGOSYA_HOSTED_REQUEST.mock.calls;
    expect(calls.filter(([action]: any[]) => action === 'shipping')).toHaveLength(3);
    expect(calls.some(([action]: any[]) => action === 'checkout')).toBe(true);
    for (const [, payload] of calls) expect(payload.items).toEqual([{ paymentLinkId: 'shirt', variantId: 'blue-m', quantity: 1 }]);
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it('restores legacy simple lines and variants, rejecting invalid selections and clamping aggregate stock', async () => {
    const { serialize, w } = await shop({ mode: 'live', items: [{ ...product(), purchaseLimit: 2 }, { id: 'coffee', name: 'Café', amount: 1000, stock: 2 }], saved: [
      { id: 'shirt', quantity: 1 }, { id: 'shirt', variantId: 'gone', quantity: 1 },
      { id: 'shirt', variantId: 'red-m', quantity: 1 }, { id: 'shirt', variantId: 'blue-m', quantity: 10 },
      { id: 'shirt', variantId: 'red-s', quantity: 10 }, { id: 'coffee', quantity: 10 },
    ] });
    expect(serialize()).toEqual([{ id: 'shirt', variantId: 'blue-m', quantity: 1 }, { id: 'shirt', variantId: 'red-s', quantity: 1 }, { id: 'coffee', quantity: 2 }]);
    expect(JSON.parse(w.localStorage.getItem('pagosya:cart:marca'))).toEqual(serialize());
    w.document.dispatchEvent(new w.CustomEvent('pagosya:restore-cart', { detail: { items: [{ id: 'shirt', variantId: 'red-s', quantity: 1 }] } }));
    expect(serialize()).toEqual([{ id: 'shirt', variantId: 'red-s', quantity: 1 }]);
  });

  it('revalidates variant IDs and quantities against the fresh live catalog', async () => {
    const p = product();
    const { serialize } = await shop({ mode: 'live', items: [p], refreshedItems: [{ ...p, variants: [variant('red-s', 'Rojo', 'S', 2500, 1)] }], saved: [{ id: 'shirt', variantId: 'blue-m', quantity: 1 }, { id: 'shirt', variantId: 'red-s', quantity: 2 }] });
    expect(serialize()).toEqual([{ id: 'shirt', variantId: 'red-s', quantity: 1 }]);
  });

  it('refreshes an already open modal against changed live variants', async () => {
    const p = product();
    const { query, choose } = await shop({ mode: 'live', items: [p], refreshedItems: [{ ...p, variants: [variant('red-s', 'Rojo', 'S', 7000, 1)] }], onStart: w => {
      w.document.querySelector('.menu-add').click();
      w.document.querySelector('[data-product-option="0"][data-option-value="1"]').click();
      w.document.querySelector('[data-product-option="1"][data-option-value="1"]').click();
      expect(w.document.querySelector('.product-detail__price').textContent).toMatch(/40[,.]00/);
      expect(w.document.querySelector('[data-variant-add]').disabled).toBe(true);
    } });
    expect(query('[data-pagosya-product]').open).toBe(true);
    expect(query('.product-detail__options').textContent).not.toContain('Azul');
    expect(query('[data-variant-add]').disabled).toBe(true);
    choose(0, 'Rojo'); choose(1, 'S');
    expect(query('.product-detail__price').textContent).toMatch(/70[,.]00/);
    expect(query('[data-variant-add]').disabled).toBe(false);
  });

  it('preserves variant IDs when saving and recovering a reminder cart', async () => {
    const { w, click, choose, query, serialize } = await shop({ mode: 'hosted' });
    click('.menu-add'); choose(0, 'Azul'); choose(1, 'M'); click('[data-variant-add]'); click('[data-product-close]');
    const saved = [{ paymentLinkId: 'shirt', variantId: 'blue-m', quantity: 1 }];
    w.PAGOSYA_HOSTED_REQUEST.mockImplementation(async (action: string, request: any) => ({ ok: true, body: request.path === '' ? { recoveryEnabled: true } : request.path === 'carts' ? { token: 'token' } : { items: saved } }));
    w.eval(readFileSync(join(__dirname, 'source-kit/retention.js'), 'utf8'));
    await new Promise(resolve => setImmediate(resolve));
    query('[data-retention-recovery] [name=email]').value = 'buyer@example.test';
    query('[data-retention-recovery] [name=consent]').checked = true;
    query('[data-retention-recovery] form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setImmediate(resolve));
    expect(w.PAGOSYA_HOSTED_REQUEST.mock.calls.find(([, request]: any[]) => request.path === 'carts')[1].payload.items).toEqual(saved);
    w.document.dispatchEvent(new w.CustomEvent('pagosya:restore-cart', { detail: { items: [] } }));
    w.PAGOSYA_PREVIEW_QUERY = '?recover=token';
    await w.PAGOSYA_RETENTION_MOUNT();
    expect(serialize()).toEqual([{ id: 'shirt', variantId: 'blue-m', quantity: 1 }]);
  });

  it('preserves simple-product adding, quantity changes and preview simulation', async () => {
    const { w, query, click, serialize } = await shop({ items: [{ id: 'coffee', name: 'Café', amount: 1000, stock: 2 }] });
    click('.menu-add'); click('.order-items [data-add]');
    expect(query('.menu-add').disabled).toBe(true);
    expect(query('.order-total strong').textContent).toMatch(/20[,.]00/);
    click('.order-items [data-remove]');
    expect(serialize()).toEqual([{ id: 'coffee', quantity: 1 }]);
    click('[data-checkout]'); click('[data-pay]');
    expect(query('[data-finish-demo]').disabled).toBe(false);
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it('disables sold-out option groups while keeping the options visible', async () => {
    const { query, click, w } = await shop({ items: [{ ...product(), stock: 0 }] });
    click('.menu-add');
    expect(query('[data-variant-add]').disabled).toBe(true);
    expect([...w.document.querySelectorAll('[data-product-option]')].every((b: any) => b.disabled)).toBe(true);
    expect(query('.product-detail__status').textContent).toContain('Sin disponibilidad');
  });

  it('keeps focus on option controls and does not hijack their arrow keys for gallery navigation', async () => {
    const { query, click, choose, w } = await shop();
    click('.menu-add'); const button = choose(0, 'Azul'); button.focus();
    button.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(w.document.activeElement).toBe(button);
    expect(query('.product-detail__photo').src).toBe('https://shop.test/base.jpg');
    choose(1, 'M'); expect(query('[data-variant-add]').disabled).toBe(false);
  });

  it('keeps authored quick-add styling while opening local options', async () => {
    const template = '<template data-pagosya-product-template><article><h3 data-product-field="name"></h3><strong data-product-field="price"></strong><a data-product-link>Detalles</a><button class="merchant-buy" data-product-add>Añadir</button></article></template>';
    const { query, click } = await shop({ template });
    expect(query('.merchant-buy').tagName).toBe('BUTTON');
    expect(query('.merchant-buy').disabled).toBe(false);
    click('.merchant-buy'); expect(query('[data-variant-add]')).not.toBeNull();
  });

  it('supports legacy named variants and image-only variants without product photos', async () => {
    const { query, click, choose } = await shop({ items: [{ ...product(), imageUrls: [], variants: [{ id: 'large', name: 'Grande', amount: 5000, imageUrl: 'https://shop.test/large.jpg' }] }] });
    click('.menu-add'); expect(query('legend').textContent).toBe('Opción'); choose(0, 'Grande');
    expect(query('[data-variant-add]').disabled).toBe(false);
    expect(query('.product-detail__photo').src).toBe('https://shop.test/large.jpg');
  });

  it.each(['extras', 'groups', 'combinations', 'ambiguous'])('retains the hosted fallback for unsupported %s', async kind => {
    const p: any = product();
    if (kind === 'extras') p.extras = [{ id: 'gift', name: 'Regalo', required: true }];
    if (kind === 'groups') p.variants.forEach((v: any) => v.options.push({ name: 'Formato', value: 'Uno' }, { name: 'Cadencia', value: 'Mes' }));
    if (kind === 'combinations') p.variants = Array.from({ length: 65 }, (_, i) => ({ id: String(i), name: String(i), amount: 100 }));
    if (kind === 'ambiguous') p.variants.push({ ...p.variants[0], id: 'duplicate' });
    const { query, click } = await shop({ mode: 'hosted', items: [p] });
    expect(query('.menu-add').href).toBe('https://pay.test/s/marca/p/shirt');
    click('[data-product]'); expect(query('.product-detail__buy').href).toBe('https://pay.test/s/marca/p/shirt');
    expect(query('[data-product-option]')).toBeNull();
  });

  it('handles the supported boundary of three groups and 64 combinations', async () => {
    const variants = Array.from({ length: 64 }, (_, i) => ({ id: `v${i}`, name: `Variante ${i}`, amount: i * 100, stock: null,
      options: [{ name: 'Color', value: String(Math.floor(i / 16)) }, { name: 'Talla', value: String(Math.floor(i / 4) % 4) }, { name: 'Formato', value: String(i % 4) }] }));
    const { click, choose, serialize } = await shop({ items: [{ ...product(), variants }] });
    click('.menu-add'); choose(0, '3'); choose(1, '3'); choose(2, '3'); click('[data-variant-add]');
    expect(serialize()).toEqual([{ id: 'shirt', variantId: 'v63', quantity: 1 }]);
  });

  it('escapes option names/values and ignores unsafe variant photos', async () => {
    const { click, choose, query } = await shop({ items: [{ ...product(), variants: [{ id: 'safe', name: '<script>bad</script>', amount: 0, stock: null, imageUrl: 'javascript:alert(1)', options: [{ name: '<b>Grupo</b>', value: '<img src=x onerror=alert(1)>' }] }] }] });
    click('.menu-add'); choose(0, '<img src=x onerror=alert(1)>');
    expect(query('.product-detail__options img')).toBeNull();
    expect(query('.product-detail__options b')).toBeNull();
    expect(query('.product-detail__photo').src).toBe('https://shop.test/base.jpg');
    expect(query('[data-variant-add]').disabled).toBe(false);
  });
});
