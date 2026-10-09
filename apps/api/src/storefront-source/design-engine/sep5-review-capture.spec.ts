jest.setTimeout(60_000);

import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import { captureSep5Draft, sep5MeasuredFacts } from './sep5-review-capture';
import { sourceProjectSnapshot } from '../source-project';

const brief = { businessType: 'Test', audience: 'Test', primaryAction: 'Comprar', visualDirection: 'Simple' };
const config = 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ slug: 'test', apiBaseUrl: 'https://preview.invalid', checkoutOrigin: 'https://preview.invalid', productPage: 'product.html', checkoutPage: 'checkout.html', demo: true, data: { storeName: 'Test', items: [{ id: 'p1', name: 'Clase suelta', amount: 9000, currency: 'BOB', stock: 10, imageUrls: [], variants: [] }] } }) + ';';
const store = async (header: string, footer: string) => sourceProjectSnapshot({ revision: 1, label: 'Draft', brief, files: [
  { path: 'commerce.js', content: await readFile(kitPath('commerce.js'), 'utf8') },
  { path: 'config.js', content: config },
  { path: 'package.json', content: '{"name":"test","scripts":{"build":"node build.mjs"}}' }, { path: 'README.md', content: '# Test' },
  { path: 'index.html', content: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><header>${header}</header><main><div data-pagosya-catalog></div><aside data-pagosya-cart></aside><p data-pagosya-status></p></main><footer>${footer}</footer><script src="config.js" defer></script><script src="commerce.js" defer></script>` },
] });

// The footer's information slot links account and search on every store, so only the header counts.
it('reports a header without search or account even when the footer has both', async () => {
  const snapshot = await store('<a href="index.html">Eje</a><button type="button"><span data-cart-count>0</span></button>', '<a href="buscar.html">Buscar</a><a href="#" data-pagosya-account="login">Mi cuenta</a>');
  const { shots, facts } = await captureSep5Draft(snapshot);
  expect(shots.map(shot => shot.width)).toEqual(expect.arrayContaining([1280, 390]));
  expect(shots.every(shot => shot.image.startsWith('data:image/jpeg;base64,'))).toBe(true);
  expect(facts).toEqual([
    expect.objectContaining({ width: 1280, search: false, account: false, cart: true }),
    expect.objectContaining({ width: 390, search: false, account: false, cart: true }),
  ]);
  expect(sep5MeasuredFacts(facts)).toEqual(expect.arrayContaining([
    '1280px: no hay enlace a buscar.html fuera del pie de página.',
    '390px: no hay enlace data-pagosya-account fuera del pie de página.',
  ]));
});

it('says nothing about a complete header', async () => {
  const snapshot = await store('<a href="index.html">Eje</a><a href="buscar.html">Buscar</a><a href="#" data-pagosya-account="login">Mi cuenta</a><button type="button"><span data-cart-count>0</span></button>', '');
  const { facts } = await captureSep5Draft(snapshot);
  expect(sep5MeasuredFacts(facts)).toEqual([]);
});

it('words overflow, broken images and script errors for the model', () => {
  expect(sep5MeasuredFacts([{ width: 390, pageWidth: 512, missingImages: 2, search: true, account: true, cart: true, errors: ['x is not defined'] }])).toEqual([
    '390px: la página es más ancha que la pantalla (512px).',
    '390px: 2 imagen(es) visibles no cargaron.',
    '390px: error de JavaScript: x is not defined',
  ]);
});
