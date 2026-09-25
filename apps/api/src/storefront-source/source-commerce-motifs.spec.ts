jest.setTimeout(90_000);
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { sourceMotifConfig, sourceMotifPaths } from './source-motifs';
import { MOTIF_SVG_ATTRIBUTES, MOTIF_SVG_ELEMENTS } from './source-svg-sanitize';
import { LAMP_SVG } from './fixtures/motifs';
import type { SourceDnaMotif } from './source-dna';

/** Sub-project 3: the kit places DNA motifs in its own slots and animates their labelled parts. jsdom pins the markup,
 * the triggers and the gates; Chromium measures the slot and the running animation. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const ITEMS = [
  { id: 'lamp', name: 'Lámpara Luna', amount: 42000, currency: 'BOB', stock: 5, imageUrls: [], categoryId: 'luz' },
  { id: 'desk', name: 'Mesa de roble', amount: 90000, currency: 'BOB', stock: 5, imageUrls: [], categoryId: 'muebles' },
];
const CATEGORIES = [{ id: 'luz', name: 'Iluminación' }, { id: 'muebles', name: 'Muebles' }];
const motif = (overrides: Partial<SourceDnaMotif>): SourceDnaMotif => ({ for: 'product', target: 'lámpara', meaning: 'La lámpara se enciende', behavior: 'glow', trigger: 'hover', placement: 'product', ...overrides });
/** The config.js entries the API writes for these DNA motifs. */
const runtime = (...motifs: SourceDnaMotif[]) => sourceMotifConfig(motifs, sourceMotifPaths(motifs).map(path => ({ path, content: LAMP_SVG })));
const CATALOG = '<header><button data-cart-open>Pedido (<span data-cart-count>0</span>)</button></header><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>';
const PRODUCT = '<main data-pagosya-product-page></main><section data-pagosya-cart></section><p data-pagosya-status></p>';

