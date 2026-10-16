/// <reference lib="dom" />
import type { Page } from 'playwright';
import type { SourceProjectSnapshot } from '../source-project';
import { withVisualSandbox } from '../source-visual-capture';
import { sourceVisualState } from '../source-visual-state';
import { currentSourceRuntime } from '../source-runtime';
import type { SurfacePart } from './surface-parts';

/** Spec 2026-10-15 free commerce surfaces: a real purchase through the store's templated parts, per part. */
export type SurfaceFailure = { part: SurfacePart; check: string; detail: string };
/** `reached`: the parts the purchase actually exercised. A part that is not reached has not passed (review I4). */
export type SurfaceCheckResult = { failures: SurfaceFailure[]; reached: SurfacePart[]; skipped?: 'empty catalog' };

const FLAGS: Record<string, SurfacePart> = { productTemplateInvalid: 'card', productPageTemplateInvalid: 'productPage', cartTemplateInvalid: 'cart', cartLineTemplateInvalid: 'cartLine', addedTemplateInvalid: 'added', checkoutTemplateInvalid: 'checkout' };
const TEMPLATES: Record<SurfacePart, string> = { card: 'template[data-pagosya-product-template]', productPage: 'template[data-pagosya-product-page-template]', cart: 'template[data-pagosya-cart-template]', cartLine: 'template[data-pagosya-cart-line-template]', added: 'template[data-pagosya-added-template]', checkout: 'template[data-pagosya-checkout-template]' };
const ROOTS: Record<SurfacePart, string> = { card: '[data-custom-product]', productPage: '[data-product-page-root]', cart: '[data-cart-panel]', cartLine: '[data-cart-line]', added: '[data-added-field="message"]', checkout: '[data-checkout-root]' };

/** One part's layout in the page: sideways scroll, text over text, unreadable text. Runs in the browser. */
function readPart(selector: string) {
  const roots = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(el => el.getClientRects().length);
  // A part inside its own scroller (the checkout overlay) overflows that scroller, not the document: measure the part too.
  // The part's own box, never the page's width: an overflow the main design caused is not this part's (review minor, live run).
  const overflow = roots.some(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 2 || r.left < -2; });
  const texts: Array<{ el: HTMLElement; r: DOMRect; t: DOMRect }> = [];
  const low: string[] = [];
  const cut: string[] = [];
  const lum = (c: string) => { const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1]; const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return { l: 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]), a: m[3] ?? 1 }; };
  /** The colour behind an element, or null when a gradient or image sits in front of any solid colour: not measurable here. */
  const background = (el: HTMLElement | null): string | null => {
    for (let n = el; n; n = n.parentElement) {
      const style = getComputedStyle(n);
      if (style.backgroundImage && style.backgroundImage !== 'none') return null;
      if (lum(style.backgroundColor).a > 0.5) return style.backgroundColor;
    }
    return 'rgb(255, 255, 255)';
  };
  for (const root of roots) for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
    const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && (n.textContent || '').trim());
    if (!own || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    // Screen-reader-only text (a 1px clipped box) is not on screen to be cut or covered.
    if (r.width <= 2 || r.height <= 2) continue;
    const range = document.createRange(); range.selectNodeContents(el); const t = range.getBoundingClientRect();
    texts.push({ el, r, t });
    // Text a box hides part of (live 2026-10-15: «Bs 60,00» shown as «Bs 60,0»); an ellipsis is a deliberate shortening.
    if (getComputedStyle(el).textOverflow !== 'ellipsis') {
      for (let n: HTMLElement | null = el; n; n = n === root ? null : n.parentElement) {
        if (getComputedStyle(n).overflowX === 'visible') continue;
        const box = n.getBoundingClientRect();
        if (t.right > box.right + 1 || t.left < box.left - 1) { cut.push((el.textContent || '').trim().slice(0, 40)); break; }
      }
    }
    const behind = background(el);
    if (behind === null) continue;
    const fg = lum(getComputedStyle(el).color).l, bg = lum(behind).l;
    if ((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) < 3) low.push((el.textContent || '').trim().slice(0, 40));
  }
  let overlaps = 0;
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 4 && h > 4 && w * h > 0.3 * Math.min(a.r.width * a.r.height, b.r.width * b.r.height)) overlaps++;
  }
  // A button or link painted over text that spilled out of its own box (live 2026-10-15: the add button over «Bs 60,00»):
  // the text's ink against the control's whole box, which the box-to-box test above never sees.
  const controls = roots.flatMap(root => Array.from(root.querySelectorAll<HTMLElement>('button,a,[role=button]')).concat(root.matches('button,a,[role=button]') ? [root] : []));
  for (const { el, t } of texts) {
    if (el.closest('button,a,[role=button]')) continue;
    const hit = controls.some(c => { if (c.contains(el)) return false; const b = c.getBoundingClientRect(); return Math.min(t.right, b.right) - Math.max(t.left, b.left) > 4 && Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top) > 4; });
    if (hit) overlaps++;
  }
  return { present: roots.length > 0, overflow, low: low.slice(0, 3), overlaps, cut: cut.slice(0, 3) };
}
async function layout(page: Page, part: SurfacePart, failures: SurfaceFailure[]) {
  const read = await page.evaluate(readPart, ROOTS[part]);
  if (!read.present) return;
  if (read.overflow) failures.push({ part, check: 'overflow', detail: 'La página se desplaza hacia el costado.' });
  if (read.overlaps) failures.push({ part, check: 'overlap', detail: `${read.overlaps} textos se superponen.` });
  if (read.cut.length) failures.push({ part, check: 'cut-off', detail: `Texto cortado: «${read.cut.join('», «')}».` });
  if (read.low.length) failures.push({ part, check: 'contrast', detail: `Texto difícil de leer: «${read.low.join('», «')}».` });
}
const flagFailures = (flags: Record<string, string | undefined>): SurfaceFailure[] =>
  Object.entries(FLAGS).filter(([key]) => flags[key] === 'true').map(([, part]) => ({ part, check: 'template', detail: 'El runtime rechazó la plantilla (faltan espacios obligatorios).' }));
