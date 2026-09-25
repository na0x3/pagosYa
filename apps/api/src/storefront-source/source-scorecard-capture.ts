/// <reference lib="dom" />
/** Scorecard collector (sub-project 8): renders a store in the shared visual sandbox and records computed-style facts
 * per commerce surface at 1280 and 390, plus the quality facts. Never calls a model; never writes anywhere. */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { currentSourceRuntime } from './source-runtime';
import { probeSourceShopping, withVisualSandbox } from './source-visual-capture';
import type { SourceProjectSnapshot } from './source-project';
import { contrastRatio, lightness, relativeLuminance, type QualityFacts, type StoreSample, type SurfaceName, type SurfaceSample } from './source-scorecard';

const origin = 'https://preview.invalid';
const VIEWPORTS = [['desktop', 1280], ['mobile', 390]] as const;
type Viewport = typeof VIEWPORTS[number][0];
type Rgb = [number, number, number];
type Control = { radius: number; border: number; bg: Rgb; color: Rgb; transform: string; tracking: number; font: string; height: number; padRatio: number };
type ViewportFacts = {
  surfaces: Partial<Record<SurfaceName, SurfaceSample>>; dna: Record<string, string>;
  overflow: boolean | null; fontsLoaded: boolean | null; missingImages: number | null; buyContrast: number | null;
};

