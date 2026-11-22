import { chromium, type Browser, type Page } from 'playwright';
import { readKitFileSync } from '@pagosya/storefront-kit';

/** Popups 2.0 part 2 (spec 2026-11-21 §3, §7): the store page opens at most the one popup that fits, at its moment. */
jest.setTimeout(120_000);
const ORIGIN = 'https://moments.invalid';
const T = Date.UTC(2026, 10, 21, 15);
const step = (inner: string) => `<div class="card"><button data-close aria-label="Cerrar">×</button>${inner}</div>`;
const design = (id: string, moment: string, flow: unknown[], steps: Record<string, string>) => ({ id, moment, flow, steps, css: '.card{background:#fff;color:#111;padding:20px}', launcher: null, capture: 'whatsapp', percent: 10 });
const tile = '<ul><li data-tile><img data-slot="photo" alt=""><b data-slot="name"></b></li></ul>';
const capture = step('<input data-field><button data-submit>Enviar</button>'), reveal = step('<b data-slot="code"></b><button data-next>Ir</button>'), remind = step('<b data-slot="code"></b><button data-apply>Usar</button>');
const welcome = design('cwelcome00000000000000001', 'welcome', [{ id: 'o', kind: 'offer' }, { id: 'c', kind: 'capture' }, { id: 'r', kind: 'reveal' }], { o: step('<h2>Hola</h2><button data-next>Sí</button>'), c: capture, r: reveal });
const rescue = design('crescue000000000000000001', 'rescue', [{ id: 'k', kind: 'cart' }, { id: 'c', kind: 'capture' }, { id: 'r', kind: 'reveal' }, { id: 'm', kind: 'remind' }, { id: 'l', kind: 'land', to: 'checkout' }], { k: step(`<h2>Tu carrito</h2><ul><li data-tile><img data-slot="photo" alt=""><b data-slot="name"></b><i data-slot="price"></i></li></ul><button data-next>Guardar</button>`), c: capture, r: reveal, m: remind });
const interest = design('cinterest0000000000000001', 'interest', [{ id: 'p', kind: 'pick', source: 'context', products: [] }, { id: 'c', kind: 'capture' }, { id: 'r', kind: 'reveal' }, { id: 'm', kind: 'remind' }], { p: step(`<h2>¿Te gustó <span data-slot="product-name"></span>?</h2><p>Y otras de <span data-slot="collection-name"></span>.</p>${tile}`), c: capture, r: reveal, m: remind });
const back = design('creturn000000000000000001', 'return', [{ id: 'p', kind: 'pick', source: 'new', products: [] }, { id: 'm', kind: 'remind' }], { p: step(`<h2>Hola de nuevo</h2>${tile}`), m: remind });
const items: any[] = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].map((id, i) => ({ id, name: `Producto ${i + 1}`, price: 3000, categoryId: i < 4 ? 'c1' : null, imageUrls: [`/v1/uploads/${id}.png`] }));
items[3].variants = [{ id: 'v1', name: 'Grande', amount: 5500 }];
const settings = { signupEnabled: true, popupTrigger: 'delay', popupDelaySeconds: 8, popupDesign: welcome, popupMoments: { rescue, interest, return: back } };

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });

