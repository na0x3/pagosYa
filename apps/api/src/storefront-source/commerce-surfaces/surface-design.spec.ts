import { PREMIUM_CARD, PREMIUM_PRODUCT_PAGE, PREMIUM_TYPE_AND_MOTION, SURFACES_SCHEMA, parseSurfacesAnswer, surfacesPrompt } from './surface-design';

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
    // The rules the static check enforces are in the prompt, so a design is not lost to them (live run, review I8/I9).
    expect(text).toContain('photo and image slots on an <img>');
    expect(text).toContain("every CSS selector uses one of your template's own classes");
    expect(text).toContain('under 14,000 characters');
    expect(text).toContain('no <form>, <input>, <iframe> or <style> inside the template');
  });
  // Live 2026-10-15: told the platform fills «buy and pay buttons» and every slot stays empty, YAPI left the card's link and
  // add button empty. The controls are not slots: the template writes their words.
  it('tells the designer to write the words of the controls it owns', () => {
    const text = surfacesPrompt({ storeName: 'x', kind: 'general', tokens: '', dna: {}, parts: ['card', 'cart', 'added'] });
    expect(text).toMatch(/data-product-add[^.]*data-product-link|data-product-link[^.]*data-product-add/);
    expect(text).toContain('data-cart-close');
    expect(text).toContain('data-cart-open');
    expect(text).toMatch(/never leave a control empty/i);
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
  // Live 2026-10-17: «no digits in CSS content» was read as «no numbers in the CSS»: thin, small, xxx-large, aspect-ratio:portrait
  // and invented --brand-space tokens left baek's product page with no spacing at all.
  it('limits the no-digits rule to content: and asks for real CSS values and only the listed tokens', () => {
    const text = surfacesPrompt({ storeName: 'x', kind: 'general', tokens: 'accent: #836345', dna: {}, parts: ['productPage'] });
    expect(text).not.toContain('no digits in CSS content');
    expect(text).toMatch(/never a digit inside a CSS content: property/i);
    expect(text).toMatch(/real CSS values[^.]*px/);
    expect(text).toMatch(/only the var\(\) tokens listed under Store tokens/i);
    expect(text).toMatch(/max-width and side padding/);
  });
});

describe('premium anatomy (2026-10-19, the Amboras references)', () => {
  it('asks for the atelier product page, the premium card and the type and motion rules only when those parts are drawn', () => {
    const base = { storeName: 'Mezcla Ya', kind: 'general', tokens: '', dna: {} };
    const page = surfacesPrompt({ ...base, parts: ['productPage', 'card'] });
    expect(page).toContain(PREMIUM_PRODUCT_PAGE);
    expect(page).toContain(PREMIUM_CARD);
    expect(page).toContain(PREMIUM_TYPE_AND_MOTION);
    const cart = surfacesPrompt({ ...base, parts: ['cart'] });
    expect(cart).not.toContain(PREMIUM_PRODUCT_PAGE);
    expect(cart).not.toContain(PREMIUM_TYPE_AND_MOTION);
  });
});
