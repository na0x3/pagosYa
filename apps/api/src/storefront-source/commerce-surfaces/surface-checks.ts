/// <reference lib="dom" />
import type { Page } from 'playwright';
import type { SourceProjectSnapshot } from '../source-project';
import { withVisualSandbox } from '../source-visual-capture';
import { sourceVisualState } from '../source-visual-state';
import { currentSourceRuntime } from '../source-runtime';
import type { SurfacePart } from './surface-parts';

/** Spec 2026-10-15 free commerce surfaces: a real purchase through the store's templated parts, per part. */
export type SurfaceFailure = { part: SurfacePart; check: string; detail: string };
export type SurfaceCheckResult = { failures: SurfaceFailure[]; skipped?: 'empty catalog' };

const FLAGS: Record<string, SurfacePart> = { productTemplateInvalid: 'card', productPageTemplateInvalid: 'productPage', cartTemplateInvalid: 'cart', cartLineTemplateInvalid: 'cartLine', addedTemplateInvalid: 'added', checkoutTemplateInvalid: 'checkout' };
const ROOTS: Record<SurfacePart, string> = { card: '[data-custom-product]', productPage: '[data-product-page-root]', cart: '[data-cart-panel]', cartLine: '[data-cart-line]', added: '[data-added-field="message"]', checkout: '[data-checkout-root]' };

/** One part's layout in the page: sideways scroll, text over text, unreadable text. Runs in the browser. */
function readPart(selector: string) {
  const roots = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(el => el.getClientRects().length);
  // A part inside its own scroller (the checkout overlay) overflows that scroller, not the document: measure the part too.
  const overflow = document.documentElement.scrollWidth > innerWidth + 2 || roots.some(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 2 || r.left < -2; });
  const texts: Array<{ el: HTMLElement; r: DOMRect }> = [];
  const low: string[] = [];
  const lum = (c: string) => { const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1]; const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return { l: 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]), a: m[3] ?? 1 }; };
  const background = (el: HTMLElement | null): string => { for (let n = el; n; n = n.parentElement) { const bg = getComputedStyle(n).backgroundColor; if (lum(bg).a > 0.5) return bg; } return 'rgb(255, 255, 255)'; };
  for (const root of roots) for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
    const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && (n.textContent || '').trim());
    if (!own || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect(); texts.push({ el, r });
    const fg = lum(getComputedStyle(el).color).l, bg = lum(background(el)).l;
    if ((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) < 3) low.push((el.textContent || '').trim().slice(0, 40));
  }
  let overlaps = 0;
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 4 && h > 4 && w * h > 0.3 * Math.min(a.r.width * a.r.height, b.r.width * b.r.height)) overlaps++;
  }
  return { present: roots.length > 0, overflow, low: low.slice(0, 3), overlaps };
}
async function layout(page: Page, part: SurfacePart, failures: SurfaceFailure[]) {
  const read = await page.evaluate(readPart, ROOTS[part]);
  if (!read.present) return;
  if (read.overflow) failures.push({ part, check: 'overflow', detail: 'La página se desplaza hacia el costado.' });
  if (read.overlaps) failures.push({ part, check: 'overlap', detail: `${read.overlaps} textos se superponen.` });
  if (read.low.length) failures.push({ part, check: 'contrast', detail: `Texto difícil de leer: «${read.low.join('», «')}».` });
}
const flagFailures = (flags: Record<string, string | undefined>): SurfaceFailure[] =>
  Object.entries(FLAGS).filter(([key]) => flags[key] === 'true').map(([, part]) => ({ part, check: 'template', detail: 'El runtime rechazó la plantilla (faltan espacios obligatorios).' }));
const visible = (page: Page, selector: string, timeout = 2500) => page.locator(selector).first().waitFor({ state: 'visible', timeout }).then(() => true, () => false);
const cartCount = (page: Page) => page.locator('[data-cart-count]').first().innerText().then(t => Number(t.replace(/\D/g, '')) || 0, () => 0);
const OPEN_CART = '[data-cart-panel], [data-pagosya-cart]:not([hidden]) .order-items';