async function open(opts: { storage?: Record<string, string>; analytics?: boolean | null; cart?: Array<{ id: string; quantity: number; variantId?: string }>; settings?: unknown; currentProduct?: string; cookieNotice?: boolean; items?: unknown[] } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const posts: Array<{ path: string; body: any }> = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main style="height:4000px"><button data-cart-open>Carrito</button></main></body></html>' });
    const path = url.pathname.replace('/v1/stores/public/calima/retention', '').replace(/^\//, '');
    if (route.request().method() === 'POST') {
      posts.push({ path, body: route.request().postDataJSON() });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(path === 'code-status' ? { active: true, percent: 10 } : path === 'subscribe' ? { subscribed: true, code: 'POPABC234' } : { ok: true }) });
    }
    if (path === '') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(opts.settings ?? settings) });
    return route.fulfill({ contentType: 'application/json', body: '{}' });
  });
  const page = await context.newPage();
  await page.clock.install({ time: T });
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(([storage, analytics, cart, list, current, notice]) => {
    // A full product page answers «which product is this?» (commerce.js) from the first paint.
    if (current) document.addEventListener('pagosya:current-product', (e: any) => { e.detail.id = current; e.detail.name = 'x'; });
    for (const [k, v] of Object.entries(storage as Record<string, string>)) localStorage.setItem(k, v);
    (window as any).PAGOSYA_PRIVACY = { choice: () => (window as any).__analytics };
    (window as any).__analytics = analytics;
    (window as any).__cart = cart;
    document.addEventListener('pagosya:serialize-cart', (e: any) => { e.detail.items = [...(window as any).__cart]; });
    (window as any).PAGOSYA_CONFIG = { slug: 'calima', apiBaseUrl: `${location.origin}/v1`, data: { items: list, categories: [{ id: 'c1', name: 'Licuadoras' }], collections: [{ name: 'Verano', slug: 'verano', productIds: ['p5', 'p6', 'p7'] }] } };
    if (notice) { const el = document.createElement('div'); el.setAttribute('data-pagosya-privacy', ''); el.setAttribute('data-notice', ''); document.body.append(el); }
  }, [opts.storage ?? {}, opts.analytics === undefined ? false : opts.analytics, opts.cart ?? [], opts.items ?? items, opts.currentProduct ?? '', opts.cookieNotice ?? false] as const);
  await page.addScriptTag({ content: readKitFileSync('retention.js') });
  await page.clock.runFor(100);
  return { page, posts, context };
}
const openStep = (page: Page) => page.evaluate(() => document.querySelector('dialog[open] [data-pya-popup]')?.getAttribute('data-step') ?? null);
const memory = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pagosya:popups:calima') || 'null'));
const leaveTop = (page: Page) => page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseout', { clientY: -1, relatedTarget: null })));

