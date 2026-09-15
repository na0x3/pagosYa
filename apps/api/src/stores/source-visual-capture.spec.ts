import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { captureSourceVisuals, probeSourceShopping } from './source-visual-capture';
import { designCaptureFailures } from './source-design-evaluator';
import { sourceProjectSnapshot } from './source-project';

it('keeps checkout reachable on mobile when authored cart CSS forces a fixed full-width drawer', async () => {
  const files = await Promise.all(['commerce.js', 'commerce-pages.css'].map(async path => ({ path, content: await readFile(join(__dirname, 'source-kit', path), 'utf8') })));
  const shell = (mount: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="commerce-pages.css"><style>body{margin:16px}[data-pagosya-cart]:not([hidden]){position:fixed!important;inset:0 0 0 auto;width:100%;height:100dvh;overflow:auto}</style>${mount}<p data-pagosya-status></p><script src="config.js" defer></script><script src="commerce.js" defer></script>`;
  const snapshot = sourceProjectSnapshot({ revision: 1, label: 'Checkout regression', brief: { businessType: 'Test', audience: 'Test', primaryAction: 'Comprar', visualDirection: 'Simple' }, files: [...files,
    { path: 'index.html', content: shell('<h1>Tienda</h1>') },
    { path: 'product.html', content: shell('<main data-pagosya-product-page></main>') },
    { path: 'checkout.html', content: shell('<main data-pagosya-checkout-page></main>') },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ slug: 'test', apiBaseUrl: 'https://preview.invalid', checkoutOrigin: 'https://preview.invalid', productPage: 'product.html', checkoutPage: 'checkout.html', demo: true, data: { storeName: 'Test', items: [{ id: 'p1', name: 'Lámpara', amount: 22000, currency: 'BOB', stock: 10, imageUrls: [], variants: [{ id: 'v1', name: 'Negro', amount: 22000, stock: 10, options: [{ name: 'Color', value: 'Negro' }] }] }] } }) + ';' },
    { path: 'package.json', content: '{"name":"test","scripts":{"build":"node build.mjs"}}' }, { path: 'README.md', content: '# Test' },
  ] });
  const result = await probeSourceShopping(snapshot);
  expect(result).toEqual([expect.objectContaining({ width: 1280, status: 'passed', variantId: 'v1' }), expect.objectContaining({ width: 390, status: 'passed', variantId: 'v1' })]);
}, 45000);

it('records product page purchase metrics at the top of each viewport', async () => {
  const files = await Promise.all(['commerce.js', 'commerce-pages.css'].map(async path => ({ path, content: await readFile(join(__dirname, 'source-kit', path), 'utf8') })));
  const shell = (mount: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="commerce-pages.css"><style>body{margin:0}</style>${mount}<p data-pagosya-status></p><script src="config.js" defer></script><script src="commerce.js" defer></script>`;
  const snapshot = sourceProjectSnapshot({ revision: 1, label: 'Product metrics', brief: { businessType: 'Test', audience: 'Test', primaryAction: 'Comprar', visualDirection: 'Simple' }, files: [...files,
    { path: 'index.html', content: shell('<h1>Tienda</h1>') },
    { path: 'product.html', content: shell('<main data-pagosya-product-page></main>') },
    { path: 'checkout.html', content: shell('<main data-pagosya-checkout-page></main>') },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ slug: 'test', apiBaseUrl: 'https://preview.invalid', checkoutOrigin: 'https://preview.invalid', productPage: 'product.html', checkoutPage: 'checkout.html', productPageStyle: 'dense', demo: true, data: { storeName: 'Test', items: [{ id: 'p1', name: 'Lámpara', description: 'Brazo ajustable.', amount: 22000, currency: 'BOB', stock: 10, imageUrls: [], variants: [{ id: 'v1', name: 'Negro', amount: 22000, stock: 10, options: [{ name: 'Color', value: 'Negro' }] }] }] } }) + ';' },
    { path: 'package.json', content: '{"name":"test","scripts":{"build":"node build.mjs"}}' }, { path: 'README.md', content: '# Test' },
  ] });
  const captures = await captureSourceVisuals(snapshot, 'product.html');
  const top = captures.filter(capture => capture.y === 0);
  expect(top.map(capture => capture.viewport)).toEqual(['desktop', 'mobile']);
  for (const capture of top) expect(capture.product).toEqual({ buyBottom: expect.any(Number), titleLines: 1, overflowingChoices: 0 });
  expect(captures.filter(capture => capture.y > 0).every(capture => capture.product === undefined)).toBe(true);
  expect(designCaptureFailures(captures)).toEqual([]);
}, 60000);