type Boot = { w: any; doc: any };
const opened: any[] = [];
afterEach(() => { while (opened.length) opened.pop()!.close(); });
function boot(options: { motifs?: unknown; body?: string; query?: string; reduced?: boolean; hover?: boolean; settings?: Record<string, unknown>; items?: unknown[] } = {}): Boot {
  const dom = new JSDOM(`<html><head></head><body>${options.body ?? CATALOG}</body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = (query: string) => ({ matches: /reduce/.test(query) ? !!options.reduced : /hover/.test(query) ? options.hover !== false : false, addEventListener() {}, removeEventListener() {} });
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_QUERY = options.query ?? '';
  const data = { storeName: 'Luz', items: options.items ?? ITEMS, categories: CATEGORIES };
  w.PAGOSYA_CONFIG = { slug: 'luz', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, dna: { version: 1, motion: 'calm' }, ...(options.motifs !== undefined ? { motifs: options.motifs } : {}), ...options.settings };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  opened.push(w);
  return { w, doc: w.document };
}

describe('a store without motifs', () => {
  it('renders exactly as before: no motif style, slot or attribute', () => {
    for (const options of [{}, { body: PRODUCT, query: '?id=lamp' }, { motifs: [] }, { motifs: 'lamp' }]) {
      const { doc } = boot(options);
      expect(doc.querySelector('style[data-pagosya-kit="motifs"]')).toBeNull();
      expect(doc.querySelector('.pagosya-motif')).toBeNull();
      expect(doc.documentElement.outerHTML).not.toContain('motif');
    }
  });
});

describe('motif slots', () => {
  it('places a product motif before the title of the matching product page only, hidden from assistive tech', () => {
    const { doc } = boot({ body: PRODUCT, query: '?id=lamp', motifs: runtime(motif({})) });
    const slot = doc.querySelector('.pagosya-motif');
    expect(slot).not.toBeNull();
    expect(slot.dataset.motifSlot).toBe('product');
    expect(slot.getAttribute('aria-hidden')).toBe('true');
    expect(slot.nextElementSibling.id).toBe('pagosya-product-title');
    expect(slot.querySelector('svg [data-part="light"]')).not.toBeNull();
    expect(doc.querySelector('style[data-pagosya-kit="motifs"]')).not.toBeNull();
    expect(boot({ body: PRODUCT, query: '?id=desk', motifs: runtime(motif({})) }).doc.querySelector('.pagosya-motif')).toBeNull();
  });
  it('marks only the cards of a matching category, and a store-wide motif matches every card', () => {
    const byCategory = boot({ motifs: runtime(motif({ for: 'category', target: 'Iluminación', placement: 'card', trigger: 'appear' })) }).doc;
    const cards = [...byCategory.querySelectorAll('.menu-item')];
    expect(cards.map((card: any) => !!card.querySelector('.pagosya-motif[data-motif-slot="card"]'))).toEqual([true, false]);
    const everywhere = boot({ motifs: runtime(motif({ for: 'store', target: 'Luz', placement: 'card', trigger: 'appear' })) }).doc;
    expect(everywhere.querySelectorAll('.menu-item .pagosya-motif')).toHaveLength(2);
  });
  it('matches a product by whole words of its name or category, accent-insensitive, never inside another word', () => {
    const item = (id: string, name: string, categoryId = 'x') => ({ id, name, amount: 1000, currency: 'BOB', stock: 5, imageUrls: [], categoryId });
    const items = [item('choco', 'Chocolate caliente'), item('pastel', 'Pastel'), item('tarta', 'Tarta'), item('verde', 'TÉ VERDE'), item('infusion', 'Infusión de té'), item('empanada', 'Empanada'), item('panes', 'Panes caseros'), item('pan', 'Pan de maíz'), item('lamp', 'Lámpara de mesa'), item('lamps', 'Lamparas colgantes'), item('mesa', 'Mesa', 'luz')];
    const marked = (target: string) => {
      const { doc } = boot({ items, motifs: runtime(motif({ target, placement: 'card', trigger: 'appear' })) });
      return [...doc.querySelectorAll('.menu-item')].filter((card: any) => card.querySelector('.pagosya-motif')).map((card: any) => card.querySelector('[data-add],[data-product]')?.dataset.add ?? card.querySelector('[data-add],[data-product]')?.dataset.product);
    };
    expect(marked('té')).toEqual(['verde', 'infusion']);
    expect(marked('pan')).toEqual(['panes', 'pan']);
    expect(marked('lámpara')).toEqual(['lamp', 'lamps']);
    expect(marked('de mesa')).toEqual(['lamp']);
    // A category name matches by whole words too ('Iluminación' holds the Mesa product).
    expect(marked('iluminacion')).toEqual(['mesa']);
    expect(marked('ilumina')).toEqual([]);
  });
  it('puts a cart motif in the cart header', () => {
    const { doc } = boot({ motifs: runtime(motif({ placement: 'cart', trigger: 'add-to-cart' })) });
    expect(doc.querySelector('.cart-drawer__header .pagosya-motif[data-motif-slot="cart"]')).not.toBeNull();
  });
  it('skips markup that fails the allow-list and never inserts it', () => {
    const [entry] = runtime(motif({}));
    const hostile = [{ ...entry, svg: entry.svg.replace('<title>', '<script>window.pwned=1</script><title>') }, { ...entry, svg: '<img src=x onerror="window.pwned=1">' }, { ...entry, svg: entry.svg.replace('fill="url(#pym-lampara-glow)"', 'fill="url(https://evil.test/a)"') }, { ...entry, behavior: 'explode' }];
    for (const bad of hostile) {
      const { w, doc } = boot({ body: PRODUCT, query: '?id=lamp', motifs: [bad] });
      expect(doc.querySelector('.pagosya-motif')).toBeNull();
      expect(doc.querySelector('script')).toBeNull();
      expect(w.pwned).toBeUndefined();
    }
  });
  it('gives every placed copy its own ids, so each card keeps its own gradient and no id can shadow a page id', () => {
    const { doc } = boot({ motifs: runtime(motif({ for: 'store', target: 'Luz', placement: 'card', trigger: 'appear' })) });
    const svgs = [...doc.querySelectorAll('.menu-item .pagosya-motif svg')];
    expect(svgs).toHaveLength(2);
    const ids = svgs.flatMap((svg: any) => [...svg.querySelectorAll('[id]')].map((el: any) => el.id));
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => id.startsWith('pym-'))).toBe(true);
    for (const svg of svgs as any[]) {
      const refs = [...svg.querySelectorAll('*')].flatMap((el: any) => [...el.attributes].map((attr: any) => attr.value.match(/^url\(#(.+)\)$/)?.[1]).filter(Boolean));
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) expect(svg.querySelector(`[id="${ref}"]`)).not.toBeNull(); // resolves inside its own copy
    }
    // Markup that reached config.js unprefixed (a hand edit the save has not cleaned yet) still cannot take a page id.
    const [entry] = runtime(motif({}));
    const product = boot({ body: PRODUCT, query: '?id=lamp', motifs: [{ ...entry, svg: entry.svg.replace('<path d="M32 26v24"/>', '<path id="pagosya-product-title" d="M32 26v24"/>') }] }).doc;
    expect(product.querySelector('.pagosya-motif svg')).not.toBeNull();
    expect(product.getElementById('pagosya-product-title').namespaceURI).toBe('http://www.w3.org/1999/xhtml');
  });
  it('verifies against exactly the allow-lists the API sanitiser uses', () => {
    const list = (name: string) => runInNewContext(commerce.match(new RegExp(`const ${name} = (\\[[^\\]]*\\]);`))![1]);
    expect(list('MOTIF_ELEMENTS')).toEqual([...MOTIF_SVG_ELEMENTS]);
    expect(list('MOTIF_ATTRIBUTES')).toEqual([...MOTIF_SVG_ATTRIBUTES]);
    // The checkout's order confirmation verifies with the same lists.
    const checkout = readFileSync(join(__dirname, '../../../checkout/src/checkout-motif.ts'), 'utf8');
    const checkoutList = (name: string) => runInNewContext(checkout.match(new RegExp(`const ${name} = (\\[[^\\]]*\\]);`))![1]);
    expect(checkoutList('MOTIF_ELEMENTS')).toEqual([...MOTIF_SVG_ELEMENTS]);
    expect(checkoutList('MOTIF_ATTRIBUTES')).toEqual([...MOTIF_SVG_ATTRIBUTES]);
  });
});

describe('motif triggers', () => {
  const played = (doc: any) => doc.querySelector('.pagosya-motif')?.hasAttribute('data-motif-play');
  it('plays an add-to-cart motif after that product is added, not before', () => {
    const { doc } = boot({ body: PRODUCT, query: '?id=lamp', motifs: runtime(motif({ trigger: 'add-to-cart' })) });
    expect(played(doc)).toBe(false);
    doc.querySelector('.product-detail__buy[data-add]').click();
    expect(played(doc)).toBe(true);
  });
  it('plays a hover motif when the pointer or focus reaches the product', () => {
    const { w, doc } = boot({ body: PRODUCT, query: '?id=lamp', motifs: runtime(motif({})) });
    expect(played(doc)).toBe(false);
    doc.querySelector('.product-detail__layout').dispatchEvent(new w.Event('pointerenter'));
    expect(played(doc)).toBe(true);
  });
  it('never plays with reduced motion or with motion off', () => {
    for (const options of [{ reduced: true }, { settings: { motion: 'off' } }]) {
      const { w, doc } = boot({ body: PRODUCT, query: '?id=lamp', motifs: runtime(motif({ trigger: 'add-to-cart' })), ...options });
      doc.querySelector('.product-detail__layout').dispatchEvent(new w.Event('pointerenter'));
      doc.querySelector('.product-detail__buy[data-add]').click();
      expect(doc.querySelector('.pagosya-motif')).not.toBeNull();
      expect(played(doc)).toBe(false);
    }
  });
  it('caps every slot at 64px and switches animation off for reduced motion in its own CSS', () => {
    const css = boot({ body: PRODUCT, query: '?id=lamp', motifs: runtime(motif({})) }).doc.querySelector('style[data-pagosya-kit="motifs"]').textContent;
    expect(css).toMatch(/\.pagosya-motif\{[^}]*max-width:64px!important[^}]*max-height:64px!important/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.pagosya-motif[^{]*\{animation:none!important/);
    for (const behavior of ['glow', 'draw', 'sway', 'steam', 'grow', 'bounce', 'spin', 'float']) expect(css).toContain(`@keyframes pagosya-motif-${behavior}`);
    expect(css).toContain('var(--pagosya-motif-ms');
  });
});

describe('motifs in a real browser', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
  afterAll(async () => { await browser?.close(); });
  async function open(options: { motifs: unknown; body?: string; query?: string; css?: string; reduced?: boolean }): Promise<Page> {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
    const config = { slug: 'luz', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, data: { storeName: 'Luz', items: ITEMS, categories: CATEGORIES }, dna: { version: 1, motion: 'calm' }, motifs: options.motifs };
    await page.setContent(`<!doctype html><html lang="es"><head><style>${options.css ?? ''}</style></head><body>${options.body ?? CATALOG}</body></html>`);
    await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_PREVIEW_QUERY=${JSON.stringify(options.query ?? '')};window.PAGOSYA_CONFIG=${JSON.stringify(config)};` });
    await page.addScriptTag({ content: commerce });
    return page;
  }
  const size = (page: Page, selector: string) => page.$eval(selector, el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; });
  const lightAnimations = (page: Page) => page.$eval('.pagosya-motif svg', svg => [svg, ...Array.from(svg.querySelectorAll('[data-part="light"]'))].reduce((count, el) => count + el.getAnimations().length, 0));

  it('keeps the product slot within 64px even when the store CSS tries to enlarge it', async () => {
    const page = await open({ motifs: runtime(motif({})), body: PRODUCT, query: '?id=lamp', css: '.pagosya-motif,.pagosya-motif svg{width:300px!important;height:300px!important}' });
    try {
      await page.waitForSelector('.pagosya-motif svg');
      const [width, height] = await size(page, '.pagosya-motif');
      expect(width).toBeGreaterThan(0);
      expect(Math.max(width, height)).toBeLessThanOrEqual(64);
      expect(Math.max(...await size(page, '.pagosya-motif svg'))).toBeLessThanOrEqual(64);
    } finally { await page.close(); }
  });
  it('glows the lamp on hover, and does nothing with reduced motion', async () => {
    for (const reduced of [false, true]) {
      const page = await open({ motifs: runtime(motif({})), body: PRODUCT, query: '?id=lamp', reduced });
      try {
        await page.waitForSelector('.pagosya-motif svg');
        expect(await lightAnimations(page)).toBe(0);
        await page.hover('.product-detail__layout #pagosya-product-title');
        await page.waitForTimeout(80);
        if (reduced) expect(await lightAnimations(page)).toBe(0);
        else expect(await lightAnimations(page)).toBeGreaterThan(0);
      } finally { await page.close(); }
    }
  });
  it('removes a card motif that would cover the price or the add button', async () => {
    const motifs = runtime(motif({ placement: 'card', trigger: 'appear' }));
    const clear = await open({ motifs });
    const covered = await open({ motifs, css: '.menu-item{min-height:200px}.menu-item__price{position:absolute;top:0;right:0;width:120px;height:60px}' });
    try {
      await clear.waitForSelector('.menu-item');
      await covered.waitForSelector('.menu-item');
      await Promise.all([clear.waitForTimeout(120), covered.waitForTimeout(120)]);
      expect(await clear.$$eval('.menu-item .pagosya-motif', els => els.length)).toBe(1);
      expect(await covered.$$eval('.menu-item .pagosya-motif', els => els.length)).toBe(0);
    } finally { await clear.close(); await covered.close(); }
    // A card the store made static would anchor the corner somewhere else on the page: no motif rather than a stray one.
    const stray = await open({ motifs, css: '[data-pagosya-catalog] .menu-item{position:static!important}' });
    try {
      await stray.waitForSelector('.menu-item');
      await stray.waitForTimeout(120);
      expect(await stray.$$eval('.pagosya-motif', els => els.length)).toBe(0);
    } finally { await stray.close(); }
  });
});