const visible = (page: Page, selector: string, timeout = 2500) => page.locator(selector).first().waitFor({ state: 'visible', timeout }).then(() => true, () => false);
const cartCount = (page: Page) => page.locator('[data-cart-count]').first().innerText().then(t => Number(t.replace(/\D/g, '')) || 0, () => 0);
/** A part whose template is on the page but whose root never rendered at its step fails (review I4). */
async function shown(page: Page, part: SurfacePart, failures: SurfaceFailure[]) {
  if (!await page.locator(TEMPLATES[part]).count()) return;
  if (!await visible(page, ROOTS[part], 1500)) failures.push({ part, check: 'not-shown', detail: 'La plantilla está en la página pero no se mostró.' });
}
const amount = (text: string) => (text.match(/\d[\d.]*,\d{2}|\d+(?:\.\d{2})?/g) ?? []).at(-1) ?? '';
const OPEN_CART = '[data-cart-panel], [data-pagosya-cart]:not([hidden]) .order-items';

export async function inspectShopPage(page: Page, width: number): Promise<SurfaceCheckResult> {
  void width;
  const failures: SurfaceFailure[] = [...flagFailures(await page.evaluate(() => ({ ...document.documentElement.dataset })))];
  const reached: SurfacePart[] = [];
  // The runtime renders the catalog after load; give it a moment before calling the catalog empty.
  await page.locator('[data-pagosya-catalog] .menu-item').first().waitFor({ state: 'attached', timeout: 4000 }).catch(() => {});
  if (!await page.locator('[data-pagosya-catalog] .menu-item').count()) return failures.length ? { failures, reached } : { failures, reached, skipped: 'empty catalog' };
  reached.push('card');
  await shown(page, 'card', failures);
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
  if (await cartCount(page) === before) { failures.push({ part: 'card', check: 'add', detail: 'Agregar al pedido no funcionó desde la tarjeta.' }); return { failures, reached }; }
  // The added notice appears and its button opens the cart.
  reached.push('added');
  await shown(page, 'added', failures);
  if (await visible(page, ROOTS.added, 500)) {
    await layout(page, 'added', failures);
    const notice = page.locator(ROOTS.added).first().locator('xpath=ancestor-or-self::*[.//button[@data-cart-open]][1]');
    await notice.locator('button[data-cart-open]').first().click({ timeout: 2000 }).catch(() => {});
    if (!await visible(page, OPEN_CART, 2000)) failures.push({ part: 'added', check: 'open', detail: 'El botón del aviso no abrió el carrito.' });
  }
  if (!await visible(page, OPEN_CART, 500)) await page.locator('header [data-cart-open]').first().click({ timeout: 2000 }).catch(() => {});
  if (!await visible(page, OPEN_CART)) { failures.push({ part: 'cart', check: 'open', detail: 'El carrito no se abrió.' }); return { failures, reached }; }
  reached.push('cart', 'cartLine');
  await shown(page, 'cart', failures); await shown(page, 'cartLine', failures);
  await layout(page, 'cart', failures); await layout(page, 'cartLine', failures);
  // + and − change the total and bring it back, so checkout opens on the cart as it was (a preview keeps no cart between pages).
  const total = () => page.locator('[data-cart-panel] .order-total, [data-pagosya-cart]:not([hidden]) .order-total').first().innerText().catch(() => '');
  const first = await total();
  await page.locator('[data-cart-panel] .quantity button[data-add], [data-pagosya-cart]:not([hidden]) .quantity button[data-add]').first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(150);
  if (await total() === first) failures.push({ part: 'cartLine', check: 'quantity', detail: 'El botón + no cambió el total.' });
  else {
    await page.locator('[data-cart-panel] .quantity button[data-remove], [data-pagosya-cart]:not([hidden]) .quantity button[data-remove]').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(150);
    if (amount(await total()) !== amount(first)) failures.push({ part: 'cartLine', check: 'quantity-down', detail: 'El botón − no devolvió el total.' });
  }
  // The cart's action reaches checkout.
  const cartTotal = amount(await total());
  const action = page.locator('[data-cart-panel] [data-checkout], [data-pagosya-cart]:not([hidden]) [data-checkout]').first();
  if (!await action.isVisible().catch(() => false)) { failures.push({ part: 'cart', check: 'checkout-action', detail: 'No se ve el botón para continuar al pago.' }); return { failures, reached }; }
  await action.click({ timeout: 3000 }).catch(() => {});
  if (!await visible(page, '[data-pagosya-checkout]:not([hidden])', 3000)) { failures.push({ part: 'cart', check: 'checkout-action', detail: 'El botón del carrito no llevó al pago.' }); return { failures, reached }; }
  // Checkout: totals match, the fields take text, the payment button is there, the preview payment completes.
  reached.push('checkout');
  await shown(page, 'checkout', failures);
  await layout(page, 'checkout', failures);
  const reviewTotal = amount(await page.locator('[data-pagosya-checkout] .order-total').first().innerText().catch(() => ''));
  if (reviewTotal !== cartTotal) failures.push({ part: 'checkout', check: 'total', detail: `El total del pago (Bs ${reviewTotal}) no coincide con el del carrito (Bs ${cartTotal}).` });
  for (const field of await page.locator('[data-pagosya-checkout] input[type=text]:visible, [data-pagosya-checkout] input[type=email]:visible, [data-pagosya-checkout] input[type=tel]:visible, [data-pagosya-checkout] input:not([type]):visible').all()) {
    const ok = await field.fill('Prueba', { timeout: 1500 }).then(() => true, () => false);
    if (!ok) { failures.push({ part: 'checkout', check: 'fields', detail: 'Un campo del pago no acepta texto.' }); break; }
  }
  const pay = page.locator('[data-pagosya-checkout] [data-pay]').first();
  if (!await pay.isVisible().catch(() => false)) { failures.push({ part: 'checkout', check: 'pay', detail: 'No se ve el botón de pago.' }); return { failures, reached }; }
  await pay.click({ timeout: 3000 }).catch(() => {});
  await page.locator('[data-pagosya-checkout] [data-finish-demo]').first().click({ timeout: 3000 }).catch(() => {});
  if (!await visible(page, '[data-pagosya-status]:has-text("Prueba completada")', 4000)) failures.push({ part: 'checkout', check: 'complete', detail: 'El pago de prueba no se completó.' });
  return { failures, reached };
}

