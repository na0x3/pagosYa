import { SURFACE_PARTS, composeTemplatesFile, readTemplatesFile, validateSurfaceTemplate, type SurfaceTemplate } from './surface-parts';

const CART: SurfaceTemplate = { part: 'cart', css: '.canasta{display:grid;gap:12px}', html: '<template data-pagosya-cart-template><div class="canasta"><button data-cart-close>×</button><div data-cart-slot="lines"></div><div data-cart-slot="total"></div><div data-cart-slot="action"></div></div></template>' };
const CARD: SurfaceTemplate = { part: 'card', css: '', html: '<template data-pagosya-product-template><article><img data-product-field="image" alt=""><h3 data-product-field="name"></h3><p data-product-field="price"></p><a data-product-link href="#">Ver</a><button data-product-add>Agregar</button></article></template>' };

describe('surface parts (spec 2026-10-15)', () => {
  it('accepts a template with its required slots and controls', () => {
    expect(validateSurfaceTemplate(CART)).toEqual([]);
    expect(validateSurfaceTemplate(CARD)).toEqual([]);
  });
  it('names every missing required slot or control', () => {
    expect(validateSurfaceTemplate({ ...CART, html: CART.html.replace('<div data-cart-slot="total"></div>', '').replace('<button data-cart-close>×</button>', '') }))
      .toEqual(['Falta el espacio «total» en carrito.', 'Falta el control button[data-cart-close] en carrito.']);
  });
  it('rejects scripts, handlers, javascript: links, typed prices, two roots and unsafe css', () => {
    const bad = (html: string, css = '') => validateSurfaceTemplate({ part: 'card', html, css });
    expect(bad(CARD.html.replace('</article>', '<script>x()</script></article>'))).toContain('Las plantillas no llevan scripts.');
    expect(bad(CARD.html.replace('<article>', '<article onclick="x()">'))).toContain('Las plantillas no llevan atributos on*.');
    expect(bad(CARD.html.replace('href="#"', 'href="javascript:x()"'))).toContain('Las plantillas no llevan enlaces javascript:.');
    expect(bad(CARD.html.replace('<p data-product-field="price"></p>', '<p data-product-field="price"></p><span>Bs 45</span>'))).toContain('Las plantillas no escriben precios: «Bs 45».');
    expect(bad(CARD.html.replace('</article>', '</article><div></div>'))).toContain('La plantilla de tarjetas de producto necesita un solo elemento raíz.');
    expect(bad(CARD.html, '@import url(x.css);')).toContain('El CSS no puede importar hojas ni cargar URLs externas.');
    expect(bad(CARD.html, '.a{background:url(https://x.test/a.png)}')).toContain('El CSS no puede importar hojas ni cargar URLs externas.');
  });
  it('composes and reads back the templates file per part, and reads a broken file as empty', () => {
    expect(readTemplatesFile(composeTemplatesFile([CART, CARD]))).toEqual([CART, CARD]);
    expect(readTemplatesFile('<html>')).toEqual([]);
    expect(readTemplatesFile(JSON.stringify({ version: 1, parts: [{ part: 'nope', html: '', css: '' }] }))).toEqual([]);
    expect(SURFACE_PARTS).toHaveLength(6);
  });
});
