/// <reference lib="dom" />
/** Real-browser check of YAPI's guarded CSS on the kit's catalog, cards and cart (spec 2026-10-14), the sibling of
 * product-theme-check.ts. Every protected control must stay visible, opaque enough, uncovered where it is a click target,
 * big enough and readable, at phone and desktop width; no page may scroll sideways. Never calls a model. */
import type { Page } from 'playwright';
import { currentSourceRuntime } from './source-runtime';
import { withVisualSandbox } from './source-visual-capture';
import { parseConfig } from './source-scorecard-capture';
import { contrastRatio, MIN_BUY_CONTRAST } from './source-scorecard';
import type { ThemeCheckFailure } from './product-theme-check';
import type { SourceProjectSnapshot } from './source-project';
import type { KitSurface } from './product-theme-css';

export type KitSurfaceFailures = Record<KitSurface, ThemeCheckFailure[]>;
type Probe = { name: string; selector: string; target: boolean; contrast: boolean; min?: { width: number; height: number } };
type Rgb = [number, number, number];
type Reading = { overflow: boolean; controls: Array<{ name: string; width: number; height: number; hidden: boolean; opacity: number; covered: boolean; color: Rgb; bg: Rgb; target: boolean; contrast: boolean; min?: { width: number; height: number } }> };
const origin = 'https://preview.invalid';
const VIEWPORTS = [['mobile', 390, 844], ['desktop', 1280, 800]] as const;
const PROBE_ID = '__surface_probe__';
// The plain kit's add button measures 34x27px, so the floor is the 24px WCAG 2.2 minimum target, not 40px.
// The card's details link covers the whole card by design, so the card price is checked for visibility and contrast, not cover.
const CARD_PROBES: Probe[] = [
  { name: 'card-price', selector: '[data-pagosya-catalog] .menu-item .menu-item__price', target: false, contrast: true },
  { name: 'add', selector: '[data-pagosya-catalog] .menu-item .menu-add', target: true, contrast: false, min: { width: 24, height: 24 } },
  { name: 'card', selector: '[data-pagosya-catalog] .menu-item', target: false, contrast: false },
];
const CATALOG_PROBES: Probe[] = [{ name: 'tabs', selector: '[data-pagosya-catalog] .catalog-tabs a', target: true, contrast: true }, ...CARD_PROBES];
const CART_PROBES: Probe[] = [
  { name: 'checkout', selector: '.cart-drawer .checkout-button', target: true, contrast: true, min: { width: 120, height: 44 } },
  { name: 'total', selector: '.cart-drawer .order-total', target: false, contrast: true },
  { name: 'quantity', selector: '.cart-drawer :is([data-add],[data-remove],[data-remove-line])', target: true, contrast: false, min: { width: 24, height: 24 } },
  { name: 'line', selector: '.cart-drawer .order-item', target: false, contrast: false },
];

/** Serialized into the page: measures the first three matches of each probe. */
function measureSurface(probes: Probe[]): Reading {
  const rgba = (value: string): [number, number, number, number] => { const m = value.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 ? p[3] : 1]; };
  const background = (element: Element): Rgb => { for (let node: Element | null = element; node; node = node.parentElement) { const c = rgba(getComputedStyle(node).backgroundColor); if (c[3] >= 0.99) return [c[0], c[1], c[2]]; } return [255, 255, 255]; };
  const opacityChain = (element: Element) => { let value = 1; for (let node: Element | null = element; node && node !== document.documentElement; node = node.parentElement) value *= parseFloat(getComputedStyle(node).opacity); return value; };
  const isHidden = (element: Element) => { for (let node: Element | null = element; node && node !== document.documentElement; node = node.parentElement) { const s = getComputedStyle(node); if (s.display === 'none' || s.visibility === 'hidden') return true; } return false; };
  const controls: Reading['controls'] = [];
  for (const probe of probes) for (const element of Array.from(document.querySelectorAll(probe.selector)).slice(0, 3)) {
    (element as HTMLElement).scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = element.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1);
    const top = document.elementFromPoint(x, y);
    const c = rgba(getComputedStyle(element).color);
    controls.push({ name: probe.name, width: rect.width, height: rect.height, hidden: isHidden(element) || rect.width === 0 || rect.height === 0, opacity: opacityChain(element), covered: !top || !(top === element || element.contains(top)), color: [c[0], c[1], c[2]], bg: background(element), target: probe.target, contrast: probe.contrast, min: probe.min });
  }
  return { overflow: document.documentElement.scrollWidth > innerWidth + 1, controls };
}

