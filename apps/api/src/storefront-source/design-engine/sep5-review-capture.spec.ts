jest.setTimeout(60_000);

import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import { captureSep5Draft, sep5MeasuredFacts } from './sep5-review-capture';
import { sourceProjectSnapshot } from '../source-project';
import { applySourceLayoutBaseline } from '../source-layout-baseline';

const brief = { businessType: 'Test', audience: 'Test', primaryAction: 'Comprar', visualDirection: 'Simple' };
const config = 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ slug: 'test', apiBaseUrl: 'https://preview.invalid', checkoutOrigin: 'https://preview.invalid', productPage: 'product.html', checkoutPage: 'checkout.html', demo: true, data: { storeName: 'Test', items: [{ id: 'p1', name: 'Clase suelta', amount: 9000, currency: 'BOB', stock: 10, imageUrls: [], variants: [] }] } }) + ';';
const store = async (header: string, footer: string, main = '', css = '') => sourceProjectSnapshot({ revision: 1, label: 'Draft', brief, files: [
  { path: 'commerce.js', content: await readFile(kitPath('commerce.js'), 'utf8') },
  { path: 'config.js', content: config },
  ...(css ? applySourceLayoutBaseline([{ path: 'styles.css', content: css }]) : []),
  { path: 'package.json', content: '{"name":"test","scripts":{"build":"node build.mjs"}}' }, { path: 'README.md', content: '# Test' },
  { path: 'index.html', content: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css ? '<link rel="stylesheet" href="styles.css">' : ''}<header>${header}</header><main>${main}<div data-pagosya-catalog></div><aside data-pagosya-cart></aside><p data-pagosya-status></p></main><footer>${footer}</footer><script src="config.js" defer></script><script src="commerce.js" defer></script>` },
] });

// The footer's information slot links account and search on every store, so only the header counts.
it('reports a header without search or account even when the footer has both', async () => {
  const snapshot = await store('<a href="index.html">Eje</a><button type="button"><span data-cart-count>0</span></button>', '<a href="buscar.html">Buscar</a><a href="#" data-pagosya-account="login">Mi cuenta</a>');
  const { shots, facts } = await captureSep5Draft(snapshot);
  expect(shots.map(shot => shot.width)).toEqual(expect.arrayContaining([1280, 390]));
  expect(shots.every(shot => shot.image.startsWith('data:image/jpeg;base64,'))).toBe(true);
  expect(facts).toEqual([
    expect.objectContaining({ width: 1280, search: false, account: false, cart: true }),
    expect.objectContaining({ width: 1024, search: false, account: false, cart: true }),
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
  expect(sep5MeasuredFacts([{ width: 390, pageWidth: 512, missingImages: 2, search: true, account: true, cart: true, brokenWords: [], errors: ['x is not defined'] }])).toEqual([
    '390px: la página es más ancha que la pantalla (512px).',
    '390px: 2 imagen(es) visibles no cargaron.',
    '390px: error de JavaScript: x is not defined',
  ]);
});

const completeHeader = '<a href="index.html">Eje</a><a href="buscar.html">Buscar</a><a href="#" data-pagosya-account="login">Mi cuenta</a><button type="button"><span data-cart-count>0</span></button>';

// Owner 2026-10-10: a 90px serif heading squeezed into a 170px label column read "próxi / ma", "secue / ncia".
it('reports a heading that breaks a word in the middle, and not one that wraps between words', async () => {
  const squeezed = await store(completeHeader, '', '<h2 style="width:170px;font:400 90px/1 serif;overflow-wrap:anywhere;margin:0">La próxima secuencia empieza aquí.</h2>');
  const { facts } = await captureSep5Draft(squeezed);
  expect(facts[0].brokenWords.length).toBeGreaterThan(0);
  expect(facts[0].brokenWords.every(word => 'La próxima secuencia empieza aquí.'.includes(word))).toBe(true);
  expect(sep5MeasuredFacts(facts).some(fact => fact.startsWith('1280px: un título corta la palabra'))).toBe(true);
  const roomy = await store(completeHeader, '', '<h2 style="width:900px;font:400 90px/1 serif;overflow-wrap:anywhere;margin:0">La próxima secuencia empieza aquí.</h2>');
  expect((await captureSep5Draft(roomy)).facts[0].brokenWords).toEqual([]);
});

it('tells the model which words a heading breaks', () => {
  expect(sep5MeasuredFacts([{ width: 1280, pageWidth: 1280, missingImages: 0, search: true, account: true, cart: true, brokenWords: ['próxima', 'secuencia'], errors: [] }])).toEqual([
    '1280px: un título corta la palabra «próxima», «secuencia» a mitad de línea; dale ancho para que salte solo entre palabras.',
  ]);
});

// Pulso Pilates 2026-10-10: its hero split "movimient / o" only around 1000-1100px, the studio preview's width,
// while it fit at both widths the review photographed.
it('measures headings at a laptop width too, where a heading can break that fits at 1280 and 390', async () => {
  const snapshot = await store(completeHeader, '', '<h2 class="squeeze">La próxima secuencia empieza aquí.</h2>', 'h2{font:400 90px/1 serif;margin:0}@media (min-width:1000px) and (max-width:1100px){.squeeze{width:170px}}');
  const { shots, facts } = await captureSep5Draft(snapshot);
  expect(shots.map(shot => shot.width)).not.toContain(1024);
  expect(facts.map(fact => fact.width)).toEqual([1280, 1024, 390]);
  expect(facts.find(fact => fact.width === 1024)!.brokenWords.length).toBeGreaterThan(0);
  expect(facts.filter(fact => fact.width !== 1024).every(fact => fact.brokenWords.length === 0)).toBe(true);
});

// The platform's safety stylesheet let any heading break between two letters, so a content-sized column squeezed a
// big headline instead of growing to its longest word.
it('lets a big headline widen its content-sized column instead of splitting a word', async () => {
  const snapshot = await store(completeHeader, '', '<section class="hero"><h1>El movimiento encuentra su pulso.</h1><div class="photo"></div></section>', '.hero{display:grid;grid-template-columns:1fr 1fr;width:900px}.hero h1{font:700 106px/.9 serif;margin:0}.photo{min-height:200px;background:#ccc}');
  const { facts } = await captureSep5Draft(snapshot);
  expect(facts.find(fact => fact.width === 1280)!.brokenWords).toEqual([]);
});

// Review 2026-10-10: break-word kept long words out of min-content, so a phone page scrolled sideways.
it('never lets a long headline word make a phone page scroll sideways', async () => {
  const snapshot = await store(completeHeader, '', '<section class="solo"><h1>Electrodomésticos</h1></section>', '.solo{display:grid}.solo h1{font:700 64px/1 sans-serif;margin:0}');
  const { facts } = await captureSep5Draft(snapshot);
  expect(facts.find(fact => fact.width === 390)!.pageWidth).toBeLessThanOrEqual(392);
});

// A visually hidden heading is 1px wide: every word "breaks", and asking the model to widen it would un-hide it.
it('ignores visually hidden headings when measuring broken words', async () => {
  const snapshot = await store(completeHeader, '', '<h3 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Productos destacados de temporada</h3>', 'body{margin:0}');
  const { facts } = await captureSep5Draft(snapshot);
  expect(facts.every(fact => fact.brokenWords.length === 0)).toBe(true);
});
