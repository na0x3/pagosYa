import { readFileSync } from 'node:fs';
import { PRODUCT_HIGHLIGHT_ICONS } from '../payment-links/product-highlights';
import { join } from 'node:path';
import { withSourceCommerceDesign } from './source-commerce-design';

const kit = (path: string) => readFileSync(join(__dirname, 'source-kit', path), 'utf8');
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