/** Everything measured in the page, in one self-contained function (it is serialized into the browser). */
function measureInPage({ kind }: { kind: 'home' | 'added' | 'cart' | 'product' | 'review' | 'card-hover' | 'button-hover' | 'button-press' }) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // Canvas parsing handles every CSS colour syntax (color-mix, oklch, color()) and returns sRGB bytes.
  const rgba = (css: string): number[] => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top: number[], base: number[]) => [0, 1, 2].map(i => Math.round(top[i] * top[3] + base[i] * (1 - top[3])));
  const background = (el: Element) => {
    const layers: number[][] = [];
    for (let node: Element | null = el; node; node = node.parentElement) { const c = rgba(getComputedStyle(node).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= 0.99) break; }
    return layers.reverse().reduce((base, layer) => over(layer, base), [255, 255, 255]);
  };
  const visible = (el: Element | null): el is HTMLElement => { if (!el) return false; const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0; };
  const first = (selector: string) => Array.from(document.querySelectorAll(selector)).find(visible) as HTMLElement | undefined;
  const px = (value: string) => parseFloat(value) || 0;
  const round = (value: number) => Math.round(value * 100) / 100;
  // Letter-spacing in em (what the DNA sets), so the scorecard can compare it on one visible step.
  const em = (st: CSSStyleDeclaration) => st.letterSpacing === 'normal' ? 0 : round(px(st.letterSpacing) / (px(st.fontSize) || 16));
  // Capped at half the short side, so 999px and 28px on a 56px pill read the same.
  const radius = (el: Element) => { const s = getComputedStyle(el), r = el.getBoundingClientRect(), cap = Math.min(r.width, r.height) / 2;
    return Math.round(Math.min(cap, Math.max(...[s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].map(v => v.endsWith('%') ? parseFloat(v) * Math.min(r.width, r.height) / 100 : px(v))))); };
  const family = (value: string) => value.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
  const control = (el: HTMLElement) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect(), bg = background(el);
    return { radius: radius(el), border: px(s.borderTopWidth), bg, color: over(rgba(s.color), bg), transform: s.textTransform, tracking: em(s), font: family(s.fontFamily), height: Math.round(r.height), padRatio: round(px(s.paddingLeft) / r.height) };
  };
  const border = (el: Element) => { const st = getComputedStyle(el); return Math.max(...[st.borderTopWidth, st.borderRightWidth, st.borderBottomWidth, st.borderLeftWidth].map(px)); };
  // The facts a DNA button form changes, for a button inside another surface.
  const form = (el: HTMLElement | undefined) => el ? { btnRadius: radius(el), btnBorder: px(getComputedStyle(el).borderTopWidth), btnTransform: getComputedStyle(el).textTransform, btnBg: background(el) } : {};
  const lstar = (y: number) => y <= 216 / 24389 ? y * 24389 / 27 : 116 * Math.cbrt(y) - 16; // CIE L*, 0..100
  const lum = (rgb: number[]) => { const c = rgb.map(v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  // How a panel is painted beyond its colour: a pattern (ruled lines), a cut edge (perforation) or flat; and its border style.
  const paint = (el: Element | null | undefined) => { if (!el) return 'none'; const st = getComputedStyle(el); const mask = st.maskImage || st.webkitMaskImage || 'none'; return mask !== 'none' ? 'perforated' : st.backgroundImage !== 'none' ? 'pattern' : 'flat'; };
  const edge = (el: Element) => { const st = getComputedStyle(el); const sides = (['Top', 'Right', 'Bottom', 'Left'] as const).map(side => ({ width: px(st.getPropertyValue(`border-${side.toLowerCase()}-width`)), style: st.getPropertyValue(`border-${side.toLowerCase()}-style`) })); const thick = sides.reduce((a, b) => b.width > a.width ? b : a); return thick.width ? thick.style : 'none'; };
  const vw = innerWidth, vh = innerHeight;
  if (kind === 'card-hover') {
    const cardEl = first('article.menu-item, [data-custom-product]');
    if (!cardEl) return null;
    const alt = cardEl.querySelector('.menu-item__image-alt'), image = cardEl.querySelector('.menu-item__image, img'), chip = cardEl.querySelector('.menu-item__quick-look');
    if (alt && Number(getComputedStyle(alt).opacity) > 0.5) return 'swap';
    if (chip && Number(getComputedStyle(chip).opacity) > 0.5) return 'chip';
    if (image && getComputedStyle(image).transform !== 'none') return 'scale';
    if (getComputedStyle(cardEl).transform !== 'none') return 'tilt';
    return 'none';
  }
  // The typeface a surface's title or text renders in, and its case (text-transform / small caps).
  const voice = (el: Element | null | undefined) => el ? { font: family(getComputedStyle(el).fontFamily), titleCase: `${getComputedStyle(el).textTransform}/${getComputedStyle(el).fontVariantCaps}`, titleTracking: em(getComputedStyle(el)) } : { font: '', titleCase: '', titleTracking: 0 };
  if (kind === 'button-press') { const el = first('.menu-add'); return el ? getComputedStyle(el).transform : null; }
  if (kind === 'button-hover') {
    const el = first('.menu-add');
    if (!el) return null;
    const st = getComputedStyle(el);
    return JSON.stringify([st.transform, st.filter, st.backgroundImage === 'none' ? 'none' : `${st.backgroundSize} ${st.backgroundPosition}`, st.boxShadow]);
  }
  if (kind === 'home') {
    const dna = Object.fromEntries(Array.from(document.documentElement.attributes).filter(a => a.name.startsWith('data-dna-')).map(a => [a.name.slice(9), a.value]));
    const heading = first('h1') || first('h2'), text = first('p') || document.body;
    const type = heading ? { display: family(getComputedStyle(heading).fontFamily), body: family(getComputedStyle(text).fontFamily), ratio: round(px(getComputedStyle(heading).fontSize) / px(getComputedStyle(text).fontSize)), headingCase: getComputedStyle(heading).textTransform } : null;
    const cardEl = first('article.menu-item, [data-custom-product]');
    const image = cardEl?.querySelector('img');
    const buttonEl = first('.menu-add');
    const add = buttonEl && cardEl?.contains(buttonEl) ? form(buttonEl) : {};
    const card = cardEl ? { aspect: round(cardEl.getBoundingClientRect().width / cardEl.getBoundingClientRect().height), imageRadius: image ? radius(image) : 0, align: getComputedStyle(cardEl.querySelector('h3, h2, .menu-item__copy') || cardEl).textAlign, images: cardEl.querySelectorAll('img').length,
      font: voice(cardEl.querySelector('[data-product-field="name"], h3, h2')).font, pad: image ? Math.round(px(getComputedStyle(image).paddingBottom)) : 0, swatches: cardEl.querySelectorAll('[data-card-swatch]').length, addRadius: add.btnRadius ?? -1, addBorder: add.btnBorder ?? -1,
      addTransform: buttonEl && cardEl.contains(buttonEl) ? `${getComputedStyle(buttonEl).textTransform}/${getComputedStyle(buttonEl).fontVariantCaps}` : 'none', addTracking: buttonEl && cardEl.contains(buttonEl) ? em(getComputedStyle(buttonEl)) : 0 } : null;
    const hoverBefore = buttonEl ? (() => { const st = getComputedStyle(buttonEl); return JSON.stringify([st.transform, st.filter, st.backgroundImage === 'none' ? 'none' : `${st.backgroundSize} ${st.backgroundPosition}`, st.boxShadow]); })() : null;
    // An image without a source yet is deferred (the card's second photo loads when the shopper reaches the card), not missing.
    const missingImages = Array.from(document.images).filter(i => { const r = i.getBoundingClientRect(); return (i.getAttribute('src') || i.getAttribute('srcset')) && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && (!i.complete || !i.naturalWidth); }).length;
    return { dna, type, card, hoverBefore, button: buttonEl ? control(buttonEl) : null, overflow: document.documentElement.scrollWidth > vw + 1, fontsLoaded: document.fonts.status === 'loaded', missingImages };
  }
  if (kind === 'added') {
    const el = first('.cart-added[data-visible="true"]');
    if (!el) return null;
    const r = el.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    const position = `${cy < vh / 3 ? 'top' : cy > vh * 2 / 3 ? 'bottom' : 'middle'}-${cx < vw / 3 ? 'left' : cx > vw * 2 / 3 ? 'right' : 'center'}`;
    return { position, width: round(r.width / vw), height: Math.round(r.height), radius: radius(el), bg: background(el), border: Math.max(px(getComputedStyle(el).borderTopWidth), px(getComputedStyle(el).borderBottomWidth)), font: voice(el.querySelector('span')).font, ...form(first('.cart-added[data-visible="true"] button') ?? undefined) };
  }
  if (kind === 'cart') {
    const el = document.querySelector('dialog.cart-drawer[open]');
    if (!el) return null;
    const r = el.getBoundingClientRect(), left = r.left <= 1, right = r.right >= vw - 1, top = r.top <= 1, bottom = r.bottom >= vh - 1;
    // A bottom sheet narrower than the viewport still reads as a bottom sheet.
    const position = left && right && top && bottom ? 'full' : bottom && !top ? 'bottom' : top && !bottom ? 'top' : right && !left ? 'right' : left && !right ? 'left' : 'centered';
    const photo = el.querySelector('.order-item__photo'), step = el.querySelector('.quantity button');
    return { position, width: round(r.width / vw), radius: radius(el), bg: background(el), page: background(document.body), border: border(el), ...voice(el.querySelector('.cart-drawer__header h2')), photoRadius: photo ? radius(photo) : -1, stepRadius: step ? radius(step) : -1, ...form(el.querySelector<HTMLElement>('.checkout-button') ?? undefined) };
  }
  if (kind === 'product') {
    const el = document.querySelector('[data-pagosya-product][data-style]');
    if (!el) return null;
    const gallery = el.querySelector('.product-detail__gallery'), copy = el.querySelector('.product-detail__copy'), buy = first('[data-pagosya-product] .product-detail__buy');
    let position = 'none';
    if (visible(gallery) && copy) { const g = gallery.getBoundingClientRect(), c = copy.getBoundingClientRect(); position = g.bottom <= c.top + 1 ? 'top' : g.top >= c.bottom - 1 ? 'bottom' : g.left < c.left ? 'left' : 'right'; }
    return { style: el.getAttribute('data-style') || '', gallery: position, buy: buy ? control(buy) : null };
  }
  const review = first('.checkout-review');
  if (!review) return null;
  const s = getComputedStyle(review), summary = review.querySelector('.checkout-review__summary'), fields = review.querySelector('.checkout-review__fields');
  let position = 'none';
  if (summary && fields) { const a = summary.getBoundingClientRect(), b = fields.getBoundingClientRect(); position = a.left >= b.right - 1 ? 'right' : a.right <= b.left + 1 ? 'left' : a.top >= b.bottom - 1 ? 'below' : 'above'; }
  const box = summary?.getBoundingClientRect(), whole = review.getBoundingClientRect();
  return { columns: s.display.includes('grid') ? s.gridTemplateColumns.split(' ').filter(Boolean).length : 1, summary: position,
    ...voice(summary?.querySelector('h2')), summaryPaint: paint(summary), summaryEdge: summary ? edge(summary) : 'none', pad: summary ? Math.round(px(getComputedStyle(summary).paddingLeft)) : 0, summaryShare: box && whole.width ? round(box.width / whole.width) : 0, width: round(whole.width / vw), radius: summary ? radius(summary) : 0, border: summary ? border(summary) : 0,
    bgDelta: summary ? Math.round(Math.abs(lstar(lum(background(summary))) - lstar(lum(background(document.body)))) * 10) / 10 : 0, ...form(review.querySelector<HTMLElement>('.checkout-button') ?? undefined) };
}

const luminance = (rgb: Rgb) => Math.round(relativeLuminance(rgb) * 1000) / 1000;
/** A button inside another surface (cart, added, review): the facts its DNA form changes. */
const formSample = (facts: { btnRadius?: number; btnBorder?: number; btnTransform?: string; btnBg?: Rgb }): SurfaceSample => facts.btnBg ? { btnRadius: facts.btnRadius!, btnBorder: facts.btnBorder!, btnTransform: facts.btnTransform!, btnBgLum: luminance(facts.btnBg) } : {};
const buttonSample = (c: Control, from: string): SurfaceSample => ({ from, radius: c.radius, border: c.border, bgLum: luminance(c.bg), transform: c.transform, tracking: c.tracking, font: c.font, height: c.height, padRatio: c.padRatio });

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.evaluate(() => Promise.all(Array.from(document.images).filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).map(i => i.decode().catch(() => undefined))));
}

