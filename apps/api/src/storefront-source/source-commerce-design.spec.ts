import { readFileSync } from 'node:fs';
import { PRODUCT_HIGHLIGHT_ICONS } from '../payment-links/product-highlights';
import { withSourceCommerceDesign } from './source-commerce-design';
import { kitPath } from '@pagosya/storefront-kit';

const kit = (path: string) => readFileSync(kitPath(path), 'utf8');
const home = '<html><head><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="brand.css"></head><body class="brand-theme"><header class="site-header"><a class="wordmark" href="index.html"><img src="assets/logo.png">Marca</a><nav><a href="#catalogo">Catálogo</a><a href="pages/guide.html?lang=es#intro">Guía</a></nav></header><main id="catalogo">Catálogo</main><footer class="site-footer"><a href="#contacto">Contacto</a></footer></body></html>';
const files = () => [
  { path: 'index.html', content: home },
  { path: 'styles.css', content: 'body{background:navy;color:white}.checkout-button{background:coral;border-radius:0}' },
  { path: 'brand.css', content: ':root{--brand-body-font:serif}' },
  ...['product.html', 'checkout.html', 'commerce-pages.css'].map(path => ({ path, content: kit(path) })),
];

describe('Shared storefront design', () => {
  it('uses the homepage shell and styles for stock product and checkout pages without changing the homepage', async () => {
    const original = files();
    const before = JSON.stringify(original);
    const result = await withSourceCommerceDesign(original);
    expect(result[0]).toEqual(original[0]);
    for (const path of ['product.html', 'checkout.html']) {
      const page = result.find(file => file.path === path)!.content;
      expect(page).toContain('class="site-header"');
      expect(page).toContain('class="site-footer"');
      expect(page).toContain('class="commerce-document brand-theme"');
      expect(page).toContain('href="index.html#catalogo"');
      expect(page).toContain('href="brand.css"');
      expect(page).toContain('href="pages/guide.html?lang=es#intro"');
    }
    expect(JSON.stringify(original)).toBe(before);
    expect(await withSourceCommerceDesign(result)).toEqual(result);
    const updated = await withSourceCommerceDesign(result.map(file => file.path === 'index.html' ? { ...file, content: file.content.replace('>Marca</a>', '>Nueva marca</a>') } : file));
    expect(updated.find(file => file.path === 'product.html')!.content).toContain('>Nueva marca</a>');
  });
  it('also brands productos.html and coleccion.html (data-catalog-full), not just product.html/checkout.html', async () => {
    const original = [...files(), { path: 'productos.html', content: kit('productos.html') }, { path: 'coleccion.html', content: kit('coleccion.html') }];
    const result = await withSourceCommerceDesign(original);
    for (const path of ['productos.html', 'coleccion.html']) {
      const page = result.find(file => file.path === path)!.content;
      expect(page).toContain('class="site-header"');
      expect(page).toContain('class="site-footer"');
      expect(page).toContain('class="commerce-document brand-theme"');
      expect(page).toContain('href="brand.css"');
    }
  });
  it('rebases shared links, assets and styles for a nested product page', async () => {
    const nested = files().map(file => file.path === 'product.html' ? { path: 'pages/item.html', content: file.content.replace('href="styles.css"', 'href="../styles.css"') } : file);
    const page = (await withSourceCommerceDesign(nested)).find(file => file.path === 'pages/item.html')!.content;
    expect(page).toContain('href="../index.html#catalogo"');
    expect(page).toContain('href="guide.html?lang=es#intro"');
    expect(page).toContain('src="../assets/logo.png"');
    expect(page).toContain('href="../brand.css"');
    expect(page.match(/href="\.\.\/styles.css"/g)).toHaveLength(1);
  });
  it('preserves customized shells, non-commerce pages and authored fallback CSS', async () => {
    const custom = '<html><head><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="brand.css"></head><body><header class="commerce-header">Custom navigation</header><main data-pagosya-product-page></main><footer>Custom footer</footer></body></html>';
    const original = [...files().filter(file => file.path !== 'product.html' && file.path !== 'commerce-pages.css'), { path: 'product.html', content: custom }, { path: 'pages/about.html', content: '<h1>About</h1>' }, { path: 'commerce-pages.css', content: '.custom-detail{padding:40px}' }];
    const result = await withSourceCommerceDesign(original);
    expect(result.find(file => file.path === 'product.html')!.content).toBe(custom);
    expect(result.find(file => file.path === 'pages/about.html')!.content).toBe('<h1>About</h1>');
    expect(result.find(file => file.path === 'commerce-pages.css')!.content).toContain('.custom-detail{padding:40px}');
    expect(result.find(file => file.path === 'commerce-pages.css')!.content).toContain('@layer pagosya-commerce');
  });
});