describe('popup moments on the store page', () => {
  it('a first visit gets the welcome after the store delay, and nothing else that visit', async () => {
    const { page, context } = await open({ cart: [{ id: 'p1', quantity: 1 }] });
    await page.clock.runFor(9_000);
    expect(await openStep(page)).toBe('offer');
    await page.click('dialog[open] [data-close]');
    await leaveTop(page);
    expect(await openStep(page)).toBeNull();
    expect((await memory(page)).closed.welcome).toBeGreaterThan(0);
    await context.close();
  });
  it('leaving with a full cart opens the rescue first, with the cart drawn', async () => {
    const { page, context } = await open({ cart: [{ id: 'p1', quantity: 2 }, { id: 'p2', quantity: 1 }] });
    await leaveTop(page);
    expect(await openStep(page)).toBe('cart');
    expect(await page.locator('dialog[open] [data-slot=name]').allTextContents()).toEqual(['Producto 1', 'Producto 2']);
    await context.close();
  });
  it('three products of one category open the interest popup naming the last one', async () => {
    const { page, context } = await open();
    for (const id of ['p1', 'p2', 'p3']) await page.evaluate(pid => document.dispatchEvent(new CustomEvent('pagosya:product-viewed', { detail: { id: pid, categoryId: 'c1' } })), id);
    await page.clock.runFor(100);
    expect(await openStep(page)).toBe('pick');
    expect(await page.locator('dialog[open] [data-slot=product-name]').textContent()).toBe('Producto 3');
    await context.close();
  });
  it('a returning contact gets the return popup 6 s in, with the code checked first', async () => {
    const saved = { visitor: 'a'.repeat(24), visits: 1, visitStart: T - 3 * 86_400_000, lastSeenAt: T - 3 * 86_400_000, visitShown: true, lastShownAt: T - 3 * 86_400_000, closed: {}, done: { welcome: T - 3 * 86_400_000 }, contact: true, code: 'POPABC234', favourite: '', views: {} };
    const { page, posts, context } = await open({ storage: { 'pagosya:popups:calima': JSON.stringify(saved) } });
    await page.clock.runFor(7_000);
    // The code check is a real request: the popup opens once it answers.
    await page.waitForSelector('dialog[open] [data-pya-popup]', { timeout: 5_000 }).catch(() => undefined);
    expect(await openStep(page)).toBe('pick');
    expect(await page.locator('dialog[open] [data-slot=name]').count()).toBeGreaterThan(0);
    expect(posts.some(p => p.path === 'code-status' && p.body.code === 'POPABC234')).toBe(true);
    await context.close();
  });
  it('events reach the server only with analytics consent', async () => {
    const without = await open({ analytics: false });
    await without.page.clock.runFor(9_000);
    expect(without.posts.filter(p => p.path === 'popup-events')).toEqual([]);
    await without.context.close();
    const withConsent = await open({ analytics: true });
    await withConsent.page.clock.runFor(9_000);
    expect(withConsent.posts.filter(p => p.path === 'popup-events').map(p => [p.body.moment, p.body.kind])).toEqual([['welcome', 'shown']]);
    await withConsent.context.close();
  });
  it('closing with Escape counts as closed (final review I2)', async () => {
    const { page, context } = await open();
    await page.clock.runFor(9_000);
    expect(await openStep(page)).toBe('offer');
    await page.keyboard.press('Escape');
    // The dialog's close event is its own task: wait for it before reading the memory.
    await page.waitForFunction(() => Boolean(JSON.parse(localStorage.getItem('pagosya:popups:calima') || '{}').closed?.welcome), null, { timeout: 3_000 }).catch(() => undefined);
    expect(await openStep(page)).toBeNull();
    expect((await memory(page)).closed.welcome).toBeGreaterThan(0);
    await context.close();
  });
  it('a family store never shows the welcome launcher tab (final review I3)', async () => {
    const withLauncher = { ...settings, popupTrigger: 'load', popupDesign: { ...welcome, launcher: '<span class="tab">¿10% para ti?</span>' } };
    const { page, context } = await open({ settings: withLauncher });
    await page.waitForSelector('dialog[open] [data-pya-popup]', { timeout: 5_000 });
    await page.click('dialog[open] [data-close]');
    await page.clock.runFor(1_000);
    expect(await page.locator('[data-pya-launcher]').count()).toBe(0);
    await context.close();
  });
  it('a full product page counts as viewed from the first paint: 40 s on it opens the interest (final review I4)', async () => {
    const T2 = T + 2 * 86_400_000;
    const saved = { visitor: 'b'.repeat(24), visits: 1, visitStart: T - 86_400_000 * 3, lastSeenAt: T - 86_400_000 * 3, visitShown: false, lastShownAt: T - 86_400_000 * 3, closed: {}, done: { welcome: T - 86_400_000 * 3 }, contact: false, code: '', favourite: '', views: {} };
    const { page, context } = await open({ currentProduct: 'p2', storage: { 'pagosya:popups:calima': JSON.stringify(saved) } });
    void T2;
    await page.clock.runFor(41_000);
    await page.waitForSelector('dialog[open] [data-pya-popup]', { timeout: 5_000 }).catch(() => undefined);
    expect(await openStep(page)).toBe('pick');
    expect(await page.locator('dialog[open] [data-slot=product-name]').textContent()).toBe('Producto 2');
    await context.close();
  });
  it('with the welcome switched off, the other popups still work (final review I7)', async () => {
    const { popupDesign: _w, ...noWelcome } = settings as any;
    const { page, context } = await open({ settings: noWelcome, cart: [{ id: 'p1', quantity: 1 }] });
    await page.clock.runFor(9_000);
    expect(await openStep(page)).toBeNull();
    await leaveTop(page);
    expect(await openStep(page)).toBe('cart');
    await context.close();
  });
  it('the cart drawn in the rescue follows the cart, and an emptied cart gives no code (minor 1)', async () => {
    const { page, context } = await open({ cart: [{ id: 'p1', quantity: 1 }] });
    await leaveTop(page);
    expect(await openStep(page)).toBe('cart');
    await page.evaluate(() => { (window as any).__cart = []; document.dispatchEvent(new CustomEvent('pagosya:cart-updated')); });
    expect(await page.locator('dialog[open] [data-slot=name]').count()).toBe(0);
    expect(await page.locator('dialog[open] .pagosya-flow-more').textContent()).toBe('Tu carrito está vacío.');
    await page.click('dialog[open] [data-next]');
    expect(await openStep(page)).toBeNull();
    await context.close();
  });
  it('a cart line with a variant shows the variant name and price (minor 2)', async () => {
    const { page, context } = await open({ cart: [{ id: 'p4', variantId: 'v1', quantity: 1 }] });
    await leaveTop(page);
    expect(await page.locator('dialog[open] [data-slot=name]').textContent()).toBe('Producto 4 · Grande');
    expect(await page.locator('dialog[open] [data-slot=price]').textContent()).toBe('Bs 55');
    await context.close();
  });
  it('a return due while the cookie question was open shows once it is answered (minor 5)', async () => {
    const saved = { visitor: 'c'.repeat(24), visits: 1, visitStart: T - 3 * 86_400_000, lastSeenAt: T - 3 * 86_400_000, visitShown: true, lastShownAt: T - 3 * 86_400_000, closed: {}, done: { welcome: T - 3 * 86_400_000 }, contact: true, code: '', favourite: '', views: {} };
    const { page, context } = await open({ analytics: null, cookieNotice: true, storage: { 'pagosya:popups:calima': JSON.stringify(saved) } });
    await page.clock.runFor(7_000);
    expect(await openStep(page)).toBeNull();
    await page.evaluate(() => { (window as any).__analytics = true; window.dispatchEvent(new CustomEvent('pagosya:privacy-change', { detail: { slug: 'calima', analytics: true } })); });
    await page.clock.runFor(1_000);
    await page.waitForSelector('dialog[open] [data-pya-popup]', { timeout: 3_000 }).catch(() => undefined);
    expect(await openStep(page)).toBe('pick');
    await context.close();
  });
  it('the interest popup names the category, and works for products grouped only in a collection (live 2026-11-22: «otras de .»)', async () => {
    const one = await open();
    for (const id of ['p1', 'p2', 'p3']) await one.page.evaluate(pid => document.dispatchEvent(new CustomEvent('pagosya:product-viewed', { detail: { id: pid } })), id);
    await one.page.clock.runFor(100);
    expect(await one.page.locator('dialog[open] [data-slot=collection-name]').textContent()).toBe('Licuadoras');
    await one.context.close();
    const two = await open();
    for (const id of ['p5', 'p6', 'p7']) await two.page.evaluate(pid => document.dispatchEvent(new CustomEvent('pagosya:product-viewed', { detail: { id: pid } })), id);
    await two.page.clock.runFor(100);
    expect(await two.page.locator('dialog[open] [data-slot=collection-name]').textContent()).toBe('Verano');
    expect(await two.page.locator('dialog[open] [data-slot=name]').allTextContents()).toEqual(['Producto 7', 'Producto 5', 'Producto 6']);
    await two.context.close();
  });
  it('a live store sends amount, not price: the tiles still show the price (live Remolino 2026-11-22)', async () => {
    const live = items.map(({ price, ...item }) => ({ ...item, amount: 89000 }));
    const { page, context } = await open({ items: live, cart: [{ id: 'p1', quantity: 1 }] });
    await leaveTop(page);
    expect(await page.locator('dialog[open] [data-slot=price]').first().textContent()).toBe('Bs 890');
    await context.close();
  });
});
