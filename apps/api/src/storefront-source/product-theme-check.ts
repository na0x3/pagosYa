/// <reference lib="dom" />
/** Real-browser check of a themed product page (theme plan, D5). The sanitizer bounds each declaration; this proves the
 * page they add up to still lets a shopper see the price, choose options, and press the buy button: every protected
 * control must be visible, reachable (not covered), big enough, and readable at phone and desktop width, and the page
 * must not scroll sideways. The same viewport/contrast helpers as the scorecard; never calls a model. */
import type { Page } from 'playwright';
import { currentSourceRuntime } from './source-runtime';
import { withVisualSandbox } from './source-visual-capture';
import { parseConfig } from './source-scorecard-capture';
import { contrastRatio, MIN_BUY_CONTRAST } from './source-scorecard';
import type { SourceProjectSnapshot } from './source-project';

export type ThemeCheckFailure = { control: string; viewport: 'mobile' | 'desktop'; reason: string };
const VIEWPORTS = [['mobile', 390, 844], ['desktop', 1280, 800]] as const;
const origin = 'https://preview.invalid';
const MIN_OPACITY = 0.6;
const BUY_MIN = { width: 120, height: 44 };
/** WCAG 2.2 minimum target size. The kit's own colour swatches are 28px, so a stricter bar would fail the unthemed page. */
const OPTION_MIN = 24;

type Rgb = [number, number, number];
type Facts = { overflow: boolean; controls: Array<{ name: string; width: number; height: number; hidden: boolean; opacity: number; covered: boolean; color: Rgb; bg: Rgb }> } | null;

/** Everything measured in the page, in one self-contained function (it is serialized into the browser). */
function measureThemeControls(): Facts {
  const root = document.querySelector('[data-pagosya-product][data-style]');
  if (!root) return null;
  const rgba = (value: string): [number, number, number, number] => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return [0, 0, 0, 0];
    const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
  };
  const background = (element: Element): Rgb => {
    for (let node: Element | null = element; node; node = node.parentElement) { const c = rgba(getComputedStyle(node).backgroundColor); if (c[3] >= 0.99) return [c[0], c[1], c[2]]; }
    return [255, 255, 255];
  };
  const opacityChain = (element: Element) => { let value = 1; for (let node: Element | null = element; node && node !== document.documentElement; node = node.parentElement) value *= parseFloat(getComputedStyle(node).opacity); return value; };
  const isHidden = (element: Element) => { for (let node: Element | null = element; node && node !== document.documentElement; node = node.parentElement) { const s = getComputedStyle(node); if (s.display === 'none' || s.visibility === 'hidden') return true; } return false; };
  const sample = (name: string, element: Element) => {
    (element as HTMLElement).scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = element.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1);
    const top = document.elementFromPoint(x, y);
    const c = rgba(getComputedStyle(element).color);
    return { name, width: rect.width, height: rect.height, hidden: isHidden(element) || rect.width === 0 || rect.height === 0, opacity: opacityChain(element), covered: !top || !(top === element || element.contains(top)), color: [c[0], c[1], c[2]] as Rgb, bg: background(element) };
  };
  const overflow = document.documentElement.scrollWidth > innerWidth + 1;
  const controls: NonNullable<Facts>['controls'] = [];
  for (const [name, selector] of [['price', '.product-detail__price'], ['quantity', '.product-detail__quantity'], ['buy', '.product-detail__buy']] as const) {
    const element = root.querySelector(selector);
    if (element) controls.push(sample(name, element));
  }
  root.querySelectorAll('[data-product-option]').forEach(element => controls.push(sample('option', element)));
  return { overflow, controls };
}

/** Assumes the caller already loaded a product page with the theme applied. */
export async function checkProductTheme(page: Page): Promise<ThemeCheckFailure[]> {
  const failures: ThemeCheckFailure[] = [];
  for (const [viewport, width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const facts = await page.evaluate(measureThemeControls) as Facts;
    const add = (control: string, reason: string) => { if (!failures.some(f => f.control === control && f.viewport === viewport && f.reason === reason)) failures.push({ control, viewport, reason }); };
    if (!facts) { add('page', 'the product page did not render'); continue; }
    if (facts.overflow) add('page', 'horizontal overflow: the page scrolls sideways');
    for (const control of facts.controls) {
      if (control.hidden) { add(control.name, 'hidden or zero-sized'); continue; }
      if (control.opacity < MIN_OPACITY) add(control.name, `too transparent (opacity ${Math.round(control.opacity * 100) / 100})`);
      if (control.covered) add(control.name, 'covered by another element');
      if (control.name === 'buy' && (control.width < BUY_MIN.width || control.height < BUY_MIN.height)) add('buy', `too small (${Math.round(control.width)}x${Math.round(control.height)}px, needs ${BUY_MIN.width}x${BUY_MIN.height})`);
      if (control.name === 'option' && (control.width < OPTION_MIN || control.height < OPTION_MIN)) add('option', `too small (${Math.round(control.width)}x${Math.round(control.height)}px, needs ${OPTION_MIN}x${OPTION_MIN})`);
      if (control.name === 'price' || control.name === 'buy') {
        const ratio = contrastRatio(control.color, control.bg);
        if (ratio < MIN_BUY_CONTRAST) add(control.name, `text contrast ${Math.round(ratio * 100) / 100}:1 (needs ${MIN_BUY_CONTRAST}:1)`);
      }
    }
  }
  return failures;
}

/** Runs the check on a whole store snapshot: its first product, in the shared visual sandbox (no network, no model). */
export async function checkProductThemeOnSnapshot(snapshot: SourceProjectSnapshot, options: { signal?: AbortSignal } = {}): Promise<ThemeCheckFailure[]> {
  const runtime = await currentSourceRuntime(snapshot);
  const config = parseConfig(runtime);
  if (!config.productPage) return [{ control: 'page', viewport: 'desktop', reason: 'the store has no product page to check' }];
  // Test future purchasing controls even when the merchant has no products yet.
  // This fixture exists only in the isolated browser copy, never in the snapshot or DB.
  const product = config.data?.items?.[0] || {
    id: '__theme_probe__', name: 'Producto de comprobación con un nombre largo para validar el diseño',
    description: 'Dato temporal de prueba.', amount: 12900, currency: 'BOB', stock: 3, imageUrls: [],
    variants: [{ id: '__theme_probe_variant__', name: 'Estándar', amount: 12900, stock: 3, options: [{ name: 'Tamaño', value: 'Estándar' }] }],
  };
  const data = config.data?.items?.length ? config.data : { ...config.data, items: [product] };
  const demo = { ...runtime, files: runtime.files.map(f => f.path === 'config.js' ? { ...f, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, data, demo: true })};` } : f) };
  return withVisualSandbox(demo, '', options.signal, true, async context => {
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    try {
      await page.goto(`${origin}/${config.productPage}?id=${encodeURIComponent(product.id)}`, { waitUntil: 'load', timeout: 10000 });
      await page.waitForSelector('[data-pagosya-product][data-style] .product-detail__layout', { timeout: 5000 });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      return await checkProductTheme(page);
    } finally { await page.close(); }
  });
}
