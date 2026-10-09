/// <reference lib="dom" />
/** Real-browser check of a store's account pages (spec 2026-10-08-store-built-in-account-pages-design), like the product
 * page's (product-theme-check.ts): the sanitizer bounds each declaration; this proves the sign-in and sign-up pages they
 * add up to still let a shopper see and use the fields, the button, the links and an error message, at phone and desktop
 * width, without sideways scroll. Never calls a model. */
import type { Page } from 'playwright';
import { currentSourceRuntime } from './source-runtime';
import { withVisualSandbox } from './source-visual-capture';
import { contrastRatio, MIN_BUY_CONTRAST } from './source-scorecard';
import type { ThemeCheckFailure } from './product-theme-check';
import type { SourceProjectSnapshot } from './source-project';

const VIEWPORTS = [['mobile', 390, 844], ['desktop', 1280, 800]] as const;
const origin = 'https://preview.invalid';
const MIN_OPACITY = 0.6;
const SUBMIT_MIN = { width: 120, height: 44 };
const INPUT_MIN_HEIGHT = 40;
const PAGES = [['login', 'acceso-ingresar.html'], ['register', 'acceso-registro.html']] as const;

type Rgb = [number, number, number];
type Facts = { overflow: boolean; controls: Array<{ name: string; width: number; height: number; hidden: boolean; opacity: number; covered: boolean; color: Rgb; bg: Rgb }> } | null;

/** Everything measured in the page, in one self-contained function (it is serialized into the browser). */
function measureAccountControls(): Facts {
  const root = document.querySelector('[data-account-gate] [data-part=account]');
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
  const opacityChain = (element: Element) => { let value = 1; for (let node: Element | null = element; node && node !== document.documentElement; node = node.parentElement) value *= parseFloat(getComputedStyle(node).opacity || '1'); return value; };
  const isHidden = (element: Element) => { for (let node: Element | null = element; node && node !== document.documentElement; node = node.parentElement) { const s = getComputedStyle(node); if (s.display === 'none' || s.visibility === 'hidden') return true; } return false; };
  const sample = (name: string, element: Element) => {
    (element as HTMLElement).scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = element.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1);
    const top = document.elementFromPoint(x, y);
    const c = rgba(getComputedStyle(element).color);
    return { name, width: rect.width, height: rect.height, hidden: isHidden(element) || rect.width === 0 || rect.height === 0, opacity: opacityChain(element), covered: !top || !(top === element || element.contains(top)), color: [c[0], c[1], c[2]] as Rgb, bg: background(element) };
  };
  const controls: NonNullable<Facts>['controls'] = [];
  root.querySelectorAll('[data-part=input]').forEach(element => controls.push(sample('input', element)));
  for (const name of ['submit', 'error'] as const) { const element = root.querySelector(`[data-part=${name}]`); if (element) controls.push(sample(name, element)); }
  root.querySelectorAll('a[data-part=link]').forEach(element => controls.push(sample('link', element)));
  return { overflow: document.documentElement.scrollWidth > innerWidth + 1, controls };
}

async function checkAccountPage(page: Page): Promise<ThemeCheckFailure[]> {
  const failures: ThemeCheckFailure[] = [];
  for (const [viewport, width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const facts = await page.evaluate(measureAccountControls) as Facts;
    const add = (control: string, reason: string) => { if (!failures.some(f => f.control === control && f.viewport === viewport && f.reason === reason)) failures.push({ control, viewport, reason }); };
    if (!facts) { add('page', 'the account form did not render'); continue; }
    if (facts.overflow) add('page', 'horizontal overflow: the page scrolls sideways');
    for (const control of facts.controls) {
      if (control.hidden) { add(control.name, 'hidden or zero-sized'); continue; }
      if (control.opacity < MIN_OPACITY) add(control.name, `too transparent (opacity ${Math.round(control.opacity * 100) / 100})`);
      if (control.covered) add(control.name, 'covered by another element');
      if (control.name === 'submit' && (control.width < SUBMIT_MIN.width || control.height < SUBMIT_MIN.height)) add('submit', `too small (${Math.round(control.width)}x${Math.round(control.height)}px, needs ${SUBMIT_MIN.width}x${SUBMIT_MIN.height})`);
      if (control.name === 'input' && control.height < INPUT_MIN_HEIGHT) add('input', `too small (${Math.round(control.height)}px tall, needs ${INPUT_MIN_HEIGHT})`);
      if (control.name === 'submit') {
        const ratio = contrastRatio(control.color, control.bg);
        if (ratio < MIN_BUY_CONTRAST) add('submit', `text contrast ${Math.round(ratio * 100) / 100}:1 (needs ${MIN_BUY_CONTRAST}:1)`);
      }
    }
  }
  return failures;
}

/** The sign-in and sign-up pages of a whole store snapshot, in the shared visual sandbox (no network, no model). A store
 * without those page files is checked on its home page with an account slot added, so its own styles still apply. */
export async function checkAccountThemeOnSnapshot(snapshot: SourceProjectSnapshot, options: { signal?: AbortSignal } = {}): Promise<ThemeCheckFailure[]> {
  const runtime = await currentSourceRuntime(snapshot);
  const files = [...runtime.files];
  for (const [view, path] of PAGES) {
    if (files.some(file => file.path === path)) continue;
    const home = files.find(file => file.path === 'index.html');
    if (!home) return [{ control: 'page', viewport: 'desktop', reason: 'the store has no page to check the account form on' }];
    files.push({ ...home, path, content: home.content.replace(/<body([^>]*)>/i, `<body$1><main class="ui-account-gate" data-account-gate="${view}"><div class="ui-container"></div></main>`) });
  }
  return withVisualSandbox({ ...runtime, files }, '', options.signal, true, async context => {
    const failures: ThemeCheckFailure[] = [];
    for (const [, path] of PAGES) {
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      try {
        // The trusted parent's answer, stood in for: a signed-out shopper.
        await page.addInitScript(() => { (window as any).PAGOSYA_ACCOUNT_REQUEST = async () => ({ ok: true, body: { signedIn: false } }); });
        await page.goto(`${origin}/${path}`, { waitUntil: 'load', timeout: 10000 });
        await page.waitForSelector('[data-account-gate] [data-part=form]', { timeout: 5000 });
        await page.evaluate(() => { document.querySelectorAll('[data-account-gate] [data-part=error]').forEach(element => { element.textContent = 'Mensaje de prueba'; }); });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        for (const failure of await checkAccountPage(page)) if (!failures.some(f => f.control === failure.control && f.viewport === failure.viewport && f.reason === failure.reason)) failures.push(failure);
      } catch (error) {
        failures.push({ control: 'page', viewport: 'desktop', reason: `the account form did not render: ${(error as Error).message.slice(0, 160)}` });
      } finally { await page.close(); }
    }
    return failures;
  });
}
