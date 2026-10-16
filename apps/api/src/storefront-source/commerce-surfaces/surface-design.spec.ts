import { SURFACES_SCHEMA, parseSurfacesAnswer, surfacesPrompt } from './surface-design';

/** Same fake model body as store-controls-design.spec.ts. */
const reply = (value: unknown) => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }] });
const cart = { part: 'cart', html: '<template data-pagosya-cart-template><div><button data-cart-close>×</button><div data-cart-slot="lines"></div><div data-cart-slot="total"></div><div data-cart-slot="action"></div></div></template>', css: '.x{}' };

describe('surfaces call (spec 2026-10-15)', () => {
  it('asks only for the requested parts, with their slot contracts and the store language', () => {
    const text = surfacesPrompt({ storeName: 'Raíz Viva', kind: 'general', cartWord: 'Tu pedido', tokens: '--store-accent:#b5462a', dna: { button: 'pill' }, parts: ['cart', 'cartLine'] });
    expect(text).toContain('data-pagosya-cart-template');
    expect(text).toContain('data-cart-field');
    expect(text).not.toContain('data-pagosya-checkout-template');
    expect(text).toContain('«Tu pedido»');
    expect(text).toContain('--store-accent:#b5462a');
    expect(text).toContain('never type a price');
  });
  it('gives a repair the failed checks and the previous template, and lists frozen parts as context only', () => {
    const text = surfacesPrompt({ storeName: 'x', kind: 'general', tokens: '', dna: {}, parts: ['cart'], keep: [{ part: 'card', html: '<template data-pagosya-product-template><i></i></template>', css: '' }], repair: { previous: [cart as any], failures: [{ part: 'cart', check: 'checkout-action', detail: 'No se ve el botón para continuar al pago.' }] } });
    expect(text).toContain('No se ve el botón para continuar al pago.');
    expect(text).toContain('data-cart-slot="lines"');
    expect(text).toContain('Already approved (do not return): card');
  });
  it('parses only requested parts and rejects an unreadable answer', () => {
    expect(parseSurfacesAnswer(reply({ parts: [cart], note: 'ok' }), ['cart'])).toEqual([cart]);
    expect(parseSurfacesAnswer(reply({ parts: [cart], note: 'ok' }), ['checkout'])).toEqual([]);
    expect(parseSurfacesAnswer(reply('no es json'), ['cart'])).toBeNull();
    expect(SURFACES_SCHEMA.properties.parts.items.properties.part.enum).toEqual(['card', 'productPage', 'cart', 'cartLine', 'added', 'checkout']);
  });
});
