jest.setTimeout(180_000);

import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import { captureHeaderCovers, headerCoverProblems, introducedHeaderCovers, type HeaderCover } from './header-clickable';
import { sourceProjectSnapshot } from '../source-project';

const brief = { businessType: 'Test', audience: 'Test', primaryAction: 'Comprar', visualDirection: 'Simple' };
const config = 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ slug: 'test', apiBaseUrl: 'https://preview.invalid', checkoutOrigin: 'https://preview.invalid', productPage: 'product.html', checkoutPage: 'checkout.html', demo: true, data: { storeName: 'Test', items: [] } }) + ';';
const store = async (body: string, css: string) => sourceProjectSnapshot({ revision: 1, label: 'Draft', brief, files: [
  { path: 'commerce.js', content: await readFile(kitPath('commerce.js'), 'utf8') },
  { path: 'config.js', content: config },
  { path: 'styles.css', content: css },
  { path: 'package.json', content: '{"name":"test","scripts":{"build":"node build.mjs"}}' }, { path: 'README.md', content: '# Test' },
  { path: 'index.html', content: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css">${body}<aside data-pagosya-cart></aside><p data-pagosya-status></p><script src="config.js" defer></script><script src="commerce.js" defer></script>` },
] });

const controls = '<a href="index.html" class="logo">Ramo</a><nav class="tools"><a href="buscar.html">Buscar</a><a href="#" data-pagosya-account="login">Mi cuenta</a><button type="button" data-cart-open>Tu ramo <span data-cart-count>0</span></button></nav>';
const cards = Array.from({ length: 6 }, (_, i) => `<div class="card"><div class="card-photo">Ramo ${i + 1}</div></div>`).join('');
// The header hides while the shopper scrolls down and comes back on the way up, as Ramo Ramón's site.js does.
const hideOnScroll = '<script>let last=0;addEventListener("scroll",()=>{const h=document.querySelector(".site-header");h.style.transform=scrollY>last&&scrollY>80?"translateY(-100%)":"";last=scrollY;},{passive:true});</script>';

// Ramo Ramón (ce8bek0q), 2026-10-12: a fixed header inside an isolation:isolate poster, so later catalog cards paint over it.
it('reports header controls that later content covers because the header sits inside an isolated wrapper', async () => {
  const snapshot = await store(`<div class="poster"><header class="site-header">${controls}</header><div class="hero">Ramos que hablan</div></div><main><section class="catalog">${cards}</section></main>${hideOnScroll}`,
    'body{margin:0;font:16px sans-serif}.poster{position:relative;isolation:isolate;min-height:100vh;padding-top:64px;background:#f6c}.site-header{position:fixed;top:0;left:0;right:0;height:64px;z-index:50;display:flex;justify-content:space-between;align-items:center;background:#fff;transition:transform .2s}.tools{display:flex;gap:16px}.catalog{display:grid}.card{position:relative;z-index:1;height:520px;background:#c88}');
  const covers = await captureHeaderCovers(snapshot);
  expect(covers.some(cover => cover.width === 1440)).toBe(true);
  expect(covers.some(cover => cover.width === 390)).toBe(true);
  expect(covers).toEqual(expect.arrayContaining([expect.objectContaining({ control: 'Tu ramo', cover: 'div.card', section: 'section.catalog', atTop: false, trap: 'div.poster (isolation:isolate)' })]));
  const problems = headerCoverProblems(covers).join('\n');
  expect(problems).toContain('«Tu ramo»');
  expect(problems).toContain('div.card');
  expect(problems).toContain('div.poster');
  expect(problems).toContain('isolation:isolate');
});

// Rampa (qu3usw8r), 2026-10-12: its own cart drawer, never opened (the kit owns [data-cart-open]), invisible over the header's right side.
it('reports an invisible fixed drawer over the header and suggests removing a duplicate cart', async () => {
  const snapshot = await store(`<header class="bar">${controls}</header><main><section class="hero" style="height:1600px">Rampa</section></main><aside class="bag-drawer" data-cart-drawer aria-hidden="true">Tu bolsa</aside>`,
    'body{margin:0;font:16px sans-serif}.bar{position:sticky;top:0;z-index:20;height:64px;display:flex;justify-content:space-between;align-items:center;padding:0 24px;background:#fff}.tools{display:flex;gap:16px}.bag-drawer{position:fixed;top:0;right:0;width:min(460px,100%);height:100vh;z-index:30;opacity:0;background:#fff}');
  const covers = await captureHeaderCovers(snapshot);
  expect(covers).toEqual(expect.arrayContaining([
    expect.objectContaining({ width: 1440, control: 'Tu ramo', cover: 'aside.bag-drawer', atTop: true, drawer: true }),
    expect.objectContaining({ width: 390, control: 'Tu ramo', cover: 'aside.bag-drawer', drawer: true }),
  ]));
  // The logo on the left is outside the 460px drawer at desktop width.
  expect(covers.some(cover => cover.width === 1440 && cover.control === 'Ramo')).toBe(false);
  const problems = headerCoverProblems(covers).join('\n');
  expect(problems).toContain('aside.bag-drawer');
  expect(problems).toContain('pointer-events:none');
  expect(problems).toMatch(/carrito/);
});

it('says nothing about an ordinary sticky header above positioned content', async () => {
  const snapshot = await store(`<header class="bar">${controls}</header><main><section class="catalog">${cards}</section></main>`,
    'body{margin:0;font:16px sans-serif}.bar{position:sticky;top:0;z-index:10;height:64px;display:flex;justify-content:space-between;align-items:center;background:#fff}.tools{display:flex;gap:16px}.card{position:relative;height:520px;background:#c88}');
  expect(await captureHeaderCovers(snapshot)).toEqual([]);
});

const cover = (overrides: Partial<HeaderCover>): HeaderCover => ({ width: 1440, control: 'Buscar', cover: 'div.card', section: 'section.catalog', atTop: false, ...overrides });

it('words each cover so the model can fix it: control, covering element, section and likely cause', () => {
  expect(headerCoverProblems([cover({ trap: 'div.poster (isolation:isolate)' }), cover({ control: 'Tu ramo', trap: 'div.poster (isolation:isolate)' })])).toEqual([
    '1440px: los controles «Buscar» y «Tu ramo» del encabezado no se pueden pulsar: al bajar y volver a subir los tapa div.card (en section.catalog). El encabezado está dentro de div.poster (isolation:isolate), que crea su propio contexto de apilamiento, así que su z-index no puede quedar sobre el contenido que viene después: saca el <header> de ese contenedor (hijo directo de <body>) o quita esa propiedad del contenedor.',
  ]);
  expect(headerCoverProblems([cover({ width: 390, control: 'Tu bolsa', cover: 'aside.cart-drawer', section: '', atTop: true, invisible: 'opacity:0', drawer: true })])[0]).toBe(
    '390px: el control «Tu bolsa» del encabezado no se puede pulsar: arriba de la página lo tapa aside.cart-drawer. aside.cart-drawer es un elemento fijo invisible (opacity:0) que sigue recibiendo clics y parece un carrito propio: quítalo, la plataforma ya pone el carrito (los botones [data-cart-open] abren el suyo). Si no es un carrito, cuando esté cerrado dale pointer-events:none y visibility:hidden.');
  expect(headerCoverProblems([cover({ cover: 'div.overlay', invisible: 'opacity:0' })])[0]).toContain('div.overlay es un elemento fijo invisible (opacity:0) que sigue recibiendo clics: cuando esté cerrado dale pointer-events:none y visibility:hidden');
  expect(headerCoverProblems([cover({})])[0]).toContain('dale al encabezado position:sticky o fixed con un z-index mayor');
  expect(headerCoverProblems([])).toEqual([]);
});

// Ramo Ramón's real sweep found 17 covering elements, all for the one wrapper: that is one fix, so one sentence per width.
it('folds every cover that one trapping wrapper causes into a single problem per width', () => {
  const trap = 'div.poster (isolation:isolate)';
  const problems = headerCoverProblems([
    cover({ control: 'Ramos', cover: 'div.story-photo', section: 'section#historia', trap }), cover({ control: 'Buscar', cover: 'h2#sixty-title', section: 'section.sixty', trap }),
    cover({ control: 'Tu ramo', cover: 'figure.sixty-photo', section: 'section.sixty', trap }), cover({ control: 'Ramos', cover: 'a.menu-item__details', section: '', trap }),
    cover({ width: 390, control: 'Tu ramo', cover: 'h2#catalog-title', section: 'section#catalogo', trap }),
  ]);
  expect(problems).toHaveLength(2);
  expect(problems[0]).toMatch(/^1440px: los controles «Ramos», «Buscar» y «Tu ramo» del encabezado no se pueden pulsar: al bajar y volver a subir los tapa div\.story-photo \(en section#historia\), h2#sixty-title \(en section\.sixty\) y 2 elementos más\. El encabezado está dentro de div\.poster/);
  expect(problems[1]).toMatch(/^390px: el control «Tu ramo» .* lo tapa h2#catalog-title \(en section#catalogo\)\./);
});

// 524dfd73: a save is blocked only by the problems it brings in.
it('keeps only the covers a save brings in, judged per control and width', () => {
  const saved = [cover({ control: 'Buscar' }), cover({ width: 390, control: 'Tu bolsa', cover: 'aside.cart-drawer' })];
  const next = [cover({ control: 'Buscar', cover: 'img.photo' }), cover({ width: 390, control: 'Tu bolsa', cover: 'aside.cart-drawer' }), cover({ width: 1440, control: 'Tu bolsa', cover: 'aside.cart-drawer' })];
  expect(introducedHeaderCovers(next, saved)).toEqual([cover({ width: 1440, control: 'Tu bolsa', cover: 'aside.cart-drawer' })]);
  expect(introducedHeaderCovers(next, [])).toEqual(next);
});
