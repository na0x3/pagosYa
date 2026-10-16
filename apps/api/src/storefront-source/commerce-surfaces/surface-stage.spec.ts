import { readTemplatesFile } from './surface-parts';
import { runCommerceSurfaces, SURFACES_ALL_NOTE, SURFACES_FAILED_NOTE } from './surface-stage';

/** Same fake model body as store-controls-design.spec.ts. */
const reply = (value: unknown) => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }] });
const T = {
  cart: '<template data-pagosya-cart-template><div><button data-cart-close>×</button><div data-cart-slot="lines"></div><div data-cart-slot="total"></div><div data-cart-slot="action"></div></div></template>',
  added: '<template data-pagosya-added-template><div><span data-added-field="message"></span><button data-cart-open>Ver</button></div></template>',
};
const answer = (parts: Array<{ part: string; html: string }>) => reply({ parts: parts.map(p => ({ css: '', ...p })), note: 'Diseñé tu carrito.' });
const base = { files: [{ path: 'index.html', content: '<html><body></body></html>' }], brief: {}, storeName: 'Raíz Viva', kind: 'general', signal: new AbortController().signal, capture: async () => [] };

describe('runCommerceSurfaces (spec 2026-10-15)', () => {
  it('keeps every part that passes first time and bills the call', async () => {
    const used = jest.fn();
    const out = await runCommerceSurfaces({ ...base, parts: ['cart', 'added'], call: async () => ({ body: answer([{ part: 'cart', html: T.cart }, { part: 'added', html: T.added }]), used }), check: async () => ({ failures: [] }) });
    expect(out.report).toEqual([{ part: 'cart', status: 'passed' }, { part: 'added', status: 'passed' }]);
    expect(readTemplatesFile(out.file!).map(t => t.part)).toEqual(['cart', 'added']);
    expect(out.note).toBe(SURFACES_ALL_NOTE);
    expect(used).toHaveBeenCalled();
  });
  it('repairs only the failing part and freezes the one that passed', async () => {
    const calls: string[] = []; let round = 0;
    const out = await runCommerceSurfaces({ ...base, parts: ['cart', 'added'],
      call: async text => { calls.push(text); round++; return { body: answer(round === 1 ? [{ part: 'cart', html: T.cart }, { part: 'added', html: T.added }] : [{ part: 'cart', html: T.cart.replace('<div>', '<div class="b">') }]), used: () => {} }; },
      check: async files => ({ failures: files.find(f => f.path === 'commerce-templates.json')!.content.includes('class=\\"b\\"') ? [] : [{ part: 'cart', check: 'checkout-action', detail: 'No se ve el botón para continuar al pago.' }] }) });
    expect(out.report).toEqual([{ part: 'cart', status: 'repaired' }, { part: 'added', status: 'passed' }]);
    expect(calls[1]).toContain('No se ve el botón para continuar al pago.');
    expect(calls[1]).toContain('Already approved (do not return): added');
  });
  it('drops a part that still fails after two repairs, keeps the rest and offers to retry it', async () => {
    const out = await runCommerceSurfaces({ ...base, parts: ['cart', 'added'],
      call: async () => ({ body: answer([{ part: 'cart', html: T.cart }, { part: 'added', html: T.added }]), used: () => {} }),
      check: async () => ({ failures: [{ part: 'cart', check: 'checkout-action', detail: 'x' }] }) });
    expect(out.report).toEqual([{ part: 'cart', status: 'fallback', failed: 'checkout-action' }, { part: 'added', status: 'passed' }]);
    expect(readTemplatesFile(out.file!).map(t => t.part)).toEqual(['added']);
    expect(out.note).toBe('El carrito no pasó la prueba de compra, así que usa el diseño estándar por ahora.');
    expect(out.retry).toEqual([{ label: 'Reintentar el carrito', value: 'Rediseña el carrito de mi tienda.' }]);
  });
  it('treats a statically invalid part like any failure and repairs it', async () => {
    let round = 0;
    const out = await runCommerceSurfaces({ ...base, parts: ['cart'],
      call: async () => ({ body: answer([{ part: 'cart', html: round++ ? T.cart : T.cart.replace('<div data-cart-slot="total"></div>', '') }]), used: () => {} }),
      check: async () => ({ failures: [] }) });
    expect(out.report).toEqual([{ part: 'cart', status: 'repaired' }]);
  });
  it('fails whole without a file when the call throws', async () => {
    const out = await runCommerceSurfaces({ ...base, parts: ['cart'], call: async () => { throw new Error('timeout'); }, check: async () => ({ failures: [] }) });
    expect(out).toEqual({ report: [], note: SURFACES_FAILED_NOTE, retry: [], failed: 'timeout' });
  });
  it('keeps the store’s approved parts when only one part is requested', async () => {
    const out = await runCommerceSurfaces({ ...base, parts: ['cart'], keep: [{ part: 'added', html: T.added, css: '' }],
      call: async () => ({ body: answer([{ part: 'cart', html: T.cart }]), used: () => {} }), check: async () => ({ failures: [] }) });
    expect(readTemplatesFile(out.file!).map(t => t.part).sort()).toEqual(['added', 'cart']);
  });
});
