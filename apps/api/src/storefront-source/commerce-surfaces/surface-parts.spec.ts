import { SURFACE_PARTS, composeTemplatesFile, readTemplatesFile, templatesMarkup, validateSurfaceTemplate, type SurfaceTemplate } from './surface-parts';

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
  it('rejects a part too large for the store file limit, so the templates file always saves (review I8)', () => {
    const big = CARD.html.replace('<h3 data-product-field="name"></h3>', `<h3 data-product-field="name"></h3><p>${'a'.repeat(14_100)}</p>`);
    expect(validateSurfaceTemplate({ ...CARD, html: big })).toContain('La plantilla de tarjetas de producto es demasiado grande.');
    expect(validateSurfaceTemplate({ ...CARD, css: `.a{color:red}${' '.repeat(8_100)}` })).toContain('El CSS de tarjetas de producto es demasiado grande.');
  });
  it('allows only safe tags and attributes, whatever the encoding (review I9)', () => {
    const bad = (html: string) => validateSurfaceTemplate({ part: 'card', html, css: '' });
    const at = (extra: string) => CARD.html.replace('</article>', `${extra}</article>`);
    expect(bad(at('<iframe srcdoc="<script>x()</script>"></iframe>'))).toContain('Las plantillas no llevan <iframe>.');
    expect(bad(at('<form action="https://x.test"><input name="card"></form>'))).toContain('Las plantillas no llevan <form>.');
    expect(bad(at('<style>body{display:none}</style>'))).toContain('Las plantillas no llevan <style>.');
    expect(bad(CARD.html.replace('href="#"', 'href="java&#9;script:x()"'))).toContain('Las plantillas no llevan enlaces javascript:.');
    expect(bad(at('<img src="https://tracker.test/p.gif" alt="">'))).toContain('Las plantillas no cargan imágenes externas.');
    expect(bad(at('<span style="background:url(https://x.test/a.png)">x</span>'))).toContain('El CSS no puede importar hojas ni cargar URLs externas.');
  });
  it('puts the photo and image slots on an <img>, as the runtime requires (live run 2026-10-15)', () => {
    const line = '<template data-pagosya-cart-line-template><li class="l"><div data-cart-field="photo"></div><h3 data-cart-field="name"></h3><div data-cart-field="quantity"></div><strong data-cart-field="line-total"></strong></li></template>';
    expect(validateSurfaceTemplate({ part: 'cartLine', html: line, css: '' })).toContain('El espacio «photo» de líneas del carrito debe ser un <img>.');
    expect(validateSurfaceTemplate({ part: 'cartLine', html: line.replace('<div data-cart-field="photo"></div>', '<img data-cart-field="photo" alt="">'), css: '' })).toEqual([]);
  });
  it('scopes the CSS to the template’s own classes and keeps it inert (review I9)', () => {
    const css = (value: string) => validateSurfaceTemplate({ ...CART, css: value });
    expect(css('.canasta{gap:8px}.canasta button:hover{color:var(--store-accent)}@media (max-width:600px){.canasta{padding:8px}}')).toEqual([]);
    expect(css('body{display:none}')).toContain('El CSS de carrito solo puede usar las clases de su plantilla: «body».');
    expect(css('.canasta,.checkout-button{color:red}')).toContain('El CSS de carrito solo puede usar las clases de su plantilla: «.checkout-button».');
    expect(css('.canasta::after{content:"Bs 9"}')).toContain('El CSS no escribe precios ni números con content.');
    expect(css('.a{}</st</styleyle><img src=x onerror=alert(1)>')).toContain('El CSS no puede llevar «<».');
    expect(templatesMarkup([{ ...CART, css: '.canasta{}</style><img>' }])).not.toContain('</style><img');
  });
});