async function addFirstProduct(page: Page) {
  const tagged = await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll('[data-add], [data-variant-add]')).find(el => !el.closest('[data-pagosya-cart], dialog:not([data-pagosya-product])') && !(el as HTMLButtonElement).disabled && el.getBoundingClientRect().width > 0);
    target?.setAttribute('data-scorecard-add', '');
    return !!target;
  });
  if (!tagged) return false;
  try { await page.click('[data-scorecard-add]', { timeout: 2500 }); }
  catch { await page.evaluate(() => (document.querySelector('[data-scorecard-add]') as HTMLElement | null)?.click()); }
  return page.waitForSelector('.cart-added[data-visible="true"]', { state: 'visible', timeout: 3000 }).then(() => true, () => false);
}

async function visitViewport(context: BrowserContext, viewport: Viewport, width: number, config: any, shots: Array<{ name: string; image: Buffer }> | null, errors: string[]): Promise<ViewportFacts> {
  const facts: ViewportFacts = { surfaces: {}, dna: {}, overflow: null, fontsLoaded: null, missingImages: null, buyContrast: null };
  const page = await context.newPage();
  page.on('dialog', dialog => { void dialog.dismiss(); });
  page.setDefaultTimeout(5000);
  await page.setViewportSize({ width, height: 844 });
  const step = async (surface: string, run: () => Promise<void>) => {
    try { await run(); } catch (error) { errors.push(`${viewport} ${surface}: ${(error instanceof Error ? error.message : String(error)).split('\n')[0].slice(0, 200)}`); }
  };
  const shot = async (name: string) => { if (shots) shots.push({ name: `${name}-${viewport}`, image: await page.screenshot({ type: 'jpeg', quality: 70, animations: 'disabled' }) }); };
  const measureAdded = async () => {
    const added = await page.evaluate(measureInPage, { kind: 'added' as const }) as any;
    if (!added) throw new Error('the added-to-cart confirmation did not appear');
    facts.surfaces.added = { position: added.position, width: added.width, height: added.height, radius: added.radius, bgLum: luminance(added.bg), border: added.border, font: added.font, ...formSample(added) };
    await shot('added');
  };
  let added = false;
  try {
    await step('home', async () => {
      await page.goto(`${origin}/index.html`, { waitUntil: 'load', timeout: 10000 });
      await settle(page);
      const home = await page.evaluate(measureInPage, { kind: 'home' as const }) as any;
      facts.dna = home.dna; facts.overflow = home.overflow; facts.fontsLoaded = home.fontsLoaded; facts.missingImages = home.missingImages;
      if (home.type) facts.surfaces.type = home.type; else errors.push(`${viewport} type: no heading`);
      if (home.card) facts.surfaces.card = home.card; else errors.push(`${viewport} card: no product card on the home`);
      if (home.button) { facts.surfaces.button = buttonSample(home.button, 'card'); facts.buyContrast = contrastRatio(home.button.color, home.button.bg); }
      // Preview and hover behaviour: hover the card, then the button, and record what changed.
      const cardTarget = page.locator('article.menu-item, [data-custom-product]').first();
      if (home.card && await cardTarget.isVisible()) {
        await cardTarget.hover({ position: { x: 20, y: 20 }, timeout: 2000 }).catch(() => undefined);
        facts.surfaces.card!.hover = await page.evaluate(measureInPage, { kind: 'card-hover' as const }) as string ?? 'none';
      }
      const buttonTarget = page.locator('.menu-add').first();
      if (facts.surfaces.button && await buttonTarget.isVisible()) {
        await buttonTarget.hover({ timeout: 2000 }).catch(() => undefined);
        const after = await page.evaluate(measureInPage, { kind: 'button-hover' as const }) as string | null;
        facts.surfaces.button.hover = after === null || after === home.hoverBefore ? 'none' : after;
        // Press: hold the button down, read it, and release elsewhere so nothing is added.
        await page.mouse.down();
        facts.surfaces.button.press = await page.evaluate(measureInPage, { kind: 'button-press' as const }) as string ?? 'none';
        await page.mouse.move(0, 0);
        await page.mouse.up();
      }
      await page.mouse.move(0, 0);
    });
    await step('added', async () => { if (await addFirstProduct(page)) { added = true; await measureAdded(); } });
    const measureCart = async () => {
      const opened = await page.evaluate(() => { const t = document.querySelector<HTMLElement>('[data-cart-open], a[href="#pedido"], a[href="#carrito"], a[href="#cart"]'); t?.click(); return !!t; });
      if (!opened) throw new Error('no cart trigger');
      await page.waitForSelector('dialog.cart-drawer[open]', { timeout: 3000 });
      const cart = await page.evaluate(measureInPage, { kind: 'cart' as const }) as any;
      facts.surfaces.cart = { position: cart.position, width: cart.width, radius: cart.radius, bgDelta: Math.round(Math.abs(lightness(relativeLuminance(cart.bg)) - lightness(relativeLuminance(cart.page))) * 10) / 10, border: cart.border, font: cart.font, titleCase: cart.titleCase, titleTracking: cart.titleTracking, photoRadius: cart.photoRadius, stepRadius: cart.stepRadius, ...formSample(cart) };
      await shot('cart');
      await page.evaluate(() => document.querySelector<HTMLDialogElement>('dialog.cart-drawer[open]')?.close());
    };
    await step('cart', measureCart);
    const product = config.data?.items?.[0];
    if (config.productPage && product) await step('product', async () => {
      await page.goto(`${origin}/${config.productPage}?id=${encodeURIComponent(product.id)}`, { waitUntil: 'load', timeout: 10000 });
      await page.waitForSelector('[data-pagosya-product][data-style] .product-detail__layout', { timeout: 5000 });
      await settle(page);
      const detail = await page.evaluate(measureInPage, { kind: 'product' as const }) as any;
      facts.surfaces.product = { style: detail.style, gallery: detail.gallery, ...(detail.buy ? { buyRadius: detail.buy.radius } : {}) };
      if (detail.buy) facts.buyContrast = contrastRatio(detail.buy.color, detail.buy.bg);
      if (!facts.surfaces.button && detail.buy) facts.surfaces.button = buttonSample(detail.buy, 'product');
      if (!added) {
        const groups = await page.locator('.product-detail__options fieldset').count();
        for (let group = 0; group < groups; group++) await page.locator(`[data-product-option="${group}"]:not([disabled])`).first().click();
        if (await addFirstProduct(page)) { added = true; await measureAdded(); }
        // The home could not add: measure the cart again, now with the product in it.
        if (added && facts.surfaces.cart?.stepRadius === -1) { const old = shots?.findIndex(s => s.name === `cart-${viewport}`) ?? -1; if (old >= 0) shots!.splice(old, 1); await measureCart(); }
      }
    });
    if (config.checkoutPage && added) await step('review', async () => {
      await page.goto(`${origin}/${config.checkoutPage}`, { waitUntil: 'load', timeout: 10000 });
      await page.waitForSelector('.checkout-review', { timeout: 5000 });
      const review = await page.evaluate(measureInPage, { kind: 'review' as const }) as any;
      facts.surfaces.review = { columns: review.columns, summary: review.summary, font: review.font, titleCase: review.titleCase, titleTracking: review.titleTracking, summaryPaint: review.summaryPaint, summaryEdge: review.summaryEdge, pad: review.pad, summaryShare: review.summaryShare, width: review.width, radius: review.radius, border: review.border, bgDelta: review.bgDelta, ...formSample(review) };
    });
  } finally { await page.close(); }
  return facts;
}

