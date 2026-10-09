import { repairCommercePageWiring } from './commerce-page-wiring';
import { validateGeneratedSource } from './source-generation.service';

const page = (path: string, content: string) => ({ path, content });
const wired = '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><main data-pagosya-checkout-page></main><script src="config.js"></script><script src="commerce.js"></script><script src="site.js"></script></body></html>';

describe('repairCommercePageWiring', () => {
  it('leaves a correctly wired page byte for byte', () => {
    const result = repairCommercePageWiring([page('checkout.html', wired)]);
    expect(result.files[0].content).toBe(wired);
    expect(result.repairs).toEqual([]);
  });

  it('adds the mount, the shared stylesheet and the commerce scripts a checkout page forgot', () => {
    const result = repairCommercePageWiring([page('checkout.html', '<!doctype html><html><head><title>Pago</title></head><body><header class="brand">Huerta</header><main class="pay"></main></body></html>')]);
    const html = result.files[0].content;
    expect(html).toContain('<main data-pagosya-checkout-page class="pay">');
    expect(html).toContain('<link rel="stylesheet" href="styles.css"></head>');
    expect(html.indexOf('src="config.js"')).toBeLessThan(html.indexOf('src="commerce.js"'));
    expect(html.indexOf('src="commerce.js"')).toBeLessThan(html.indexOf('src="site.js"'));
    expect(result.repairs).toEqual(['checkout.html: wired missing data-pagosya-checkout-page, styles.css, config.js, commerce.js, site.js']);
  });

  it('reorders the commerce scripts when only one was missing, so config still loads first', () => {
    const result = repairCommercePageWiring([page('product.html', '<html><head><link rel="stylesheet" href="styles.css"></head><body><main data-pagosya-product-page></main><script src="commerce.js"></script><script src="site.js"></script></body></html>')]);
    const html = result.files[0].content;
    expect(html.match(/src="commerce\.js"/g)).toHaveLength(1);
    expect(html.indexOf('src="config.js"')).toBeLessThan(html.indexOf('src="commerce.js"'));
  });

  it('adds a mount when the page has no main element', () => {
    const html = repairCommercePageWiring([page('product.html', '<html><head></head><body><p>Hola</p></body></html>')]).files[0].content;
    expect(html).toContain('<main data-pagosya-product-page></main>');
  });

  it('never touches other pages', () => {
    const index = page('index.html', '<html><body>no wiring</body></html>');
    expect(repairCommercePageWiring([index]).files[0]).toBe(index);
  });

  it('turns the checkout page that failed Huerta Viva into one the validator accepts', () => {
    const files = [
      page('index.html', '<html><head><link rel="stylesheet" href="styles.css"></head><body><div data-pagosya-catalog></div><div data-pagosya-cart></div><div data-pagosya-status></div><script src="config.js"></script><script src="commerce.js"></script><script src="site.js"></script></body></html>'),
      page('styles.css', 'body{margin:0}'),
      page('site.js', 'void 0;'),
      page('checkout.html', '<html><head></head><body><main class="pay"></main><script src="site.js"></script></body></html>'),
    ];
    expect(() => validateGeneratedSource(files)).toThrow('checkout.html');
    expect(() => validateGeneratedSource(repairCommercePageWiring(files).files)).not.toThrow();
  });
});
