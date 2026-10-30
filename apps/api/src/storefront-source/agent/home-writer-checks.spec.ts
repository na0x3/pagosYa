import { chromium, type Browser } from 'playwright';
import { evaluateCalmTitles, evaluateHomeWriterRules, evaluatePlayfulCover, homeWriterVerdict } from './home-writer-checks';

// Spec 2026-10-29 home page writer §3: few checks block, the rest is advice.
jest.setTimeout(60_000);
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });
const rules = async (body: string, width = 1280, check: () => string[] = evaluateHomeWriterRules) => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.setContent(`<!doctype html><html><body style="margin:0;font-family:sans-serif">${body}</body></html>`);
  const out = await page.evaluate(check);
  await page.close();
  return out;
};
const img = (fill: string) => `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23${fill}'/%3E%3C/svg%3E" style="width:300px;height:220px">`;
const product = '<div data-product-id="p1"><a href="product.html?c=p1">Aceite</a></div>';
const blocking = (lines: string[]) => lines.filter(l => l.startsWith('BLOQUEA: '));

describe('evaluateHomeWriterRules', () => {
  it('blocks a near-black band with only words, but not a brand-green one', async () => {
    const black = await rules(`<main><section style="background:#111;color:#fff;height:400px"><h2>Hola</h2></section>${product}</main>`);
    expect(blocking(black).some(l => /banda oscura/i.test(l))).toBe(true);
    const green = await rules(`<main><section style="background:#2d4a2b;color:#fff;height:400px"><h2>Hola</h2></section>${product}</main>`);
    expect(green.some(l => /banda oscura/i.test(l))).toBe(false);
  });
  it('blocks the same photo twice and three photos side by side; product photos do not count', async () => {
    expect(blocking(await rules(`<main><section>${img('111')}</section><section>${img('111')}</section>${product}</main>`)).some(l => /misma foto/i.test(l))).toBe(true);
    expect(blocking(await rules(`<main><section style="display:flex">${img('111')}${img('222')}${img('333')}</section>${product}</main>`)).some(l => /3 fotos o más/i.test(l))).toBe(true);
    expect(blocking(await rules(`<main><div data-pagosya-catalog style="display:flex"><div data-product-id="a">${img('111')}</div><div data-product-id="b">${img('111')}</div><div data-product-id="c">${img('222')}</div></div></main>`))).toEqual([]);
  });
  it('blocks a home with no product; a store with no photos and an empty catalog passes', async () => {
    expect(blocking(await rules('<main><section><h1>Hola</h1></section></main>')).some(l => /ningún producto/i.test(l))).toBe(true);
    expect(blocking(await rules('<main><section><h1 style="font-size:96px">Hola</h1></section><div data-pagosya-catalog></div></main>'))).toEqual([]);
  });
  // Owner 2026-10-29 (DooBoo «Sabores para descubrir»): no section of only words on a plain light background either.
  it('blocks a light section of only words; the cover, FAQ, forms, products and photo sections pass', async () => {
    const cover = '<section><h1 style="font-size:96px">Hola</h1></section>';
    const words = '<section style="height:300px"><h2>Sabores para descubrir</h2><h3>Clásico</h3><p>Gelato de tofu clásico.</p></section>';
    expect(blocking(await rules(`<main>${cover}${words}${product}</main>`)).some(l => /solo texto/i.test(l))).toBe(true);
    const fine = [`<section style="height:300px"><h2>Preguntas</h2><details><summary>¿Envíos?</summary><p>Sí.</p></details></section>`,
      `<section style="height:300px"><h2>Novedades</h2><form><input type="email"></form></section>`,
      `<section style="height:300px"><h2>Historia</h2>${img('444')}<p>Desde 2019.</p></section>`];
    expect(blocking(await rules(`<main>${cover}${fine.join('')}${product}</main>`)).filter(l => /solo texto/i.test(l))).toEqual([]);
    // A band in the brand's colour is not the plain page (owner allowed Amboras's green and ochre bands).
    const tinted = '<section style="height:300px;background:#e3cdd3"><h2>Lo que nos importa</h2><p>Hecho a mano.</p></section>';
    expect(blocking(await rules(`<main>${cover}${tinted}${product}</main>`)).filter(l => /solo texto/i.test(l))).toEqual([]);
    // Esencial paints its full-width bands with border-image, not background-color: the colour is read from either.
    const painted = (colour: string) => `<section style="height:300px;border-image:conic-gradient(${colour} 0 0) fill 0//0 100vw"><h2>Lo que nos importa</h2><p>Hecho a mano.</p></section>`;
    expect(blocking(await rules(`<main>${cover}${painted('#e3cdd3')}${product}</main>`))).toEqual([]);
    expect(blocking(await rules(`<main>${cover}${painted('#111111')}${product}</main>`)).some(l => /banda oscura/i.test(l))).toBe(true);
  });
  it('advises on a small headline and a short page at desktop width only', async () => {
    const small = await rules(`<main><section><h1 style="font-size:40px">Hola</h1></section>${product}</main>`);
    expect(small.some(l => l.startsWith('CONSEJO: ') && /72/.test(l))).toBe(true);
    expect(small.some(l => l.startsWith('CONSEJO: ') && /6 secciones/.test(l))).toBe(true);
    expect((await rules(`<main><section><h1 style="font-size:40px">Hola</h1></section>${product}</main>`, 390)).some(l => /72/.test(l))).toBe(false);
  });
});

