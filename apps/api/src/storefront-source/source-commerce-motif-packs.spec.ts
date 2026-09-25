jest.setTimeout(90_000);
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';
import { fixturePack } from './fixtures/motif-pack';
import { LAMP_SVG } from './fixtures/motifs';
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
    expect(galleta.querySelector('.pagosya-motif').dataset.motifBehavior).toBe('glow');
    expect(hueso.querySelector('.pagosya-motif').dataset.motifBehavior).toBe('bounce');
  });

  it('uses one pack of at most 8 placements, each placement once', async () => {
    const pack = fixturePack();
    const { $$, tick } = boot({ pack: { id: pack.id, motifs: [...pack.motifs, ...pack.motifs.map(motif => ({ ...motif, behavior: 'spin' }))] } });
    await tick();
    expect($$('.menu-item .pagosya-motif').map((holder: any) => holder.dataset.motifBehavior)).toEqual(['bounce', 'bounce']);
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
