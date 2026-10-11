jest.setTimeout(60_000);

import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { captureSep5Draft, decorativeEmojiCount, fakeCircularTextCount, sep5MeasuredFacts } from './sep5-review-capture';
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

// Design draw round 2 quality floor: the live coffee store shipped a "roundel" with straight text across an emoji.
const { JSDOM } = createRequire(join(__dirname, '../../../../checkout/package.json'))('jsdom');
const html = (body: string) => new JSDOM(`<body>${body}</body>`).window.document as Document;

it('counts emoji used as decoration, not emoji inside a sentence', () => {
  expect(decorativeEmojiCount(html('<div class="roundel"><span>YUNGAS · LA PAZ ·</span><strong>☕</strong></div>'))).toBe(1);
  expect(decorativeEmojiCount(html('<p>Nos encanta el café ☕ de la mañana.</p>'))).toBe(0);
});

it('flags circular stamp text written without an SVG textPath, not round icon buttons', () => {
  const round = () => ({ radius: 120, width: 240, height: 240 });
  expect(fakeCircularTextCount(html('<div class="roundel"><span>YUNGAS · LA PAZ · CAFÉ ·</span></div>'), round)).toBe(1);
  expect(fakeCircularTextCount(html('<div class="roundel"><svg><path id="c" d="M0 0"/><text><textPath href="#c">YUNGAS · LA PAZ · CAFÉ ·</textPath></text></svg></div>'), round)).toBe(0);
  expect(fakeCircularTextCount(html('<button class="round">Ir</button>'), () => ({ radius: 22, width: 44, height: 44 }))).toBe(0);
});

it('reports emoji decoration, fake circular text and overlapping text in the merchant language', () => {
  const base = { width: 1280, pageWidth: 1280, missingImages: 0, search: true, account: true, cart: true, brokenWords: [], errors: [] };
  const facts = sep5MeasuredFacts([{ ...base, decorEmoji: 1, fakeCircle: 1, overlaps: ['«Una pausa» sobre «Explorar»'] }]).join('\n');
  expect(facts).toMatch(/emoji/);
  expect(facts).toMatch(/textPath/);
  expect(facts).toMatch(/se superpone/);
  expect(sep5MeasuredFacts([base])).toEqual([]);
});

it('measures the fake roundel and its emoji in a real browser', async () => {
  const header = '<a href="index.html">Eje</a><a href="buscar.html">Buscar</a><a href="#" data-pagosya-account="login">Mi cuenta</a><button type="button"><span data-cart-count>0</span></button>';
  const roundel = '<div class="roundel"><span>YUNGAS · LA PAZ · CAFÉ ·</span><strong>☕</strong></div>';
  const css = '.roundel{width:240px;height:240px;border-radius:50%;display:grid;place-items:center;background:#c88}';
  const { facts } = await captureSep5Draft(await store(header, '', roundel, css));
  expect(facts[0].decorEmoji).toBe(1);
  expect(facts[0].fakeCircle).toBe(1);
});

it('leaves functional glyphs alone: arrows, ticks and close icons are not emoji decoration', () => {
  expect(decorativeEmojiCount(html('<a href="#">Comprar <span>↗</span></a><button aria-label="Cerrar"><span>✖</span></button><li><span>✔</span> Retiro en tienda</li>'))).toBe(0);
});

it('reports text over text, but not wrapped inline text, a fixed bottom nav or a closed menu', async () => {
  const header = '<a href="index.html">Eje</a><a href="buscar.html">Buscar</a><a href="#" data-pagosya-account="login">Mi cuenta</a><button type="button"><span data-cart-count>0</span></button>';
  const ordinary = '<p style="width:300px">Hoy <em>tostamos un lote pequeño de café de los Yungas</em> y lo <strong>entregamos</strong> en tu puerta.</p>'
    + '<nav style="position:fixed;bottom:12px;left:20px"><a href="#">Tienda</a> <a href="#">Carrito</a></nav>'
    + '<div style="position:fixed;inset:0;opacity:0;pointer-events:none"><a href="#">Inicio del menú</a></div><h1>Un título que ocupa la pantalla</h1>'
    + '<p style="height:2000px">Relleno</p>';
  const clean = await captureSep5Draft(await store(header, '', ordinary, 'body{margin:0}'));
  expect(clean.facts.flatMap(fact => fact.overlaps ?? [])).toEqual([]);
  const piled = '<div style="position:relative;height:120px"><h2 style="position:absolute;top:0;left:0;margin:0">Una pausa con pulso</h2><p style="position:absolute;top:4px;left:8px;margin:0">Explorar la selección ahora</p></div>';
  const bad = await captureSep5Draft(await store(header, '', piled, 'body{margin:0}'));
  expect(bad.facts[0].overlaps?.length).toBeGreaterThan(0);
});