const KIT_FILES = new Set(['commerce.js', 'privacy.js', 'retention.js', 'motion.js', 'video.js', 'server.mjs', 'build.mjs', 'commerce-pages.css', 'lib/ui.tsx', 'lib/creative.tsx', 'lib/commerce.tsx']);
const MOTION_HOOKS = /<(?:Parallax|Reveal|Marquee)\b|\banimate\(|\bIntersectionObserver\b|@keyframes\b/g;

/** Motion cannot run in the reduced-motion sandbox, so count it in the store's own files (kit runtime and compiled output excluded). */
export function staticMotionHooks(files: SourceProjectSnapshot['files']): number {
  return files.filter(f => f.encoding !== 'base64' && !KIT_FILES.has(f.path) && !f.path.startsWith('_compiled/') && /\.(html|css|js|mjs|tsx?|jsx)$/.test(f.path))
    .reduce((sum, f) => sum + (f.content.match(MOTION_HOOKS)?.length ?? 0), 0);
}

/** Informational: how often the store's own files use the --motion-* tokens (sub-project 6) instead of literals. */
export function staticMotionTokens(files: SourceProjectSnapshot['files']): number {
  return files.filter(f => f.encoding !== 'base64' && !KIT_FILES.has(f.path) && !f.path.startsWith('_compiled/') && /\.(html|css|js|mjs|tsx?|jsx)$/.test(f.path))
    .reduce((sum, f) => sum + (f.content.match(/var\(\s*--motion-/g)?.length ?? 0), 0);
}

function parseConfig(snapshot: SourceProjectSnapshot) {
  const content = snapshot.files.find(f => f.path === 'config.js')?.content ?? '';
  try { return JSON.parse(content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)?.[1] || '{}'); } catch { return {}; }
}

export async function collectStoreSample(input: { id: string; name: string; snapshot: SourceProjectSnapshot }, options: { screenshots?: boolean; signal?: AbortSignal } = {}): Promise<{ sample: StoreSample; screenshots: Array<{ name: string; image: Buffer }> }> {
  const errors: string[] = [], screenshots: Array<{ name: string; image: Buffer }> = [];
  const runtime = await currentSourceRuntime(input.snapshot);
  const config = parseConfig(runtime);
  // Demo mode is what probeSourceShopping uses: simulated checkout, no API calls.
  const demo = { ...runtime, files: runtime.files.map(f => f.path === 'config.js' ? { ...f, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, demo: true })};` } : f) };
  const views: Partial<Record<Viewport, ViewportFacts>> = {};
  for (const [viewport, width] of VIEWPORTS) {
    try { views[viewport] = await withVisualSandbox(demo, '', options.signal, true, context => visitViewport(context, viewport, width, config, options.screenshots ? screenshots : null, errors)); }
    catch (error) { errors.push(`${viewport}: ${(error instanceof Error ? error.message : String(error)).split('\n')[0].slice(0, 200)}`); }
  }
  const surfaces: Partial<Record<SurfaceName, SurfaceSample>> = {};
  for (const [viewport] of VIEWPORTS) for (const [surface, sample] of Object.entries(views[viewport]?.surfaces ?? {}) as Array<[SurfaceName, SurfaceSample]>) {
    surfaces[surface] = { ...surfaces[surface], ...Object.fromEntries(Object.entries(sample).map(([key, value]) => [viewport === 'desktop' ? key : `m.${key}`, value])) };
  }
  const dna = views.desktop?.dna ?? views.mobile?.dna ?? {};
  surfaces.page = { ...Object.fromEntries(Object.entries(dna).map(([name, value]) => [`dna.${name}`, value])), motionHooks: staticMotionHooks(input.snapshot.files), motionTokens: staticMotionTokens(input.snapshot.files) };
  let shopping: Pick<QualityFacts, 'shopping' | 'shoppingError'> = { shopping: 'unsupported' };
  try {
    const probes = await probeSourceShopping(runtime, options.signal);
    const failed = probes.find(p => p.status === 'failed');
    shopping = failed ? { shopping: 'failed', shoppingError: `${failed.width}px: ${failed.error ?? 'failed'}` } : probes.some(p => p.status === 'passed') ? { shopping: 'passed' } : { shopping: 'unsupported' };
  } catch (error) { shopping = { shopping: 'failed', shoppingError: (error instanceof Error ? error.message : String(error)).slice(0, 200) }; }
  const contrasts = VIEWPORTS.map(([v]) => views[v]?.buyContrast).filter((c): c is number => typeof c === 'number');
  const both = <T>(pick: (facts: ViewportFacts) => T | null) => VIEWPORTS.map(([v]) => views[v] ? pick(views[v]!) : null);
  const [fontsDesktop, fontsMobile] = both(f => f.fontsLoaded), missing = both(f => f.missingImages).filter((n): n is number => n !== null);
  const quality: QualityFacts = {
    ...shopping,
    overflow: { desktop: views.desktop?.overflow ?? null, mobile: views.mobile?.overflow ?? null },
    fontsLoaded: fontsDesktop === null && fontsMobile === null ? null : fontsDesktop !== false && fontsMobile !== false,
    missingImages: missing.length ? Math.max(...missing) : null,
    buyContrast: contrasts.length ? Math.round(Math.min(...contrasts) * 100) / 100 : null,
  };
  return { sample: { id: input.id, name: input.name, surfaces, quality, errors }, screenshots };
}

const productImage = (label: string, color: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000"><rect width="800" height="1000" fill="${color}"/><text x="400" y="520" font-family="sans-serif" font-size="64" text-anchor="middle" fill="#fff">${label}</text></svg>`;

/** The kit default: a store with the kit's pages and runtime and no authored styling. */
export async function kitDefaultSnapshot(): Promise<SourceProjectSnapshot> {
  const kit = async (path: string) => ({ path, content: await readFile(kitPath(path), 'utf8'), encoding: 'utf8' as const });
  const items = [['p1', 'Taza', '#8a5a44'], ['p2', 'Cuenco', '#44628a'], ['p3', 'Jarrón', '#4a7a52']].map(([id, name, color], i) => ({ id, name, description: `${name} de cerámica hecha a mano.`, amount: 12000 + i * 4000, currency: 'BOB', stock: 10, imageUrls: [`assets/${id}.svg`], color }));
  const config = { slug: 'kit-default', apiBaseUrl: origin, checkoutOrigin: origin, productPage: 'product.html', checkoutPage: 'checkout.html', demo: true, data: { storeName: 'Tienda', items: items.map(({ color: _color, ...item }) => item) } };
  const index = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tienda</title><script src="config.js" defer></script><script src="commerce.js" defer></script></head>'
    + '<body><header><a href="index.html">Tienda</a> <button type="button" data-cart-open>Pedido (<span data-cart-count>0</span>)</button></header>'
    + '<main><h1>Tienda</h1><p>Cerámica hecha a mano.</p><section id="catalogo"><div data-pagosya-catalog data-pagosya-grid></div></section></main><div data-pagosya-cart></div><p data-pagosya-status role="status" aria-live="polite"></p></body></html>';
  return {
    schemaVersion: 1,
    brief: { businessType: 'Tienda', audience: 'Clientes', primaryAction: 'Comprar', visualDirection: 'Sin estilo propio' },
    files: [
      ...await Promise.all(['commerce.js', 'commerce-pages.css', 'product.html', 'checkout.html'].map(kit)),
      { path: 'index.html', content: index, encoding: 'utf8' },
      { path: 'styles.css', content: '', encoding: 'utf8' }, { path: 'site.js', content: '', encoding: 'utf8' },
      { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};`, encoding: 'utf8' },
      ...items.map(item => ({ path: `assets/${item.id}.svg`, content: productImage(item.name, item.color), encoding: 'utf8' as const })),
    ],
  };
}

const BINARY = /\.(png|jpe?g|webp|avif|gif|woff2?|ttf|otf|mp4)$/i;
/** An exported site folder (benchmark output) as a snapshot; binaries as base64. */
export async function snapshotFromDirectory(dir: string): Promise<SourceProjectSnapshot> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = await Promise.all(entries.filter(entry => entry.isFile()).map(async entry => {
    const full = join(entry.parentPath, entry.name), path = relative(dir, full).split('\\').join('/');
    const bytes = await readFile(full);
    return BINARY.test(path) ? { path, content: bytes.toString('base64'), encoding: 'base64' as const } : { path, content: bytes.toString('utf8'), encoding: 'utf8' as const };
  }));
  return { schemaVersion: 1, brief: { businessType: 'Tienda', audience: 'Clientes', primaryAction: 'Comprar', visualDirection: 'Exportada' }, files };
}
