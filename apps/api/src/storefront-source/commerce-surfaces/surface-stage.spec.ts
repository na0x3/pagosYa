import { readTemplatesFile } from './surface-parts';
import { runCommerceSurfaces, SURFACES_ALL_NOTE, SURFACES_FAILED_NOTE } from './surface-stage';

/** Same fake model body as store-controls-design.spec.ts. */
const reply = (value: unknown) => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }] });
const T = {
  cart: '<template data-pagosya-cart-template><div><button data-cart-close>×</button><div data-cart-slot="lines"></div><div data-cart-slot="total"></div><div data-cart-slot="action"></div></div></template>',
  added: '<template data-pagosya-added-template><div><span data-added-field="message"></span><button data-cart-open>Ver</button></div></template>',
};
const answer = (parts: Array<{ part: string; html: string }>) => reply({ parts: parts.map(p => ({ css: '', ...p })), note: 'Diseñé tu carrito.' });
const ALL = ['card', 'productPage', 'cart', 'cartLine', 'added', 'checkout'] as any[];
const base = { files: [{ path: 'index.html', content: '<html><body></body></html>' }], brief: {}, storeName: 'Raíz Viva', kind: 'general', signal: new AbortController().signal, capture: async () => [] };

describe('runCommerceSurfaces (spec 2026-10-15)', () => {
  it('keeps every part that passes first time and bills the call', async () => {
    const used = jest.fn();
    const out = await runCommerceSurfaces({ ...base, parts: ['cart', 'added'], call: async () => ({ body: answer([{ part: 'cart', html: T.cart }, { part: 'added', html: T.added }]), used }), check: async () => ({ failures: [], reached: ALL }) });
    expect(out.report).toEqual([{ part: 'cart', status: 'passed' }, { part: 'added', status: 'passed' }]);
    expect(readTemplatesFile(out.file!).map(t => t.part)).toEqual(['cart', 'added']);
    expect(out.note).toBe(SURFACES_ALL_NOTE);
    expect(used).toHaveBeenCalled();
  });
  it('repairs only the failing part and freezes the one that passed', async () => {
    const calls: string[] = []; let round = 0;
    const out = await runCommerceSurfaces({ ...base, parts: ['cart', 'added'],
      call: async text => { calls.push(text); round++; return { body: answer(round === 1 ? [{ part: 'cart', html: T.cart }, { part: 'added', html: T.added }] : [{ part: 'cart', html: T.cart.replace('<div>', '<div class="b">') }]), used: () => {} }; },
      check: async files => ({ failures: files.find(f => f.path === 'commerce-templates.json')!.content.includes('class=\\"b\\"') ? [] : [{ part: 'cart', check: 'checkout-action', detail: 'No se ve el botón para continuar al pago.' }], reached: ALL }) });
    expect(out.report).toEqual([{ part: 'cart', status: 'repaired' }, { part: 'added', status: 'passed' }]);
    expect(calls[1]).toContain('No se ve el botón para continuar al pago.');
    expect(calls[1]).toContain('Already approved (do not return): added');
  });
  it('drops a part that still fails after two repairs, keeps the rest and offers to retry it', async () => {
    const out = await runCommerceSurfaces({ ...base, parts: ['cart', 'added'],
      call: async () => ({ body: answer([{ part: 'cart', html: T.cart }, { part: 'added', html: T.added }]), used: () => {} }),
      check: async () => ({ failures: [{ part: 'cart', check: 'checkout-action', detail: 'x' }], reached: ALL }) });
    expect(out.report).toEqual([{ part: 'cart', status: 'fallback', failed: 'checkout-action' }, { part: 'added', status: 'passed' }]);
    expect(readTemplatesFile(out.file!).map(t => t.part)).toEqual(['added']);
    expect(out.note).toBe('El carrito no pasó la prueba de compra, así que usa el diseño estándar por ahora.');
    expect(out.retry).toEqual([{ label: 'Reintentar el carrito', value: 'Rediseña el carrito de mi tienda.' }]);
  });
  it('treats a statically invalid part like any failure and repairs it', async () => {
    let round = 0;
    const out = await runCommerceSurfaces({ ...base, parts: ['cart'],
      call: async () => ({ body: answer([{ part: 'cart', html: round++ ? T.cart : T.cart.replace('<div data-cart-slot="total"></div>', '') }]), used: () => {} }),
      check: async () => ({ failures: [], reached: ALL }) });
    expect(out.report).toEqual([{ part: 'cart', status: 'repaired' }]);
  });
  it('fails whole without a file when the call throws', async () => {
    const out = await runCommerceSurfaces({ ...base, parts: ['cart'], call: async () => { throw new Error('timeout'); }, check: async () => ({ failures: [], reached: ALL }) });
    expect(out).toEqual({ report: [], note: SURFACES_FAILED_NOTE, retry: [], failed: 'timeout' });
  });
  it('keeps the store’s approved parts when only one part is requested', async () => {
    const out = await runCommerceSurfaces({ ...base, parts: ['cart'], keep: [{ part: 'added', html: T.added, css: '' }],
      call: async () => ({ body: answer([{ part: 'cart', html: T.cart }]), used: () => {} }), check: async () => ({ failures: [], reached: ALL }) });
    expect(readTemplatesFile(out.file!).map(t => t.part).sort()).toEqual(['added', 'cart']);
  });
  it('its own deadline fails the stage, never the run (review C1)', async () => {
    const timedOut = AbortSignal.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    const out = await runCommerceSurfaces({ ...base, signal: timedOut, cancel: new AbortController().signal, parts: ['cart'], call: async () => { throw new Error('timeout'); }, check: async () => ({ failures: [], reached: ALL }) });
    expect(out.file).toBeUndefined();
    expect(out.note).toBe(SURFACES_FAILED_NOTE);
  });
  it('a cancelled run still propagates (review C1)', async () => {
    const run = new AbortController(); run.abort();
    await expect(runCommerceSurfaces({ ...base, signal: run.signal, cancel: run.signal, parts: ['cart'], call: async () => ({ body: answer([{ part: 'cart', html: T.cart }]), used: () => {} }), check: async () => ({ failures: [], reached: ALL }) })).rejects.toBeDefined();
  });
  it('re-checks a part the purchase never reached instead of freezing it as passed (review I4)', async () => {
    const asked: string[] = []; let round = 0;
    const card = '<template data-pagosya-product-template><article><h3 data-product-field="name"></h3><p data-product-field="price"></p><a data-product-link href="#">Ver</a><button data-product-add>Agregar</button></article></template>';
    const out = await runCommerceSurfaces({ ...base, parts: ['card', 'cart'],
      call: async text => { asked.push(text.slice(text.indexOf('Parts to design now:'), text.indexOf('Parts to design now:') + 200)); round++; return { body: answer(round === 1 ? [{ part: 'card', html: card }, { part: 'cart', html: T.cart }] : [{ part: 'card', html: card.replace('<article>', '<article class="b">') }]), used: () => {} }; },
      check: async files => files.find(f => f.path === 'commerce-templates.json')!.content.includes('class=\\"b\\"')
        // Once the card works the purchase reaches the cart, whose checkout action is broken.
        ? { failures: [{ part: 'cart', check: 'checkout-action', detail: 'y' }], reached: ['card', 'cart'] as any }
        : { failures: [{ part: 'card', check: 'add', detail: 'x' }], reached: ['card'] as any } });
    expect(out.report).toEqual([{ part: 'card', status: 'repaired' }, { part: 'cart', status: 'fallback', failed: 'checkout-action' }]);
    // Round 2 redesigns only the card; the untested cart is carried, not redesigned.
    expect(asked[1]).toContain('- card');
    expect(asked[1]).not.toContain('- cart');
  });
  it('checks once more after a blocking part falls back, and drops what is still unreached (review I4)', async () => {
    const card = '<template data-pagosya-product-template><article><h3 data-product-field="name"></h3><p data-product-field="price"></p><a data-product-link href="#">Ver</a><button data-product-add>Agregar</button></article></template>';
    const out = await runCommerceSurfaces({ ...base, parts: ['card', 'cart', 'added'],
      call: async () => ({ body: answer([{ part: 'card', html: card }, { part: 'cart', html: T.cart }, { part: 'added', html: T.added }]), used: () => {} }),
      check: async files => {
        const file = files.find(f => f.path === 'commerce-templates.json')!.content;
        return file.includes('data-pagosya-product-template') ? { failures: [{ part: 'card', check: 'add', detail: 'x' }], reached: ['card'] as any } : { failures: [], reached: ['card', 'cart'] as any };
      } });
    expect(out.report).toEqual([{ part: 'card', status: 'fallback', failed: 'add' }, { part: 'cart', status: 'passed' }, { part: 'added', status: 'fallback', failed: 'unreached' }]);
  });
  it('keeps the parts on an empty catalog (Review Focus 1)', async () => {
    const out = await runCommerceSurfaces({ ...base, parts: ['cart'], call: async () => ({ body: answer([{ part: 'cart', html: T.cart }]), used: () => {} }), check: async () => ({ failures: [], reached: [], skipped: 'empty catalog' as const }) });
    expect(out.report).toEqual([{ part: 'cart', status: 'passed' }]);
  });
  it('a failed part request keeps the part the store already had (review I5)', async () => {
    const old = { part: 'cart' as const, html: T.cart.replace('<div>', '<div class="antes">'), css: '.antes{}' };
    const out = await runCommerceSurfaces({ ...base, parts: ['cart'], keep: [old, { part: 'added', html: T.added, css: '' }],
      call: async () => ({ body: answer([{ part: 'cart', html: T.cart }]), used: () => {} }),
      check: async () => ({ failures: [{ part: 'cart', check: 'checkout-action', detail: 'x' }], reached: ALL }) });
    expect(readTemplatesFile(out.file!)).toEqual(expect.arrayContaining([old]));
    expect(out.note).toBe('El carrito no pasó la prueba de compra, así que se queda como estaba.');
    expect(out.report).toEqual([{ part: 'cart', status: 'fallback', failed: 'checkout-action' }]);
  });
  it('a part request says what it redesigned, never the full list (review I10)', async () => {
    const line = '<template data-pagosya-cart-line-template><li><h3 data-cart-field="name"></h3><div data-cart-field="quantity"></div><strong data-cart-field="line-total"></strong></li></template>';
    const ok = await runCommerceSurfaces({ ...base, parts: ['cart', 'cartLine'], instruction: 'haz el carrito más bonito',
      call: async () => ({ body: answer([{ part: 'cart', html: T.cart }, { part: 'cartLine', html: line }]), used: () => {} }), check: async () => ({ failures: [], reached: ALL }) });
    expect(ok.note).toBe('Rediseñé el carrito y las líneas del carrito.');
    const kept = await runCommerceSurfaces({ ...base, parts: ['cart', 'cartLine'], instruction: 'haz el carrito más bonito', keep: [{ part: 'cart', html: T.cart, css: '' }, { part: 'cartLine', html: line, css: '' }],
      call: async () => ({ body: answer([{ part: 'cart', html: T.cart }, { part: 'cartLine', html: line }]), used: () => {} }), check: async () => ({ failures: [{ part: 'cart', check: 'open', detail: 'x' }, { part: 'cartLine', check: 'quantity', detail: 'y' }], reached: ALL }) });
    expect(kept.note).toBe('El carrito y las líneas del carrito no pasaron la prueba de compra, así que se quedan como estaban.');
  });
  it('keeps each round’s failures for the build record (live run: the report alone could not say why parts fell back)', async () => {
    const out = await runCommerceSurfaces({ ...base, parts: ['cart'],
      call: async () => ({ body: answer([{ part: 'cart', html: T.cart }]), used: () => {} }),
      check: async () => ({ failures: [{ part: 'cart', check: 'checkout-action', detail: 'No se ve el botón para continuar al pago.' }], reached: ALL }) });
    expect(out.rounds).toHaveLength(3);
    expect(out.rounds![0]).toEqual({ round: 0, failures: [{ part: 'cart', check: 'checkout-action', detail: 'No se ve el botón para continuar al pago.' }] });
  });
});
