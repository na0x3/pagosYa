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
  async function shop({ items = [product()] as any[], mode = 'preview', fullPage = false, template = '', saved = [] as any[], settings = {}, refreshedItems = items, onStart, content }: { items?: any[]; mode?: string; fullPage?: boolean; template?: string; saved?: any[]; settings?: Record<string, unknown>; refreshedItems?: any[]; onStart?: (w: any) => void; content?: any } = {}) {
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
    w.PAGOSYA_HOSTED_REQUEST = jest.fn(async (action: string) => ({ ok: true, body: action === 'content' && content ? content : quote }));
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
    expect(query('.product-detail__swatch').style.getPropertyValue('--swatch')).toBe('#b5443f');
    choose(0, 'Rojo');
    expect(query('[data-product-selection="0"]').textContent).toBe('Rojo');
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

  it('previews an unambiguous color photo before size selection without enabling purchase', async () => {
    const { query, choose } = await shop({ fullPage: true });
    choose(0, 'Azul');
    expect(query('.product-detail__photo').src).toBe('https://shop.test/blue.jpg');
    expect(query('[data-variant-add]').disabled).toBe(true);
    expect(query('[data-product-selection="1"]').textContent).toBe('');
  });

  it.each([undefined, 'https://shop.test/different.jpg'])('does not imply a specific photo when compatible sizes disagree (%s)', async otherImage => {
    const p = product();
    p.variants.push({ ...variant('blue-s', 'Azul', 'S'), imageUrl: otherImage } as any);
    const { query, choose } = await shop({ fullPage: true, items: [p] });
    choose(0, 'Azul');
    expect(query('.product-detail__photo').src).toBe('https://shop.test/base.jpg');
    choose(1, 'M');
    expect(query('.product-detail__photo').src).toBe('https://shop.test/blue.jpg');
  });

  it('shows the merchant description once, omits single-photo navigation and never invents delivery details', async () => {
    const description = 'Una camisa de algodón con botones de madera.';
    const { query, w } = await shop({ fullPage: true, items: [{ ...product(), variants: [], description, tags: ['Algodón', 'Algodón', '<strong>Madera</strong>'] }] });
    expect(w.document.querySelector('[data-pagosya-product]').textContent.split(description)).toHaveLength(2);
    expect(query('.product-detail__navigation').hidden).toBe(true);
    expect(query('[data-product-tab="delivery"]')).toBeNull();
    expect(query('.product-detail__facts').children).toHaveLength(2);
    expect(query('.product-detail__facts strong')).toBeNull();
    expect(query('.product-detail__facts').textContent).toContain('<strong>Madera</strong>');
  });

  it('keeps delivery tabs and keyboard navigation usable after removing duplicate description', async () => {
    const { query, click, w } = await shop({ fullPage: true, items: [{ ...product(), tags: ['Algodón'] }], settings: { shippingPickupEnabled: true } });
    click('[data-product-delivery]');
    expect(query('[data-product-tab="delivery"]').getAttribute('aria-selected')).toBe('true');
    expect(query('#product-delivery-panel').hidden).toBe(false);
    query('[data-product-tab="delivery"]').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(query('[data-product-tab="description"]').getAttribute('aria-selected')).toBe('true');
    expect(query('#product-delivery-panel').hidden).toBe(true);
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

  it('shows a failed payment next to its action and allows a retry without losing the variant', async () => {
    const { w, click, choose, query, serialize } = await shop({ mode: 'hosted' });
    w.PAGOSYA_HOSTED_REQUEST.mockResolvedValue({ ok: false, body: { message: 'No se pudo conectar. Vuelve a intentarlo.' } });
    click('.menu-add'); choose(0, 'Azul'); choose(1, 'M'); click('[data-variant-add]');
    click('[data-product-close]'); click('[data-checkout]'); click('[data-pay]');
    await new Promise(resolve => setImmediate(resolve));
    const feedback = query('.checkout-review__fields [data-pagosya-checkout-status]');
    expect(feedback.hidden).toBe(false);
    expect(feedback.textContent).toContain('No se pudo conectar');
    expect(query('[data-pay]').disabled).toBe(false);
    expect(query('[data-pay]').hasAttribute('aria-busy')).toBe(false);
    expect(serialize()).toEqual([{ id: 'shirt', variantId: 'blue-m', quantity: 1 }]);
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
    const photoBeforeArrow = query('.product-detail__photo').src;
    button.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(w.document.activeElement).toBe(button);
    expect(query('.product-detail__photo').src).toBe(photoBeforeArrow);
    choose(1, 'M'); expect(query('[data-variant-add]').disabled).toBe(false);
  });

  it('keeps authored quick-add styling while opening local options', async () => {
    const template = '<template data-pagosya-product-template><article><h3 data-product-field="name"></h3><strong data-product-field="price"></strong><a data-product-link>Detalles</a><button class="merchant-buy" data-product-add>Añadir</button></article></template>';
    const { query, click } = await shop({ template });
    expect(query('.merchant-buy').tagName).toBe('BUTTON');
    expect(query('.merchant-buy').disabled).toBe(false);
    click('.merchant-buy'); expect(query('[data-variant-add]')).not.toBeNull();
  });

  it('adds the selected quantity, clamps it to variant stock and leaves cart increments at one', async () => {
    const { query, click, choose, serialize } = await shop({ fullPage: true });
    expect(query('[data-product-quantity="1"]').disabled).toBe(true);
    choose(0, 'Rojo'); choose(1, 'S');
    click('[data-product-quantity="1"]');
    expect(query('[data-product-quantity-value]').textContent).toBe('2');
    expect(query('[data-product-subtotal]').textContent).toMatch(/50[,.]00/);
    expect(query('[data-product-quantity="1"]').disabled).toBe(true);
    click('[data-variant-add]');
    expect(serialize()).toEqual([{ id: 'shirt', variantId: 'red-s', quantity: 2 }]);
    expect(query('[data-variant-add]').disabled).toBe(true);
    click('.order-items [data-remove]');
    click('.order-items [data-add]');
    expect(serialize()[0].quantity).toBe(2);
    choose(0, 'Azul'); choose(1, 'M');
    expect(query('[data-product-quantity-value]').textContent).toBe('1');
  });

  it('shows exact verified review totals, recent reviews, specification rows and related products on the full page', async () => {
    const related = { id: 'cap', name: 'Gorra', amount: 1500, currency: 'BOB', stock: 4, imageUrls: ['https://shop.test/cap.jpg'] };
    const soldOut = { id: 'sock', name: 'Medias', amount: 900, currency: 'BOB', stock: 0 };
    const content = { articles: [], bundles: [], reviews: [{ id: 'r1', productId: 'shirt', displayName: 'Ana <b>', rating: 4, body: 'Buena tela.' }, { id: 'r2', productId: 'cap', displayName: 'Luis', rating: 5, body: 'Otra.' }], reviewSummary: { shirt: { count: 140, average: 4.8 } } };
    const { query, w } = await shop({ mode: 'hosted', fullPage: true, content, items: [{ ...product(), tags: ['Material: Algodón', 'Hecho en La Paz'], specifications: [{ label: 'Peso', value: '180 g/m²' }, { label: '<i>Origen</i>', value: 'Bolivia' }, { label: 'Vacío', value: ' ' }], recommendedProductIds: ['cap', 'sock', 'shirt', 'missing'] }, related, soldOut] });
    await new Promise(resolve => setImmediate(resolve));
    expect(query('[data-product-rating]').hidden).toBe(false);
    expect(query('[data-product-rating]').textContent).toContain('4,8 de 5 · 140 reseñas verificadas');
    expect(query('[data-product-reviews]').hidden).toBe(false);
    expect(query('.product-detail__review-list').children).toHaveLength(1);
    expect(query('.product-detail__review-list').textContent).toContain('Ana <b>');
    expect(query('.product-detail__review-list b')).toBeNull();
    expect(query('.product-detail__fact').textContent).toBe('MaterialAlgodón');
    expect(query('.product-detail__facts').children).toHaveLength(2);
    expect([...w.document.querySelectorAll('.product-detail__specs dt')].map((dt: any) => dt.textContent)).toEqual(['Peso', '<i>Origen</i>']);
    expect(query('.product-detail__specs i')).toBeNull();
    const links = [...w.document.querySelectorAll('.product-detail__related a')] as any[];
    expect(links.map(link => link.textContent)).toEqual([expect.stringContaining('Gorra')]);
    expect(links[0].getAttribute('href')).toContain('?id=cap');
  });

  it('never shows a rating without a published summary and never loads reviews in preview', async () => {
    const hosted = await shop({ mode: 'hosted', fullPage: true, content: { articles: [], bundles: [], reviews: [{ id: 'r1', productId: 'shirt', displayName: 'Ana', rating: 5, body: 'Bien.' }], reviewSummary: {} } });
    await new Promise(resolve => setImmediate(resolve));
    expect(hosted.query('[data-product-rating]').hidden).toBe(true);
    expect(hosted.query('[data-product-reviews]').hidden).toBe(true);
    const preview = await shop({ fullPage: true, content: { reviews: [], reviewSummary: { shirt: { count: 3, average: 5 } } } });
    expect(preview.query('[data-product-rating]').hidden).toBe(true);
    expect(preview.w.PAGOSYA_HOSTED_REQUEST).not.toHaveBeenCalledWith('content', expect.anything());
    expect(preview.query('.product-detail__related')).toBeNull();
  });

  it('keeps quantity with the action, shows the starting price before choices and exact choice prices only', async () => {
    const { query, choose, w } = await shop({ fullPage: true });
    expect(query('.product-detail__purchase .product-detail__buy')).not.toBeNull();
    expect(query('[data-product-total]').textContent).toMatch(/^desde .*25[,.]00/);
    // Choice labels are exact prices, never "desde" ranges (sold-out combinations do not count).
    const labels = () => [...w.document.querySelectorAll('[data-product-option]')].map((b: any) => b.dataset.optionPrice || '');
    expect(labels().filter(Boolean).length).toBeGreaterThan(0);
    expect(labels().some(label => label.includes('desde'))).toBe(false);
    choose(0, 'Azul');
    expect(query('[data-product-option="1"]:not([disabled])').textContent).toBe('M');
    choose(1, 'M');
    expect(query('[data-product-total]').textContent).toMatch(/40[,.]00/);
    expect(query('[data-product-total]').textContent).not.toContain('desde');
  });

  it('splits a photo-less full page into details and a purchase panel in reading order', async () => {
    const { query, w } = await shop({ fullPage: true, items: [{ ...product(), imageUrls: [], variants: product().variants.map(({ imageUrl, ...v }: any) => v), tags: ['Algodón'] }] });
    const copy = query('.product-detail__copy');
    expect(copy.hasAttribute('data-split')).toBe(true);
    expect([...copy.children].map((child: any) => child.className)).toEqual(['product-detail__summary', 'product-detail__buybox', 'product-detail__details']);
    expect(query('.product-detail__summary h1').textContent).toBe('Camisa');
    expect(query('.product-detail__buybox .product-detail__options')).not.toBeNull();
    expect(query('.product-detail__details [role=tabpanel]')).not.toBeNull();
    expect(w.document.querySelectorAll('.product-detail__buy')).toHaveLength(1);
  });

  it('updates simple-product quantity and shows only active discounts', async () => {
    const { query, click, serialize } = await shop({ fullPage: true, items: [{ ...product(), variants: [], stock: 3, discountPercent: 10 }] });
    expect(query('.product-detail__original').textContent).toMatch(/20[,.]00/);
    expect(query('.product-detail__price').textContent).toMatch(/18[,.]00/);
    click('[data-product-quantity="1"]'); click('[data-product-quantity="1"]');
    expect(query('[data-product-subtotal]').textContent).toMatch(/54[,.]00/);
    click('.product-detail__buy');
    expect(serialize()).toEqual([{ id: 'shirt', quantity: 3 }]);
    expect(query('[data-product-quantity="1"]').disabled).toBe(true);
    const expired = await shop({ fullPage: true, items: [{ ...product(), variants: [], discountPercent: 10, discountEndsAt: '2000-01-01' }] });
    expect(expired.query('.product-detail__saving')).toBeNull();
  });

  it('supports legacy named variants and image-only variants without product photos', async () => {
    const { query, click, choose } = await shop({ items: [{ ...product(), imageUrls: [], variants: [{ id: 'large', name: 'Grande', amount: 5000, imageUrl: 'https://shop.test/large.jpg' }] }] });
    click('.menu-add'); expect(query('legend').textContent).toContain('Opción'); choose(0, 'Grande');
    expect(query('[data-variant-add]').disabled).toBe(false);
    expect(query('.product-detail__photo').src).toBe('https://shop.test/large.jpg');
  });

  it.each(['extras', 'groups', 'combinations', 'ambiguous'])('retains the hosted fallback for unsupported %s', async kind => {
    const p: any = product();
    if (kind === 'extras') p.extras = [{ id: 'gift', name: 'Regalo', required: true }];
    // The platform supports up to 6 option groups and 256 variants per product.
    if (kind === 'groups') p.variants.forEach((v: any) => v.options.push(...['Formato', 'Cadencia', 'Acabado', 'Empaque', 'Grabado'].map(name => ({ name, value: 'Uno' }))));
    if (kind === 'combinations') p.variants = Array.from({ length: 257 }, (_, i) => ({ id: String(i), name: String(i), amount: 100 }));
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