export async function inspectShopPage(page: Page, width: number): Promise<SurfaceCheckResult> {
  void width;
  const failures: SurfaceFailure[] = [...flagFailures(await page.evaluate(() => ({ ...document.documentElement.dataset })))];
  // The runtime renders the catalog after load; give it a moment before calling the catalog empty.
  await page.locator('[data-pagosya-catalog] .menu-item').first().waitFor({ state: 'attached', timeout: 4000 }).catch(() => {});
  if (!await page.locator('[data-pagosya-catalog] .menu-item').count()) return failures.length ? { failures } : { failures, skipped: 'empty catalog' };
  const custom = await page.locator(ROOTS.card).count();
  if (custom) {
    const name = await page.locator(`${ROOTS.card} [data-product-field="name"]`).first().innerText().catch(() => '');
    const price = await page.locator(`${ROOTS.card} [data-product-field="price"]`).first().innerText().catch(() => '');
    if (!name.trim() || !/\d/.test(price)) failures.push({ part: 'card', check: 'data', detail: 'La tarjeta no muestra el nombre o el precio del catálogo.' });
    await layout(page, 'card', failures);
  }
  // Add from the card; a product that needs an option opens its page, which adds from there (Review Focus 2).
  const before = await cartCount(page);
  await page.locator(`${custom ? `${ROOTS.card} [data-product-add]` : '[data-pagosya-catalog] [data-add]'}:not([disabled])`).first().click({ timeout: 3000 }).catch(() => {});
  if (await cartCount(page) === before) {
    for (const select of await page.locator('.product-detail select').all()) await select.selectOption({ index: 1 }).catch(() => {});
    await page.locator('.product-detail [role=radiogroup] button, .product-detail [data-option-value]').first().click({ timeout: 1000 }).catch(() => {});
    await page.locator('.product-detail__buy, [data-product-page-root] [data-add], .product-detail [data-add]').first().click({ timeout: 3000 }).catch(() => {});
  }
  if (await cartCount(page) === before) { failures.push({ part: 'card', check: 'add', detail: 'Agregar al pedido no funcionó desde la tarjeta.' }); return { failures }; }
  // The added notice appears and its button opens the cart.
  if (await visible(page, ROOTS.added)) {
    await layout(page, 'added', failures);
    const notice = page.locator(ROOTS.added).first().locator('xpath=ancestor-or-self::*[.//button[@data-cart-open]][1]');
    await notice.locator('button[data-cart-open]').first().click({ timeout: 2000 }).catch(() => {});
    if (!await visible(page, OPEN_CART, 2000)) failures.push({ part: 'added', check: 'open', detail: 'El botón del aviso no abrió el carrito.' });
  }
  if (!await visible(page, OPEN_CART, 500)) await page.locator('header [data-cart-open]').first().click({ timeout: 2000 }).catch(() => {});
  if (!await visible(page, OPEN_CART)) { failures.push({ part: 'cart', check: 'open', detail: 'El carrito no se abrió.' }); return { failures }; }
  await layout(page, 'cart', failures); await layout(page, 'cartLine', failures);
  // The line's + changes the total.
  const total = () => page.locator('[data-cart-panel] .order-total, [data-pagosya-cart]:not([hidden]) .order-total').first().innerText().catch(() => '');
  const first = await total();
  await page.locator('[data-cart-panel] .quantity button[data-add], [data-pagosya-cart]:not([hidden]) .quantity button[data-add]').first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(150);
  if (await total() === first) failures.push({ part: 'cartLine', check: 'quantity', detail: 'El botón + no cambió el total.' });
  // The cart's action reaches checkout.
  const cartTotal = (await total()).replace(/\s+/g, ' ').trim();
  const action = page.locator('[data-cart-panel] [data-checkout], [data-pagosya-cart]:not([hidden]) [data-checkout]').first();
  if (!await action.isVisible().catch(() => false)) { failures.push({ part: 'cart', check: 'checkout-action', detail: 'No se ve el botón para continuar al pago.' }); return { failures }; }
  await action.click({ timeout: 3000 }).catch(() => {});
  if (!await visible(page, '[data-pagosya-checkout]:not([hidden])', 3000)) { failures.push({ part: 'cart', check: 'checkout-action', detail: 'El botón del carrito no llevó al pago.' }); return { failures }; }
  // Checkout: totals match, the payment button is there, the preview payment completes.
  await layout(page, 'checkout', failures);
  const reviewTotal = (await page.locator('[data-pagosya-checkout] .order-total').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  if (reviewTotal !== cartTotal) failures.push({ part: 'checkout', check: 'total', detail: `El total del pago (${reviewTotal}) no coincide con el del carrito (${cartTotal}).` });
  const pay = page.locator('[data-pagosya-checkout] [data-pay]').first();
  if (!await pay.isVisible().catch(() => false)) { failures.push({ part: 'checkout', check: 'pay', detail: 'No se ve el botón de pago.' }); return { failures }; }
  await pay.click({ timeout: 3000 }).catch(() => {});
  await page.locator('[data-pagosya-checkout] [data-finish-demo]').first().click({ timeout: 3000 }).catch(() => {});
  if (!await visible(page, '[data-pagosya-status]:has-text("Prueba completada")', 4000)) failures.push({ part: 'checkout', check: 'complete', detail: 'El pago de prueba no se completó.' });
  return { failures };
}

export async function inspectProductPage(page: Page, width: number): Promise<SurfaceFailure[]> {
  await page.locator('#pagosya-product-title').first().waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
  const failures = flagFailures(await page.evaluate(() => ({ ...document.documentElement.dataset }))).filter(f => f.part === 'productPage');
  if (!await page.locator(ROOTS.productPage).count()) return failures;
  await layout(page, 'productPage', failures);
  if (width >= 1024) {
    const fold = await page.evaluate(() => ['#pagosya-product-title', '.product-detail__pricing', '.product-detail__buy, [data-product-page-root] [data-add]'].every(s => { const el = document.querySelector(s); return !!el && el.getBoundingClientRect().top < innerHeight; }));
    if (!fold) failures.push({ part: 'productPage', check: 'fold', detail: 'Título, precio o botón de compra no están en la primera pantalla.' });
  }
  const before = await cartCount(page);
  await page.locator('.product-detail__buy, [data-product-page-root] [data-add]').first().click({ timeout: 3000 }).catch(() => {});
  if (await cartCount(page) === before) failures.push({ part: 'productPage', check: 'buy', detail: 'El botón de compra no agregó el producto.' });
  return failures;
}

/** The home and product pages at 1280 and 390 in the offline sandbox, templates injected as the store will serve them. */
export async function checkSurfacesOnSnapshot(snapshot: SourceProjectSnapshot, signal: AbortSignal): Promise<SurfaceCheckResult> {
  const runtime = await currentSourceRuntime(snapshot);
  const all: SurfaceFailure[] = []; let skipped: SurfaceCheckResult['skipped'];
  const product = sourceVisualState(runtime, 'product.html', undefined, true);
  for (const width of [1280, 390] as const) {
    signal.throwIfAborted();
    await withVisualSandbox(runtime, sourceVisualState(runtime, 'index.html', undefined, true).query, signal, false, async context => {
      const page = await context.newPage();
      page.setDefaultTimeout(7000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12_000 });
      const result = await inspectShopPage(page, width);
      all.push(...result.failures); skipped = skipped ?? result.skipped;
      await page.close();
    }, 'reduce');
    if (product.productId && runtime.files.some(f => f.path === 'product.html')) await withVisualSandbox(runtime, product.query, signal, true, async context => {
      const page = await context.newPage();
      page.setDefaultTimeout(7000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`https://preview.invalid/product.html?id=${encodeURIComponent(product.productId!)}`, { waitUntil: 'load', timeout: 12_000 });
      all.push(...await inspectProductPage(page, width));
      await page.close();
    }, 'reduce');
  }
  const seen = new Set<string>();
  const failures = all.filter(f => { const key = `${f.part}:${f.check}`; if (seen.has(key)) return false; seen.add(key); return true; });
  return skipped && !failures.length ? { failures, skipped } : { failures };
}
