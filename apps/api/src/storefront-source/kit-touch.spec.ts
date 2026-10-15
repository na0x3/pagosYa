// apps/api/src/storefront-source/kit-touch.spec.ts
import { carriedTouch, chatTouchKept, distinctiveCss, instructionConcernsKitSurfaces, kitTouchPrompt, pickTouch, runKitTouch, touchBudgetMs, TOUCH_KEYS } from './kit-touch';
import { readConfigFile } from './store-look';

const files = [
  { path: 'index.html', content: '<main></main>' },
  { path: 'styles.css', content: '.stamp{transform:rotate(-8deg);border:3px double #111}.plain{color:red}.photo::after{content:"";background:linear-gradient(#0000,#0003)}@keyframes wobble{from{rotate:-1deg}to{rotate:1deg}}' },
  { path: 'commerce-pages.css', content: '.kit{transform:scale(2)}' },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"cafe","dna":{"version":1},"look":{"version":1,"edge":"offset"}};\n' },
];
const reply = (value: Record<string, unknown>) => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ product: '', catalog: '', card: '', cart: '', notes: [], ...value }) }] }] });
const deps = (body: unknown, over: Record<string, unknown> = {}) => {
  const used = jest.fn();
  return { used, deps: { files, brief: {}, storeName: 'Café', signal: new AbortController().signal, call: jest.fn(async () => ({ body, used })), capture: jest.fn(async () => []),
    checkProduct: jest.fn(async () => []), checkSurfaces: jest.fn(async () => ({ catalog: [], card: [], cart: [] })), ...over } };
};

describe('distinctiveCss', () => {
  it('keeps the authored rules that carry a device, never platform CSS', () => {
    const css = distinctiveCss(files);
    expect(css).toContain('.stamp');
    expect(css).toContain('::after');
    expect(css).toContain('@keyframes wobble');
    expect(css).not.toContain('.plain');
    expect(css).not.toContain('.kit');
  });
});

describe('kitTouchPrompt', () => {
  it("names every surface's parts, the protected controls and the merchant request", () => {
    const text = kitTouchPrompt({ storeName: 'Café', look: { version: 1, edge: 'offset' }, distinctive: '.stamp{}', instruction: 'fotos inclinadas' });
    for (const word of ['card-media', 'cart-line', 'page-title', 'gallery', 'protected', 'transform', 'fotos inclinadas', '"edge":"offset"']) expect(text).toContain(word);
    expect(text.split('\n').find(line => line.startsWith('- card parts'))).toContain('transform');
    expect(text.split('\n').find(line => line.startsWith('- catalog parts'))).toContain('transform');
  });
});

describe('runKitTouch', () => {
  it("sanitizes, checks and returns each surface's CSS, and leaves billing to the caller (it returns `used`)", async () => {
    const { deps: d, used } = deps(reply({ card: '[data-part="card-media"]{transform:rotate(-2deg)}', cart: '[data-part="cart-head"]{border-bottom:3px solid #111}', notes: ['Tarjetas inclinadas como en la portada.'] }));
    const result = (await runKitTouch(d))!;
    expect(result.css.cardCss).toContain('[data-pagosya-catalog] [data-part="card-media"]');
    expect(result.css.cartCss).toContain('.cart-drawer [data-part="cart-head"]');
    expect(result.notes).toEqual(['Tarjetas inclinadas como en la portada.']);
    // The caller may still discard the CSS (the agent's theme wins), so the touch never bills itself.
    expect(used).not.toHaveBeenCalled();
    result.used();
    expect(used).toHaveBeenCalledTimes(1);
    const checked = (d.checkSurfaces as jest.Mock).mock.calls[0][0];
    expect(readConfigFile(checked.files).dna.cardCss).toBe(result.css.cardCss);
  });

  it('drops only the surface that fails its browser check', async () => {
    const { deps: d } = deps(reply({ card: '[data-part="card-media"]{transform:rotate(-2deg)}', cart: '[data-part="cart-head"]{border-bottom:3px solid #111}' }),
      { checkSurfaces: jest.fn(async () => ({ catalog: [], card: [{ control: 'add', viewport: 'mobile', reason: 'covered by another element' }], cart: [] })) });
    const result = (await runKitTouch(d))!;
    expect(result.css.cardCss).toBeUndefined();
    expect(result.css.cartCss).toBeDefined();
    expect(result.dropped).toEqual([{ surface: 'card', reason: 'add (mobile): covered by another element' }]);
  });

  it('returns null for an answer that is not the schema, and never marks it used', async () => {
    const { deps: d, used } = deps({ status: 'completed', output: [{ content: [{ type: 'output_text', text: 'no' }] }] });
    expect(await runKitTouch(d)).toBeNull();
    expect(used).not.toHaveBeenCalled();
  });

  it('returns empty CSS when the sanitizer leaves nothing', async () => {
    const { deps: d, used } = deps(reply({ card: '.menu-add{opacity:0}' }));
    const result = (await runKitTouch(d))!;
    expect(result.css).toEqual({});
    expect(used).not.toHaveBeenCalled();
  });
});