function judge(reading: Reading, viewport: 'mobile' | 'desktop', into: ThemeCheckFailure[]) {
  const add = (control: string, reason: string) => { if (!into.some(f => f.control === control && f.viewport === viewport && f.reason === reason)) into.push({ control, viewport, reason }); };
  if (reading.overflow) add('page', 'horizontal overflow: the page scrolls sideways');
  for (const c of reading.controls) {
    if (c.hidden) { add(c.name, 'hidden or zero-sized'); continue; }
    if (c.opacity < 0.6) add(c.name, `too transparent (opacity ${Math.round(c.opacity * 100) / 100})`);
    if (c.target && c.covered) add(c.name, 'covered by another element');
    if (c.min && (c.width < c.min.width || c.height < c.min.height)) add(c.name, `too small (${Math.round(c.width)}x${Math.round(c.height)}px, needs ${c.min.width}x${c.min.height})`);
    if (c.contrast) { const ratio = contrastRatio(c.color, c.bg); if (ratio < MIN_BUY_CONTRAST) add(c.name, `text contrast ${Math.round(ratio * 100) / 100}:1 (needs ${MIN_BUY_CONTRAST}:1)`); }
  }
}

const settle = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/** Cards and the cart drawer on the home page, the catalog on productos.html when the store has it. A probe product (only
 * in the isolated copy) guarantees a card and a cart line even for a store with no products yet. */
export async function checkKitSurfacesOnSnapshot(snapshot: SourceProjectSnapshot, options: { signal?: AbortSignal } = {}): Promise<KitSurfaceFailures> {
  const runtime = await currentSourceRuntime(snapshot);
  const config = parseConfig(runtime);
  const probe = { id: PROBE_ID, name: 'Producto de comprobación con un nombre largo para validar el diseño', description: 'Dato temporal de prueba.', amount: 12900, currency: 'BOB', stock: 3, imageUrls: [] };
  const data = { ...config.data, items: [probe, ...(config.data?.items ?? [])] };
  const demo = { ...runtime, files: runtime.files.map(f => f.path === 'config.js' ? { ...f, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, data, demo: true })};` } : f) };
  const out: KitSurfaceFailures = { catalog: [], card: [], cart: [] };
  const hasCatalog = runtime.files.some(f => f.path === 'productos.html');
  await withVisualSandbox(demo, '', options.signal, true, async context => {
    await context.addInitScript(({ key, id }) => { try { sessionStorage.setItem(key, JSON.stringify([{ id, quantity: 1 }])); } catch { /* storage off */ } }, { key: `pagosya:cart:${config.slug || 'store'}`, id: PROBE_ID });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const visit = async (path: string) => {
      await page.goto(`${origin}/${path}`, { waitUntil: 'load', timeout: 10_000 });
      const ready = await page.waitForSelector('[data-pagosya-catalog] .menu-item', { timeout: 4000 }).then(() => true, () => false);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await settle(page);
      return ready;
    };
    try {
      for (const [viewport, width, height] of VIEWPORTS) {
        await page.setViewportSize({ width, height });
        if (await visit('index.html')) judge(await page.evaluate(measureSurface, CARD_PROBES), viewport, out.card);
        await page.evaluate(() => { const button = document.createElement('button'); button.type = 'button'; button.setAttribute('data-cart-open', ''); document.body.append(button); button.click(); });
        const open = await page.waitForSelector('.cart-drawer[open]', { timeout: 3000 }).then(() => true, () => false);
        if (open) { await settle(page); judge(await page.evaluate(measureSurface, CART_PROBES), viewport, out.cart); }
        else out.cart.push({ control: 'cart', viewport, reason: 'the cart drawer did not open' });
        if (hasCatalog && await visit('productos.html')) judge(await page.evaluate(measureSurface, CATALOG_PROBES), viewport, out.catalog);
      }
    } finally { await page.close(); }
  });
  return out;
}