it('draws every highlight icon the API can store', () => {
  const runtime = kit('commerce.js');
  const drawn = runtime.slice(runtime.indexOf('const highlightIcons = {'), runtime.indexOf('function highlightsMarkup'));
  for (const name of PRODUCT_HIGHLIGHT_ICONS) expect(drawn).toContain(`${/-/.test(name) ? `'${name}'` : name}: { motion:`);
});

it('styles inline options with merchant tokens and preserves text quick-add targets', () => {
  const runtime = kit('commerce.js');
  const options = runtime.match(/\[data-pagosya-product\]\[data-style\] \[data-product-option\]\{([^}]+)\}/)![1];
  expect(options).toContain('min-width:44px');
  expect(options).toContain('border:1px solid var(--pd-line)');
  expect(options).toContain('color:inherit');
  expect(runtime).toContain('--pd-line:var(--store-border,var(--brand-border,');
  expect(runtime).toContain('--pd-radius:min(var(--store-radius,var(--brand-radius,0px)),6px)');
  expect(runtime).toContain(':focus-visible{outline:2px solid var(--pd-accent)');
  const textAction = runtime.match(/\.menu-item:not\(\[data-custom-product\]\) button.menu-add\[data-product\]\{([^}]+)\}/)![1];
  expect(textAction).toContain('min-height:44px');
  expect(textAction).toContain('padding:10px 14px');
  expect(textAction).toContain('border-radius:var(--store-radius,var(--brand-radius,0px))');
});

it('keeps the stock full catalog distinct from the order summary, including legacy snapshots', async () => {
  const result = await withSourceCommerceDesign([...files(), { path: 'productos.html', content: kit('productos.html') }]);
  const page = result.find(f => f.path === 'productos.html')!.content;
  expect(page).toContain('class="commerce-catalog-title"');
  expect(page).toContain('class="commerce-catalog"');
  expect(page).toContain('data-pagosya-catalog data-catalog-full');
  expect(page).toContain('<div data-pagosya-cart hidden></div>');
  expect(page).not.toContain('<aside class="commerce-order"');
  expect(result.find(f => f.path === 'commerce-pages.css')!.content).toContain('.commerce-catalog-title');
  expect(await withSourceCommerceDesign(result)).toEqual(result);
});