describe('homeWriterVerdict', () => {
  it('sorts capture errors into blocking and advice, and drops header and soft lines', () => {
    const v = homeWriterVerdict([
      { width: 1280, errors: ['TypeError: x is undefined', 'Encabezado incompleto: menú no se ve. Vuelve a mostrarlo.', 'Imagen no disponible: assets/a.jpg', 'CONSEJO: Usa 6 secciones o más.', 'BLOQUEA: La misma foto aparece dos veces: a.jpg.', 'Texto encima de un botón: a / b. Muévelo para que no se toquen.'] },
      { width: 390, errors: ['Encabezado: el menú del teléfono está cerrado pero se ve.', 'La página desborda horizontalmente.', 'El catálogo está oculto. Mantén visible data-pagosya-catalog.', 'CONSEJO: Usa 6 secciones o más.'] },
    ]);
    expect(v.blocking).toEqual(['(1280) TypeError: x is undefined', '(1280) Imagen no disponible: assets/a.jpg', '(1280) La misma foto aparece dos veces: a.jpg.', '(390) La página desborda horizontalmente.', '(390) El catálogo está oculto. Mantén visible data-pagosya-catalog.']);
    expect(v.advice).toEqual(['Usa 6 secciones o más.']);
  });
  it('drops the capture\'s own soft lines, even when they mention null or undefined words', () => {
    const v = homeWriterVerdict([{ width: 1280, errors: [
      '[composition:strip-run] 3 franjas que se desplazan seguidas (marquesinas). Deja una sola.',
      '«Hero» es sticky y se desliza sobre las secciones que siguen en su mismo contenedor.',
      'Texto del proceso de diseño visible para compradores.',
      'Texto permanente de catálogo vacío fuera del runtime.',
      'Ilustración sin color visible: assets/a.svg',
    ] }]);
    expect(v).toEqual({ blocking: [], advice: [] });
  });
});

// Live check 2026-10-30: BOXY's cover title was white on its light paper and in capitals; Oh Belly's moving sticker sat below the fold.
describe('the checks added 2026-10-30', () => {
  it('blocks words that do not read on what is behind them, but not words over a photo', async () => {
    const white = await rules(`<main style="background:#ebe6e2"><section style="height:500px"><h1 style="color:#fff">El volumen justo</h1></section>${product}</main>`);
    expect(blocking(white).some(l => /no se lee/.test(l))).toBe(true);
    const ink = await rules(`<main style="background:#ebe6e2"><section style="height:500px"><h1 style="color:#1b1d33">El volumen justo</h1></section>${product}</main>`);
    expect(ink.some(l => /no se lee/.test(l))).toBe(false);
    const overPhoto = await rules(`<main style="background:#ebe6e2"><section style="position:relative;height:500px">${img('333').replace('style="', 'style="position:absolute;inset:0;width:100%;height:100%;')}<h1 style="position:relative;color:#fff">Sobre la foto</h1></section>${product}</main>`);
    expect(overPhoto.some(l => /no se lee/.test(l))).toBe(false);
  });
  it('blocks a calm brand\'s title shown in capitals, written so or by CSS, never a short name', async () => {
    expect(await rules('<main><h1 style="text-transform:uppercase">El volumen justo</h1></main>', 1280, evaluateCalmTitles)).toHaveLength(1);
    expect(await rules('<main><h2>HECHO EN LA PAZ</h2></main>', 1280, evaluateCalmTitles)).toHaveLength(1);
    expect(await rules('<main><h1>El volumen justo</h1><h2>BOXY</h2></main>', 1280, evaluateCalmTitles)).toEqual([]);
  });
  it('a fun store needs a floating or turning piece on the first screen', async () => {
    expect(await rules('<main><section style="height:1000px"><h1>Hola</h1></section><span class="ui-float" style="display:inline-block;width:80px;height:80px"></span></main>', 1280, evaluatePlayfulCover)).toHaveLength(1);
    expect(await rules('<main><section style="height:800px"><h1>Hola</h1><span class="ui-sticker" style="display:inline-block;width:80px;height:80px"></span></section></main>', 1280, evaluatePlayfulCover)).toEqual([]);
  });
});
