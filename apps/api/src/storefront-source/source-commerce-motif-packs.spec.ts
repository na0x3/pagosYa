jest.setTimeout(90_000);
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { fixturePack } from './fixtures/motif-pack';
import { LAMP_SVG } from './fixtures/motifs';
import { contrastRatio } from './source-scorecard';
import { sourceMotifConfig, sourceMotifPaths } from './source-motifs';
import type { SourceDnaMotif } from './source-dna';

/** Identity libraries T2a: a drawn motif pack in the kit's slots. jsdom pins markup, guards and triggers; Chromium (later
 * describes in this file) measures what needs layout. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const ITEMS = [
  { id: 'galleta', name: 'Galletas de pollo', amount: 3590, currency: 'BOB', stock: 9, imageUrls: [], categoryId: 'snacks' },
  { id: 'hueso', name: 'Hueso de cuero', amount: 2500, currency: 'BOB', stock: 9, imageUrls: [], categoryId: 'snacks' },
];
const CATALOG = '<header><button data-cart-open>Pedido (<span data-cart-count>0</span>)</button></header><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>';
const PRODUCT = '<main data-pagosya-product-page></main><section data-pagosya-cart></section><p data-pagosya-status></p>';
const own = (...motifs: SourceDnaMotif[]) => sourceMotifConfig(motifs, sourceMotifPaths(motifs).map(path => ({ path, content: LAMP_SVG })));
const opened: any[] = [];
afterEach(() => { while (opened.length) opened.pop().close(); });
let browser: Browser | undefined;
const chrome = async () => (browser ??= await chromium.launch({ headless: true }));
afterAll(async () => { await browser?.close(); });
async function openShop(options: { pack?: unknown; css?: string; body?: string; query?: string; width?: number; dna?: Record<string, unknown>; reduced?: boolean; cart?: unknown[] }): Promise<Page> {
  const page = await (await chrome()).newPage({ viewport: { width: options.width ?? 1280, height: 800 }, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  const config = { slug: 'huellitas', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, data: { storeName: 'Huellitas', items: ITEMS, categories: [{ id: 'snacks', name: 'Snacks' }] },
    dna: options.dna ?? { version: 1, motion: 'calm' }, ...(options.pack ? { motifPack: options.pack } : {}) };
  await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${options.css ?? ''}</style></head><body>${options.body ?? CATALOG}</body></html>`);
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_PREVIEW_QUERY=${JSON.stringify(options.query ?? '')};${options.cart ? `window.PAGOSYA_PREVIEW_CART=${JSON.stringify(options.cart)};` : ''}window.PAGOSYA_CONFIG=${JSON.stringify(config)};` });
  await page.addScriptTag({ content: commerce });
  return page;
}

function boot(options: { pack?: unknown; motifs?: unknown; body?: string; query?: string; cart?: unknown[]; reduced?: boolean; settings?: Record<string, unknown> } = {}) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(`<html><head></head><body>${options.body ?? CATALOG}</body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window; opened.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = (query: string) => ({ matches: /reduce/.test(query) ? !!options.reduced : /hover/.test(query), addEventListener() {}, removeEventListener() {} });
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_QUERY = options.query ?? '';
  if (options.cart) w.PAGOSYA_PREVIEW_CART = options.cart;
  const data = { storeName: 'Huellitas', items: ITEMS, categories: [{ id: 'snacks', name: 'Snacks' }] };
  w.PAGOSYA_CONFIG = { slug: 'huellitas', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, dna: { version: 1, motion: 'calm' },
    ...(options.pack !== undefined ? { motifPack: options.pack } : {}), ...(options.motifs !== undefined ? { motifs: options.motifs } : {}), ...options.settings };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  const $ = (selector: string) => w.document.querySelector(selector);
  const $$ = (selector: string) => [...w.document.querySelectorAll(selector)];
  const tick = () => new Promise(resolve => setTimeout(resolve, 30));
  return { w, doc: w.document, $, $$, tick };
}

describe('a store without a motif pack', () => {
  it('renders exactly as before: no pack style, slot or attribute, whatever sits in motifPack', () => {
    const invalid = [undefined, null, 'paws', { id: 'Bad Id', motifs: fixturePack().motifs }, { id: 'paws', motifs: 'x' },
      { id: 'paws', motifs: [{ placement: 'hero', behavior: 'grow', svg: fixturePack().motifs[0].svg }] }];
    for (const pack of invalid) {
      const { doc } = boot({ pack });
      expect(doc.querySelector('style[data-pagosya-kit="motif-pack"]')).toBeNull();
      expect(doc.querySelector('.pagosya-motif')).toBeNull();
      expect(doc.documentElement.outerHTML).not.toContain('motif');
    }
  });
});

describe('pack placements the kit already had: product, card, cart', () => {
  it('marks every card, the product title and the cart header, hidden from assistive tech', async () => {
    const catalog = boot({ pack: fixturePack() });
    await catalog.tick();
    expect(catalog.$$('.menu-item .pagosya-motif[data-motif-slot="card"]')).toHaveLength(2);
    expect(catalog.$('.cart-drawer__header .pagosya-motif[data-motif-slot="cart"]')).not.toBeNull();
    expect(catalog.$('style[data-pagosya-kit="motif-pack"]')).not.toBeNull();
    const product = boot({ pack: fixturePack(), body: PRODUCT, query: '?id=hueso' });
    const slot = product.$('.pagosya-motif[data-motif-slot="product"]');
    expect(slot.nextElementSibling.id).toBe('pagosya-product-title');
    for (const holder of [...catalog.$$('.pagosya-motif'), slot]) expect(holder.getAttribute('aria-hidden')).toBe('true');
  });

  it('lets a store\'s own targeted motif keep the card it matches, and the pack fill the rest', async () => {
    const { $$, tick } = boot({ pack: fixturePack(), motifs: own({ for: 'product', target: 'galletas', meaning: 'm', behavior: 'glow', trigger: 'hover', placement: 'card' }) });
    await tick();
    const [galleta, hueso] = $$('.menu-item');
    expect(galleta.querySelector('.pagosya-motif[data-motif-slot="card"]').dataset.motifBehavior).toBe('glow');
    expect(hueso.querySelector('.pagosya-motif[data-motif-slot="card"]').dataset.motifBehavior).toBe('bounce');
  });

  it('uses one pack of at most 8 placements, each placement once', async () => {
    const pack = fixturePack();
    const { $$, tick } = boot({ pack: { id: pack.id, motifs: [...pack.motifs, ...pack.motifs.map(motif => ({ ...motif, behavior: 'spin' }))] } });
    await tick();
    expect($$('.menu-item .pagosya-motif[data-motif-slot="card"]').map((holder: any) => holder.dataset.motifBehavior)).toEqual(['bounce', 'bounce']);
  });

  it('never inserts a hostile pack drawing: script, foreignObject, external href, handler, external url()', async () => {
    const base = fixturePack(['card']).motifs[0];
    const hostile = [
      base.svg.replace('</svg>', '<script>window.pwned=1</script></svg>'),
      base.svg.replace('</svg>', '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>'),
      base.svg.replace('</svg>', '<image href="https://evil.test/x.png" width="4" height="4"/></svg>'),
      base.svg.replace('<circle', '<circle onclick="window.pwned=1"'),
      base.svg.replace('stroke="currentColor"', 'stroke="url(https://evil.test/a)"'),
    ];
    for (const svg of hostile) {
      const { w, doc, tick } = boot({ pack: { id: 'paws', motifs: [{ ...base, svg }] } });
      await tick();
      expect(doc.querySelector('.pagosya-motif')).toBeNull();
      expect(doc.querySelector('script')).toBeNull();
      expect(doc.body.innerHTML).not.toMatch(/foreignObject|evil\.test/);
      expect(w.pwned).toBeUndefined();
    }
  });
});

const CART_TEMPLATE = (empty: string) => `<template data-pagosya-cart-template><div class="canasta"><button data-cart-close>Cerrar</button><div data-cart-slot="lines"></div><div data-cart-slot="total"></div><div data-cart-slot="action"></div><div data-cart-slot="empty">${empty}</div></div></template>`;

describe('the empty placement', () => {
  it('draws the kit\'s empty cart, hidden from assistive tech, and leaves once something is in the cart', async () => {
    const shop = boot({ pack: fixturePack() });
    await shop.tick();
    const holder = shop.$('li.order-empty > .pagosya-motif[data-motif-slot="empty"]');
    expect(holder).not.toBeNull();
    expect(holder.getAttribute('aria-hidden')).toBe('true');
    expect(holder.querySelector('svg [data-part="steam"]')).not.toBeNull();
    shop.$('.menu-add[data-add="galleta"]').click();
    expect(shop.$('.pagosya-motif[data-motif-slot="empty"]')).toBeNull();
  });

  it('fills a cart template only where it asks (data-motif-empty in its empty slot)', async () => {
    const asks = boot({ pack: fixturePack(), body: CATALOG + CART_TEMPLATE('<div data-motif-empty></div><p>Tu canasta espera</p>') });
    await asks.tick();
    expect(asks.$('[data-cart-panel] [data-cart-slot="empty"] [data-motif-empty] > .pagosya-motif[data-motif-slot="empty"]')).not.toBeNull();
    const silent = boot({ pack: fixturePack(), body: CATALOG + CART_TEMPLATE('<p>Tu canasta espera</p>') });
    await silent.tick();
    expect(silent.$$('[data-cart-panel] [data-cart-slot="empty"] .pagosya-motif')).toHaveLength(0);
  });

  it('never plays with reduced motion or with motion off', async () => {
    for (const options of [{ reduced: true }, { settings: { motion: 'off' } }]) {
      const shop = boot({ pack: fixturePack(), ...options });
      await shop.tick();
      expect(shop.$('.pagosya-motif[data-motif-slot="empty"]')).not.toBeNull();
      expect(shop.$$('.pagosya-motif[data-motif-play]')).toHaveLength(0);
    }
  });
});

describe('the button placement and the data-motif-icon slot', () => {
  it('puts the pack icon first in the add and buy buttons, beside the label and outside the price', async () => {
    const product = boot({ pack: fixturePack(), body: PRODUCT, query: '?id=galleta' });
    const buy = product.$('.product-detail__buy');
    const slot = buy.firstElementChild;
    expect(slot.getAttribute('data-motif-icon')).toBe('placed');
    expect(slot.getAttribute('aria-hidden')).toBe('true');
    expect(slot.querySelector('.pagosya-motif[data-motif-slot="button"] svg')).not.toBeNull();
    expect(buy.textContent).toContain('Añadir al pedido');
    expect(buy.querySelector('.product-detail__buy-total .pagosya-motif')).toBeNull();
    const catalog = boot({ pack: fixturePack() });
    await catalog.tick();
    expect(catalog.$$('.menu-add > [data-motif-icon="placed"] .pagosya-motif')).toHaveLength(2);
  });

  it('never decorates the cart\'s checkout or pay button', async () => {
    const shop = boot({ pack: fixturePack(), cart: [{ id: 'galleta', quantity: 1 }] });
    await shop.tick();
    shop.$('[data-cart-open]').click();
    await shop.tick();
    expect(shop.$$('.checkout-button').length).toBeGreaterThan(0);
    expect(shop.$$('.checkout-button:not(.product-detail__buy) .pagosya-motif')).toHaveLength(0);
  });

  it('fills a store\'s own slot, skips one inside a <template>, and fills one the store\'s scripts add later', async () => {
    const shop = boot({ pack: fixturePack(), body: CATALOG + '<a class="cta" href="#catalogo">Ver snacks <span data-motif-icon></span></a>' });
    expect(shop.$('.cta [data-motif-icon="placed"] .pagosya-motif')).not.toBeNull();
    const fresh = shop.doc.createElement('a');
    fresh.className = 'cta2'; fresh.innerHTML = 'Comprar <span data-motif-icon></span>';
    shop.doc.body.append(fresh);
    // React puts a <template>'s children on the element itself: they sit in the document but must stay untouched.
    const template = shop.doc.createElement('template'), inner = shop.doc.createElement('span');
    inner.setAttribute('data-motif-icon', ''); template.appendChild(inner); shop.doc.body.append(template);
    await shop.tick();
    expect(shop.$('.cta2 [data-motif-icon="placed"] .pagosya-motif')).not.toBeNull();
    expect(inner.getAttribute('data-motif-icon')).toBe('');
    expect(inner.childNodes).toHaveLength(0);
  });

  it('leaves a store\'s slot empty, with no pack style, when there is no pack button drawing', () => {
    for (const pack of [undefined, fixturePack(['card', 'empty'])]) {
      const shop = boot({ pack, body: CATALOG + '<a class="cta" href="#">Ver <span data-motif-icon></span></a>' });
      expect(shop.$('.cta [data-motif-icon]').getAttribute('data-motif-icon')).toBe('');
      expect(shop.$('.cta [data-motif-icon]').childNodes).toHaveLength(0);
    }
  });

  it('plays on hover and never with reduced motion', async () => {
    for (const reduced of [false, true]) {
      const shop = boot({ pack: fixturePack(), body: PRODUCT, query: '?id=galleta', reduced });
      const buy = shop.$('.product-detail__buy');
      buy.dispatchEvent(new shop.w.Event('pointerenter'));
      expect(buy.querySelector('.pagosya-motif').hasAttribute('data-motif-play')).toBe(!reduced);
    }
  });
});

describe('button icons in a real browser', () => {
  it('removes the icon from a narrow phone button whose label it would wrap, and keeps it on a roomy one', async () => {
    const body = CATALOG + '<p><button class="narrow" type="button">Comprar ahora<span data-motif-icon></span></button></p><p><button class="wide" type="button">Comprar ahora <span data-motif-icon></span></button></p>';
    // Monospace: 13ch is exactly the label, so the label fits alone and the icon (1.15em + gap) cannot.
    const css = 'body{margin:8px} button{font:16px/1.25 monospace;padding:6px 8px;box-sizing:border-box} .narrow{width:calc(13ch + 20px)}';
    const page = await openShop({ pack: fixturePack(), body, css, width: 320 });
    try {
      await page.waitForSelector('.wide [data-motif-icon="placed"] svg');
      await page.waitForFunction(() => document.querySelector('.narrow [data-motif-icon]')?.getAttribute('data-motif-icon') === 'removed');
      expect(await page.$('.narrow .pagosya-motif')).toBeNull();
      // Back on one line: as tall as the roomy button that kept its icon.
      const [narrow, wide] = await Promise.all(['.narrow', '.wide'].map(selector => page.$eval(selector, el => el.getBoundingClientRect().height)));
      expect(Math.abs(narrow - wide)).toBeLessThan(3);
      expect(await page.$('.wide .pagosya-motif')).not.toBeNull();
    } finally { await page.close(); }
  });

  it('removes the icon from a small fixed round add button it would overflow', async () => {
    const css = '[data-pagosya-catalog] .menu-add{display:inline-flex!important;align-items:center;justify-content:center;width:36px!important;height:36px!important;min-height:0!important;padding:0!important;overflow:hidden}';
    const page = await openShop({ pack: fixturePack(), css, width: 390 });
    try {
      await page.waitForSelector('.menu-add');
      await page.waitForTimeout(120);
      expect(await page.$$eval('.menu-add .pagosya-motif', els => els.length)).toBe(0);
    } finally { await page.close(); }
  });

  it('keeps the buy button\'s label on one line with the icon and never over its total', async () => {
    const page = await openShop({ pack: fixturePack(), body: PRODUCT, query: '?id=galleta', width: 390 });
    try {
      await page.waitForSelector('[data-pagosya-product] .product-detail__buy [data-motif-icon="placed"] svg');
      await page.waitForTimeout(120);
      const facts = await page.$eval('[data-pagosya-product] .product-detail__buy', buy => {
        const icon = buy.querySelector('.pagosya-motif')!.getBoundingClientRect(), total = buy.querySelector('.product-detail__buy-total')?.getBoundingClientRect();
        return { height: buy.getBoundingClientRect().height, overlaps: !!total && total.width > 0 && total.left < icon.right && total.right > icon.left && total.top < icon.bottom && total.bottom > icon.top };
      });
      expect(facts.overlaps).toBe(false);
      expect(facts.height).toBeLessThan(64);
    } finally { await page.close(); }
  });
});

const HERO = (style: string, extra = '') => `${CATALOG}<section class="hero" data-motif-pattern style="${style}"><h2>Horneados cada mañana</h2><p>Snacks sin conservantes para perros felices.</p>${extra}</section>`;

describe('the pattern placement', () => {
  it('tiles a marked section with the pack pattern in its own text colour, and never the catalog', () => {
    const shop = boot({ pack: fixturePack(), body: HERO('background:#fbf6ee;color:#2a1d12').replace('<section data-pagosya-catalog>', '<section data-pagosya-catalog data-motif-pattern>') });
    const hero = shop.$('.hero');
    expect(hero.getAttribute('data-motif-pattern')).toBe('placed');
    const alpha = Number(hero.getAttribute('data-motif-pattern-alpha'));
    expect(alpha).toBeGreaterThanOrEqual(.04);
    expect(alpha).toBeLessThanOrEqual(.12);
    const url = hero.style.getPropertyValue('--pagosya-pattern');
    expect(url).toMatch(/^url\("data:image\/svg\+xml,/);
    const drawing = decodeURIComponent(url.slice('url("data:image/svg+xml,'.length, -2));
    expect(drawing).toContain('color="rgb(42,29,18)"');
    expect(drawing).toContain(`opacity="${alpha}"`);
    expect(drawing).not.toMatch(/<script|href/);
    expect(shop.$('[data-pagosya-catalog]').getAttribute('data-motif-pattern')).toBe('');
    expect(shop.$('[data-pagosya-catalog]').style.getPropertyValue('--pagosya-pattern')).toBe('');
  });

  it('does nothing without a pack pattern, and skips a section that holds the catalog', () => {
    expect(boot({ pack: fixturePack(['card']), body: HERO('background:#fff;color:#222') }).$('.hero').getAttribute('data-motif-pattern')).toBe('');
    const wrapped = boot({ pack: fixturePack(), body: '<section class="wrap" data-motif-pattern style="background:#fff;color:#222"><div data-pagosya-catalog></div></section><section data-pagosya-cart></section><p data-pagosya-status></p>' });
    expect(wrapped.$('.wrap').style.getPropertyValue('--pagosya-pattern')).toBe('');
  });
});

describe('the pattern in a real browser', () => {
  async function facts(page: Page) {
    return page.$eval('.hero', section => {
      const rgb = (value: string) => (value.match(/[\d.]+/g) || []).map(Number).slice(0, 3);
      const texts = [section, ...Array.from(section.querySelectorAll('*'))].filter(el => Array.from(el.childNodes).some(node => node.nodeType === 3 && node.textContent!.trim())).map(el => rgb(getComputedStyle(el).color));
      return { state: section.getAttribute('data-motif-pattern'), alpha: Number(section.getAttribute('data-motif-pattern-alpha') || 0), image: getComputedStyle(section).backgroundImage, back: rgb(getComputedStyle(section).backgroundColor), ink: rgb(getComputedStyle(section).color), texts, animations: section.getAnimations().length };
    });
  }

  it.each([
    ['a light palette', 'background:#fbf6ee;color:#2a1d12', '<p style="color:#8a3b12">Desde 2019</p>'],
    ['light text on a dark palette', 'background:#151515;color:#f2f2f2', '<p style="color:#f5b041">Desde 2019</p>'],
  ])('keeps the tile under the contrast floor on %s', async (_name, style, extra) => {
    const page = await openShop({ pack: fixturePack(), body: HERO(style, extra), width: 390 });
    try {
      await page.waitForSelector('.hero[data-motif-pattern="placed"]');
      const seen = await facts(page);
      expect(seen.image).toContain('data:image/svg+xml');
      expect(seen.alpha).toBeGreaterThanOrEqual(.04);
      expect(seen.alpha).toBeLessThanOrEqual(.12);
      const tile = seen.back.map((value, i) => value + (seen.ink[i] - value) * seen.alpha);
      expect(contrastRatio(tile, seen.back)).toBeLessThanOrEqual(1.35);
      for (const text of seen.texts) expect(contrastRatio(text, tile)).toBeGreaterThanOrEqual(4.5);
      expect(seen.animations).toBe(0);
    } finally { await page.close(); }
  });

  it.each([
    ['text that is already weak', 'background:#151515;color:#777777'],
    ['a photo background', 'background:#151515 url(data:image/gif;base64,R0lGODlhAQABAAAAACw=);color:#f2f2f2'],
    ['a gradient background', 'background:linear-gradient(#ffffff,#eeeeee);color:#222222'],
  ])('skips a section with %s', async (_name, style) => {
    const page = await openShop({ pack: fixturePack(), body: HERO(style) });
    try {
      await page.waitForSelector('.hero[data-motif-pattern="skipped"]');
      expect((await facts(page)).image).not.toContain('data:image/svg+xml');
    } finally { await page.close(); }
  });
});

describe('the divider and sticker placements', () => {
  const BODY = CATALOG + '<div class="sep" data-motif-divider></div><div class="said" data-motif-divider>Texto</div><hr data-motif-divider><span class="badge" data-motif-sticker>¡Nuevo!</span>';

  it('draws an empty marked divider as a hidden separator, and leaves one with content alone', () => {
    const shop = boot({ pack: fixturePack(), body: BODY });
    const sep = shop.$('.sep');
    expect(sep.getAttribute('data-motif-divider')).toBe('placed');
    expect(sep.getAttribute('aria-hidden')).toBe('true');
    expect(sep.getAttribute('role')).toBe('presentation');
    expect(sep.querySelector('.pagosya-motif[data-motif-slot="divider"] svg')).not.toBeNull();
    expect(shop.$('.said').textContent).toBe('Texto');
    expect(shop.$('.said .pagosya-motif')).toBeNull();
    expect(shop.$('hr').childNodes).toHaveLength(0);
  });

  it('leads a sticker\'s own text with the drawing, once, hidden from assistive tech', async () => {
    const shop = boot({ pack: fixturePack(), body: BODY });
    const badge = shop.$('.badge');
    expect(badge.firstElementChild.matches('.pagosya-motif[data-motif-slot="sticker"][aria-hidden="true"]')).toBe(true);
    expect(badge.textContent.trim()).toBe('¡Nuevo!');
    // A badge the store's scripts add later is placed too, and the first badge is not decorated twice.
    const later = shop.doc.createElement('span');
    later.className = 'later'; later.setAttribute('data-motif-sticker', ''); later.textContent = 'Oferta';
    shop.doc.body.append(later);
    await shop.tick();
    expect(later.querySelector('.pagosya-motif[data-motif-slot="sticker"]')).not.toBeNull();
    expect(badge.querySelectorAll('.pagosya-motif')).toHaveLength(1);
  });

  it('does nothing without the pack drawings, and never plays with reduced motion', () => {
    const bare = boot({ pack: fixturePack(['card']), body: BODY });
    expect(bare.$('.sep').getAttribute('data-motif-divider')).toBe('');
    expect(bare.$('.badge .pagosya-motif')).toBeNull();
    const calm = boot({ pack: fixturePack(), body: BODY, reduced: true });
    expect(calm.$$('.pagosya-motif[data-motif-play]')).toHaveLength(0);
  });

  it('takes a sticker drawing off a price it would cover (real browser)', async () => {
    const body = CATALOG + '<div style="position:relative;height:80px"><strong class="menu-item__price" style="position:absolute;top:0;left:0;width:140px;height:40px">Bs 35,90</strong><span data-motif-sticker style="position:absolute;top:0;left:0">¡Nuevo!</span></div>';
    const page = await openShop({ pack: fixturePack(), body });
    try {
      await page.waitForSelector('[data-motif-sticker="placed"]');
      await page.waitForTimeout(120);
      expect(await page.$$eval('[data-motif-sticker] .pagosya-motif', els => els.length)).toBe(0);
    } finally { await page.close(); }
  });
});