describe('Header panels outside the shared header', () => {
  const panel = '<div class="fullscreen-menu" id="menu-completo" role="dialog"><div class="menu-head"><div><span>Edición</span></div><button class="menu-close">Cerrar</button></div><nav class="menu-list"><a href="#inicio">Inicio</a><a href="buscar.html">Buscar</a></nav><p class="menu-foot">Cochabamba</p></div>';
  const withPanel = (header: string, extra = panel) => files().map(file => file.path === 'index.html' ? { ...file, content: home.replace(/<header[\s\S]*<\/header>/, header).replace('</main>', `</main>${extra}`) } : file);
  const menuHeader = '<header class="site-header"><a href="index.html">Marca</a><button class="menu-trigger" aria-controls="menu-completo">Menú</button></header>';
  const page = (result: { path: string; content: string }[], path = 'productos.html') => result.find(file => file.path === path)!.content;
  const catalog = () => [{ path: 'productos.html', content: kit('productos.html') }];

  it('carries a header-controlled panel onto kit pages, complete, right after the header', async () => {
    const result = await withSourceCommerceDesign([...withPanel(menuHeader), ...catalog()]);
    for (const path of ['productos.html', 'product.html', 'checkout.html']) {
      const content = page(result, path);
      expect(content.match(/id="menu-completo"/g)).toHaveLength(1);
      expect(content).toContain('<header data-pagosya-shared-shell="header" class="site-header"><a href="index.html">Marca</a><button class="menu-trigger" aria-controls="menu-completo">Menú</button></header>\n<div data-pagosya-shared-shell="header-panel" class="fullscreen-menu" id="menu-completo"');
      expect(content).toContain('<a href="index.html#inicio">Inicio</a><a href="buscar.html">Buscar</a></nav><p class="menu-foot">Cochabamba</p></div>');
    }
  });
  it('replaces the copied panel on a later save instead of duplicating it', async () => {
    const first = await withSourceCommerceDesign([...withPanel(menuHeader), ...catalog()]);
    expect(await withSourceCommerceDesign(first)).toEqual(first);
    const edited = await withSourceCommerceDesign(first.map(file => file.path === 'index.html' ? { ...file, content: file.content.replace('Cochabamba', 'La Paz') } : file));
    expect(page(edited).match(/id="menu-completo"/g)).toHaveLength(1);
    expect(page(edited)).toContain('La Paz');
    expect(page(edited)).not.toContain('Cochabamba');
    const removed = await withSourceCommerceDesign(first.map(file => file.path === 'index.html' ? { ...file, content: file.content.replace(panel, '') } : file));
    expect(page(removed)).not.toContain('header-panel');
    expect(page(removed)).toBe(page(await withSourceCommerceDesign([...withPanel(menuHeader, ''), ...catalog()])));
  });
  it('leaves a panel the kit page already has, and ignores missing or header-internal targets', async () => {
    const own = [{ path: 'productos.html', content: kit('productos.html').replace(/<\/main>/i, '<div id="menu-completo">Propio</div></main>') }];
    const kept = page(await withSourceCommerceDesign([...withPanel(menuHeader), ...own]));
    expect(kept.match(/id="menu-completo"/g)).toHaveLength(1);
    expect(kept).toContain('<div id="menu-completo">Propio</div>');
    const missing = page(await withSourceCommerceDesign([...withPanel(menuHeader, ''), ...catalog()]));
    expect(missing).not.toContain('header-panel');
    const internal = '<header class="site-header"><button aria-controls="nav-movil">Menú</button><div id="nav-movil" hidden>Links</div></header>';
    const inside = page(await withSourceCommerceDesign([...withPanel(internal, ''), ...catalog()]));
    expect(inside.match(/id="nav-movil"/g)).toHaveLength(1);
    expect(inside).not.toContain('header-panel');
  });
  it('copies every listed target and rebases them for nested pages', async () => {
    const two = '<header class="site-header"><button aria-controls="menu-completo buscador">Menú</button></header>';
    const nested = [...withPanel(two, `${panel}<aside id="buscador"><a href="buscar.html">Buscar</a></aside>`)].map(file => file.path === 'product.html' ? { ...file, path: 'pages/item.html' } : file);
    const content = page(await withSourceCommerceDesign(nested), 'pages/item.html');
    expect(content.match(/data-pagosya-shared-shell="header-panel"/g)).toHaveLength(2);
    expect(content).toContain('<a href="../index.html#inicio">Inicio</a>');
    expect(content).toContain('<aside data-pagosya-shared-shell="header-panel" id="buscador"><a href="../buscar.html">Buscar</a></aside>');
  });
});