it('measures the h1 and body sizes and the page text for the playbook checks', async () => {
  const header = '<a href="index.html">Eje</a><a href="buscar.html">Buscar</a><a href="#" data-pagosya-account="login">Mi cuenta</a><button type="button"><span data-cart-count>0</span></button>';
  const { facts } = await captureSep5Draft(await store(header, '', '<h1>Café de altura</h1><p>Abrimos de lunes a sábado de 9:00 a 18:00 en la calle Sagárnaga 215.</p>', 'h1{font-size:140px}p{font-size:15px}'));
  expect(facts[0].h1Size).toBe(140);
  expect(facts[0].bodySize).toBe(15);
  expect(facts[0].pageText).toMatch(/lunes a sábado/);
});

it('reads the largest visible h1, and no h1 as zero', async () => {
  const header = '<a href="index.html">Eje</a><a href="buscar.html">Buscar</a><a href="#" data-pagosya-account="login">Mi cuenta</a><button type="button"><span data-cart-count>0</span></button>';
  const none = await captureSep5Draft(await store(header, '', '<p>Sin título en esta página, solo un párrafo largo para medir.</p>', 'p{font-size:15px}'));
  expect(none.facts[0].h1Size).toBe(0);
  const two = await captureSep5Draft(await store('<h1 class="logo">Eje</h1>' + header, '', '<h1>Café de altura</h1>', '.logo{font-size:20px}main h1{font-size:44px}'));
  expect(two.facts[0].h1Size).toBe(44);
});

// Night run 2026-10-11: two stores padded .menu-item__copy but not the price beside it, so the price sat on the card edge.
it('counts product cards whose price is not aligned with the product name', async () => {
  const header = '<a href="index.html">Nube</a><a href="buscar.html">Buscar</a><a href="#" data-pagosya-account="login">Mi cuenta</a><button type="button"><span data-cart-count>0</span></button>';
  const card = '<article class="menu-item"><div class="menu-item__copy"><h3>Bocha simple</h3><p>Helado artesanal.</p></div><strong class="menu-item__price">Bs 12,00</strong></article>';
  const off = await captureSep5Draft(await store(header, '', card + card, '.menu-item{width:300px}.menu-item__copy{padding:0 80px}'));
  expect(off.facts[0].priceOffset).toBeGreaterThanOrEqual(2);
  const aligned = await captureSep5Draft(await store(header, '', card, '.menu-item{width:300px;padding:0 18px}'));
  expect(aligned.facts[0].priceOffset).toBe(0);
  expect(sep5MeasuredFacts([{ ...aligned.facts[0], priceOffset: 2 }]).join(' ')).toMatch(/precio.*no está alineado/);
});

// Night run 2026-10-11: authors pad .menu-item__copy and forget the price beside it; the kit lines it up itself.
it('lines the kit-rendered price up with the product name when only the copy is padded', async () => {
  const header = '<a href="index.html">Nube</a><a href="buscar.html">Buscar</a><a href="#" data-pagosya-account="login">Mi cuenta</a><button type="button"><span data-cart-count>0</span></button>';
  const { facts } = await captureSep5Draft(await store(header, '', '', '.menu-item{width:300px}.menu-item__copy{padding:0 18px}'));
  expect(facts[0].priceOffset).toBe(0);
});

// Night run 2026-10-11 (Nutrimar): the split DNA drew a "+" cell after the card button, but the kit's card button is an
// icon-only "+" already, so the card read "+ | +". The kit gives such a button its word label, the shape the author drew for.
it('labels an icon-only card add button that the store decorates with its own symbol cell', async () => {
  const { facts } = await captureSep5Draft(await store(completeHeader, '', '', '.menu-add{display:flex;justify-content:space-between}.menu-add::after{content:"+";padding-left:12px;border-left:1px solid}'));
  expect(facts[0].addSymbolTwice).toBe(0);
  expect(facts[0].pageText).toContain('Añadir');
  expect(sep5MeasuredFacts([{ ...facts[0], addSymbolTwice: 1 }]).join(' ')).toMatch(/botón de añadir.*símbolo/);
});

it('leaves an icon-only card add button without decoration as the icon', async () => {
  const { facts } = await captureSep5Draft(await store(completeHeader, '', '', '.menu-add{display:flex}'));
  expect(facts[0].addSymbolTwice).toBe(0);
  expect(facts[0].pageText).not.toContain('Añadir');
});

// Night run 2026-10-11 (Estudio Eje): a photo bled to the card edges with negative margins, capped by a reset's
// img{max-width:100%}, stopped 53px short of the right edge. The kit lets a bleeding card photo reach both edges.
it('lets a card photo bled with negative margins reach both card edges', async () => {
  const photo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#c96"/></svg>');
  const card = `<article class="menu-item"><img class="menu-item__image" src="${photo}" alt=""><div class="menu-item__copy"><h3>Clase</h3></div></article>`;
  const { facts } = await captureSep5Draft(await store(completeHeader, '', card, 'img{max-width:100%}.menu-item{display:flex;flex-direction:column;width:300px;padding:0 24px}.menu-item__image{width:calc(100% + 48px);height:160px;margin:0 -24px;object-fit:cover}'));
  expect(facts[0].narrowPhoto).toBe(0);
  expect(sep5MeasuredFacts([{ ...facts[0], narrowPhoto: 2 }]).join(' ')).toMatch(/foto.*más angosta/);
});