describe('carriedTouch', () => {
  const dna = { version: 1, touch: 1, productCss: 'a', cardCss: 'b', cartCss: '', swatch: 'pill' };
  it('carries the touch across an ordinary edit', () => expect(carriedTouch(dna, false)).toEqual({ touch: 1, [TOUCH_KEYS.product]: 'a', [TOUCH_KEYS.card]: 'b' }));
  it('never carries it into a new store or a redesign', () => expect(carriedTouch(dna, true)).toEqual({}));
  it('carries nothing that the touch step did not write', () => expect(carriedTouch({ productCss: 'planner' }, false)).toEqual({}));
});

describe('instructionConcernsKitSurfaces', () => {
  it.each([
    ['Pon las fotos de los productos inclinadas', true], ['El carrito con un sello como en la portada', true], ['Cambia el catálogo', true],
    ['La página de producto más parecida a la portada', true], ['Las tarjetas de producto con sombra', true],
    ['Cambia el título del inicio', false], ['Agrega mi horario', false],
    ['Cambia el ícono del carrito', false], ['Un botón del carrito más grande', false], ['El carrito del encabezado en negro', false], ['El carrito del header más pequeño', false], ['El carrito del menú', false],
    ['El ícono del carrito y las tarjetas de producto', true], ['Cambia el carrito', true],
    ['Los botones del carrito más grandes', false], ['El carrito en el encabezado más pequeño', false], ['Pon el carrito en el menú', false], ['El carrito en el header', false], ['El carrito en la barra', false],
    ['Los botones del carrito y el catálogo', true],
    ['Haz el carrito como una taza', false], ['El carrito en forma de canasta', false],
    // Review CD fix 1: the same header-cart phrases as the controls classifier, never past a second «carrito».
    ['El carrito con un ícono de canasta', false], ['El contador del carrito en rojo', false],
    ['Haz el carrito como una taza y que el carrito muestre el envío', true], ['El carrito como una taza, y la página del carrito más clara', true],
  ])('%s → %s', (text, expected) => expect(instructionConcernsKitSurfaces(text)).toBe(expected));

  it("reads only the merchant's own words after the marker", () => {
    expect(instructionConcernsKitSurfaces('Resumen: tienda con carrito.\nPedido actual del comercio: cambia el título')).toBe(false);
  });
});

describe('touchBudgetMs', () => {
  it.each([[600_000, 150_000], [210_000, 150_000], [150_000, 90_000], [120_000, 60_000], [119_999, 0], [0, 0], [-5, 0]])('%d ms left → %d', (left, budget) => expect(touchBudgetMs(left)).toBe(budget));
  // The review stage keeps 90 s for its own save (N+1).
  it.each([[600_000, 150_000], [240_000, 150_000], [200_000, 110_000], [150_000, 60_000], [149_999, 0]])('%d ms left with a 90 s margin → %d', (left, budget) => expect(touchBudgetMs(left, 90_000)).toBe(budget));
});

describe('chatTouchKept (the chat re-run after the agent theme)', () => {
  const css = { productCss: 'p', cardCss: 'c', cartCss: 't' };
  it('keeps every surface and bills when no agent theme was set', () => expect(chatTouchKept(css, undefined)).toEqual({ css, bill: true }));
  it('drops the surfaces the agent set (and the product page) and bills for what is left', () =>
    expect(chatTouchKept(css, { cardCss: 'agent' })).toEqual({ css: { cartCss: 't' }, bill: true }));
  it('bills nothing when the agent set every surface the touch wrote', () =>
    expect(chatTouchKept({ productCss: 'p', cardCss: 'c' }, { cardCss: 'agent' })).toEqual({ css: {}, bill: false }));
  it('bills nothing for an empty touch', () => expect(chatTouchKept({}, undefined)).toEqual({ css: {}, bill: false }));
});

it('pickTouch keeps only non-empty touch fields', () => expect(pickTouch({ swatch: 'pill', cardCss: 'x', cartCss: '' })).toEqual({ cardCss: 'x' }));