/** The product page; `reached` is true once the product rendered. */
export async function inspectProductPage(page: Page, width: number, reached?: SurfacePart[]): Promise<SurfaceFailure[]> {
  const rendered = await page.locator('#pagosya-product-title').first().waitFor({ state: 'attached', timeout: 5000 }).then(() => true, () => false);
  const failures = flagFailures(await page.evaluate(() => ({ ...document.documentElement.dataset }))).filter(f => f.part === 'productPage');
  if (!rendered) return failures;
  reached?.push('productPage');
  await shown(page, 'productPage', failures);
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
  const perWidth: SurfacePart[][] = [];
  const product = sourceVisualState(runtime, 'product.html', undefined, true);
  for (const width of [1280, 390] as const) {
    signal.throwIfAborted();
    const reached: SurfacePart[] = [];
    await withVisualSandbox(runtime, sourceVisualState(runtime, 'index.html', undefined, true).query, signal, false, async context => {
      const page = await context.newPage();
      page.setDefaultTimeout(7000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12_000 });
      const result = await inspectShopPage(page, width);
      all.push(...result.failures); reached.push(...result.reached); skipped = skipped ?? result.skipped;
      await page.close();
    }, 'reduce');
    // The product reaches product.html through the preview query, as the agent's captures do: a probe document is not a
    // preview, so its runtime waits for the live catalog the sandbox blocks and the buy button stays disabled (live run).
    if (product.productId && runtime.files.some(f => f.path === 'product.html')) await withVisualSandbox(runtime, product.query, signal, false, async context => {
      const page = await context.newPage();
      page.setDefaultTimeout(7000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto('https://preview.invalid/product.html', { waitUntil: 'load', timeout: 12_000 });
      all.push(...await inspectProductPage(page, width, reached));
      await page.close();
    }, 'reduce');
    perWidth.push(reached);
  }
  const seen = new Set<string>();
  const failures = all.filter(f => { const key = `${f.part}:${f.check}`; if (seen.has(key)) return false; seen.add(key); return true; });
  // A part counts as reached only when both widths exercised it.
  const reached = perWidth[0].filter(part => perWidth.every(list => list.includes(part)));
  return skipped && !failures.length ? { failures, reached, skipped } : { failures, reached };
}
