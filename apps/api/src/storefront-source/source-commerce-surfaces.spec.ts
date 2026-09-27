import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { kitPath } from '@pagosya/storefront-kit';

/** Sub-project 5: every kit surface takes the store's DNA. jsdom has no layout, so these tests pin
 * the markup, the listeners and the CSS text; the scorecard collector measures the rendered result. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const DNA_VALUES: Record<string, string[]> = runInNewContext(`(${commerce.match(/const DNA_VALUES = (\{[\s\S]*?\n {2}\});/)![1]})`);

type Boot = { w: any; doc: any; close: () => void };
const opened: Boot[] = [];
afterEach(() => { while (opened.length) opened.pop()!.close(); });

function boot(dna: Record<string, string> | undefined, options: { items?: unknown[]; body?: string; settings?: Record<string, unknown>; cart?: unknown[] } = {}): Boot {
  const body = options.body ?? '<header><button data-cart-open>Pedido (<span data-cart-count>0</span>)</button></header><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>';
  const dom = new JSDOM(`<html><head></head><body>${body}</body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = (query: string) => ({ matches: /reduce/.test(query) ? false : /hover/.test(query), addEventListener() {}, removeEventListener() {} });
  // jsdom has no <dialog> modality: record how the kit opens it.
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); (w as any).__modal = (w as any).__modal ?? []; (w as any).__modal.push(this); };
  w.HTMLDialogElement.prototype.show = function () { this.setAttribute('open', ''); (w as any).__shown = true; };
  w.HTMLDialogElement.prototype.close = function () { if (!this.hasAttribute('open')) return; this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.PAGOSYA_PREVIEW = true;
  if (options.cart) w.PAGOSYA_PREVIEW_CART = options.cart;
  const data = { storeName: 'Marca', items: options.items ?? [] };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, ...(dna ? { dna } : {}), ...options.settings };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  const handle = { w, doc: w.document, close: () => w.close() };
  opened.push(handle);
  return handle;
}

const DNA = { version: 1 as unknown as string, button: 'pill', hover: 'lift', press: 'squash', radius: 'round', border: 'hairline', frame: 'rounded', cart: 'drawer', added: 'toast', review: 'split', card: 'still' };
const dnaCss = (doc: any) => doc.querySelector('style[data-pagosya-kit="dna"]')?.textContent ?? '';
/** Innermost rule blocks: selector and declarations (at-rule wrappers are skipped). */
const rules = (css: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selector: m[1].trim(), body: m[2] }));
const PROTECTED = /price|total|__buy|checkout-button|menu-add|data-pay|finish-demo|polic|privacy|order-note|sold-out|legal|receipt/;
/** The element a selector styles: its last compound, split at top-level combinators. */
function subject(selector: string) {
  let depth = 0, start = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && /[\s>+~]/.test(c)) start = i + 1;
  }
  return selector.slice(start);
}
/** Does this selector style a primary pay/checkout button (the cart's checkout, the checkout's pay, the product buy)? */
function topLevel(list: string) {
  const parts: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { parts.push(list.slice(start, i)); start = i + 1; }
  }
  return [...parts, list.slice(start)].map(part => part.trim());
}
const reachesPay = (selector: string) => topLevel(selector).some(part => /checkout-button|__buy(?!-)/.test(subject(part)) && !/:not\(\.checkout-button\)/.test(subject(part)));

describe('DNA tokens and buttons', () => {
  it('adds the DNA style only for a store with DNA and leaves every other kit style unchanged', () => {
    const plain = boot(undefined), styled = boot(DNA);
    expect(plain.doc.querySelectorAll('style[data-pagosya-kit="dna"]')).toHaveLength(0);
    expect(styled.doc.querySelectorAll('style[data-pagosya-kit="dna"]')).toHaveLength(1);
    const others = (doc: any) => Array.from(doc.querySelectorAll('style') as ArrayLike<any>).filter(s => s.dataset.pagosyaKit !== 'dna').map(s => s.textContent);
    expect(others(styled.doc)).toEqual(others(plain.doc));
  });

  it('never hides or shrinks prices, totals, buy or pay buttons or legal text', () => {
    const css = dnaCss(boot(DNA).doc);
    expect(css.length).toBeGreaterThan(0);
    for (const { selector, body } of rules(css).filter(rule => PROTECTED.test(rule.selector))) {
      const declarations = body.replace(/\s+/g, '');
      expect({ selector, hidden: /display:none|visibility:hidden|(?:^|;)opacity:0(?:[;!]|$)/.test(declarations) }).toEqual({ selector, hidden: false });
      const small = [...declarations.matchAll(/font-size:([\d.]+)(px|em|rem)/g)].filter(([, size, unit]) => (unit === 'px' ? Number(size) : Number(size) * 16) < 12);
      expect({ selector, small: small.map(m => m[0]) }).toEqual({ selector, small: [] });
    }
  });

  it('never shrinks a primary pay or checkout button, nor leaves it transparent, in any form', () => {
    const css = dnaCss(boot(DNA).doc);
    const all = rules(css);
    const pay = all.filter(rule => reachesPay(rule.selector));
    expect(pay.length).toBeGreaterThan(0);
    for (const { selector, body } of pay) {
      const declarations = body.replace(/\s+/g, '');
      expect({ selector, shrink: declarations.match(/(?:^|;)(?:min-height|height|padding(?:-top|-bottom|-block)?):[^;]*/g) ?? [] }).toEqual({ selector, shrink: [] });
      expect({ selector, transparent: /(?:^|;)background(?:-color)?:(?:transparent|none)/.test(declarations) }).toEqual({ selector, transparent: false });
    }
    // The effective fill of the pay button in each form: the form's token, unless a pay-button rule refills it.
    for (const form of DNA_VALUES.button) {
      const token = (text: string) => text.match(/--kit-btn-bg:([^;]+)/)?.[1];
      let bg = token(all.find(rule => rule.selector === `:root[data-dna-button=${form}]`)?.body ?? '');
      for (const rule of pay) if (rule.selector.includes(`[data-dna-button=${form}]`) && token(rule.body)) bg = token(rule.body);
      expect({ form, bg }).toEqual({ form, bg: expect.not.stringMatching(/transparent/) });
    }
  });
  it('has a rule for every button form, hover and press, keyed on the root DNA attribute', () => {
    const css = dnaCss(boot(DNA).doc);
    for (const [field, name] of [['button', 'button'], ['hover', 'hover'], ['press', 'press'], ['radius', 'radius'], ['border', 'border'], ['frame', 'frame']] as const) {
      for (const value of DNA_VALUES[field]) expect(css).toContain(`:root[data-dna-${name}=${value}]`);
    }
  });

  it('carries the DNA type case and tracking into open button forms and kit panel titles', () => {
    const css = dnaCss(boot(DNA).doc);
    for (const field of ['case', 'tracking']) for (const value of DNA_VALUES[field]) expect(css).toContain(`:root[data-dna-${field}=${value}]{`);
    for (const form of ['pill', 'outline', 'ghost', 'split', 'underline']) expect(css).toMatch(new RegExp(`:root\\[data-dna-button=${form}\\]\\{[^}]*--kit-btn-case:var\\(--kit-type-case`));
    const title = rules(css).find(rule => rule.selector.includes('.cart-drawer__header h2') && rule.selector.includes('.checkout-review__summary h2'));
    expect(title?.body).toContain('text-transform:var(--kit-type-case)');
  });
  it('the stamp form rocks on top of the store\'s press, not instead of it', () => {
    const css = dnaCss(boot(DNA).doc);
    for (const press of DNA_VALUES.press) expect(css).toMatch(new RegExp(`:root\\[data-dna-press=${press}\\]\\{--kit-press:`));
    expect(css).toMatch(/:root\[data-dna-button=stamp\] [^{]*:active:not\(:disabled\)\{transform:var\(--kit-press\) rotate\(-2\.5deg\)/);
  });
  it('gives every commerce button the shared button tokens and keeps focus visible', () => {
    const css = dnaCss(boot(DNA).doc);
    const button = rules(css).find(rule => rule.selector.includes('.menu-add') && rule.body.includes('var(--kit-btn-radius)'));
    expect(button?.selector).toEqual(expect.stringContaining('.checkout-button'));
    for (const hook of ['.product-detail__buy', '.product-detail__sticky button', '.cart-added button', '[data-pagosya-contact] form>button[type=submit]']) expect(button?.selector).toContain(hook);
    for (const token of ['--kit-btn-border', '--kit-btn-bg', '--kit-btn-fg', '--kit-btn-case', '--kit-btn-tracking']) expect(button?.body).toContain(`var(${token})`);
    // The form's padding reaches every button but the primary pay/checkout/buy ones, which keep their full size.
    expect(rules(css).find(rule => rule.selector === `${button?.selector}:not(.checkout-button)`)?.body).toContain('padding:var(--kit-btn-pad)');
    expect(rules(css).some(rule => rule.selector.includes(':focus-visible') && /outline:\s*3px solid/.test(rule.body))).toBe(true);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});

describe('focus ring', () => {
  it('every button form keeps a visible ring: ink with a paper halo, never clipped, drawn after the hover effects', () => {
    const css = dnaCss(boot(DNA).doc);
    const all = rules(css);
    const rings = all.filter(rule => rule.selector.includes(':focus-visible') && /(^|;)outline:/.test(rule.body) && (rule.selector.includes('.menu-add') || rule.selector.includes('.product-detail__buy')));
    expect(rings.length).toBe(2); // the layered kit buttons and the product page copy
    for (const ring of rings) {
      expect(ring.body).toMatch(/outline:3px solid var\(--kit-ink\)/);
      expect(ring.body).toMatch(/box-shadow:0 0 0 \d+px var\(--kit-paper\)/);
      expect(ring.body).toContain('clip-path:none');
      // No later :focus-visible rule sets outline or box-shadow again (it would replace the halo). A form detail may still
      // adjust something else on focus (the ticket form drops its notch mask so the ring is never clipped).
      const index = all.indexOf(ring);
      const later = all.slice(index + 1).filter(rule => rule.selector.includes(':focus-visible') && rule.selector.includes(ring.selector.includes('.menu-add') ? '.menu-add' : '.product-detail__buy') && /(^|;)\s*(outline|box-shadow):/.test(rule.body));
      expect(later.map(rule => rule.selector)).toEqual([]);
    }
  });
});

describe('cart placement', () => {
  const drawerRule = (css: string, cart: string) => rules(css).find(rule => rule.selector.split(',').some(part => part.trim() === `:root[data-dna-cart=${cart}] .cart-drawer`));
  it('gives the sheet a grab handle, and adds nothing without DNA', () => {
    expect(boot({ ...DNA, cart: 'sheet' }).doc.querySelector('.cart-drawer .cart-drawer__grip[aria-hidden="true"]')).not.toBeNull();
    expect(boot(undefined).doc.querySelector('.cart-drawer__grip')).toBeNull();
  });
  it.each(['drawer', 'sheet', 'page', 'overlay'])('opens %s as a native modal dialog that closes back to its trigger', cart => {
    const { w, doc } = boot({ ...DNA, cart });
    const trigger = doc.querySelector('[data-cart-open]'), drawer = doc.querySelector('dialog.cart-drawer');
    trigger.click();
    expect(w.__modal).toEqual([drawer]);
    expect(w.__shown).toBeUndefined();
    drawer.close(); // what Escape does to a modal dialog
    expect(drawer.hasAttribute('open')).toBe(false);
    expect(doc.activeElement).toBe(trigger);
  });
  it('defines placement, entry and phone behaviour for every cart value', () => {
    const css = dnaCss(boot(DNA).doc);
    for (const cart of DNA_VALUES.cart) {
      expect({ cart, rule: !!drawerRule(css, cart) }).toEqual({ cart, rule: true });
      expect(css).toContain(`:root[data-dna-cart=${cart}] .cart-drawer:not([open])`);
      expect(css).toMatch(new RegExp(`@starting-style\\{[^}]*:root\\[data-dna-cart=${cart}\\] \\.cart-drawer\\[open\\]`));
    }
    const phone = css.match(/@media\(max-width:700px\)\{([\s\S]*?)\}\}/)?.[1] ?? '';
    for (const cart of ['sheet', 'page']) expect(phone).toMatch(new RegExp(`:root\\[data-dna-cart=${cart}\\] \\.cart-drawer[^{]*\\{[^}]*width:100vw`));
    expect(drawerRule(css, 'sheet')?.body).toMatch(/bottom|inset:auto 0 0/);
    expect(drawerRule(css, 'overlay')?.body).toContain('margin:auto');
  });
  it('the page cart and the stacked review draw the DNA border weight and shape', () => {
    const css = dnaCss(boot(DNA).doc);
    expect(rules(css).find(rule => rule.selector === ':root[data-dna-cart=page] .cart-drawer')?.body).toContain('border-top:var(--kit-border) solid var(--kit-accent)');
    // The stacked summary keeps the DNA panel (radius, tint, border), so the store's shape reaches it.
    expect(rules(css).filter(rule => rule.selector.includes('[data-dna-review=stacked] .checkout-review__summary')).map(rule => rule.body).join(';')).not.toMatch(/background:transparent|border-radius:0/);
    expect(css).toContain(':root[data-dna-frame=bleed]{--kit-photo-radius:min(var(--kit-radius),28px)');
  });
  it('frames cart photos and shapes the quantity buttons from the DNA', () => {
    const css = dnaCss(boot(DNA).doc);
    expect(rules(css).find(rule => rule.selector.includes('.order-item__photo'))?.body).toContain('var(--kit-photo-radius)');
  });
});

describe('added-to-cart placement', () => {
  const ITEM = { id: 'taza', name: 'Taza', amount: 12000, currency: 'BOB', stock: 5, imageUrls: [] };
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} });
  /** Boots, places the cart button and the add button, adds one product and returns the notice. */
  function addOne(added: string | null, place: { cart?: ReturnType<typeof rect>; add?: ReturnType<typeof rect>; notice?: ReturnType<typeof rect> } = {}) {
    const { w, doc } = boot(added ? { ...DNA, added } : undefined, { items: [ITEM] });
    const add = doc.querySelector('[data-pagosya-catalog] [data-add]'), trigger = doc.querySelector('header [data-cart-open]'), notice = doc.querySelector('.cart-added');
    trigger.getBoundingClientRect = () => place.cart ?? rect(900, 16, 96, 40);
    add.getBoundingClientRect = () => place.add ?? rect(300, 500, 44, 44);
    notice.getBoundingClientRect = () => place.notice ?? rect(640, 700, 360, 56);
    w.innerWidth = 1024; w.innerHeight = 768;
    add.click();
    return notice;
  }
  it.each(['toast', 'ribbon', 'bubble', 'inline', 'stamp'])('%s stays a polite status message and becomes visible', added => {
    const notice = addOne(added);
    expect([notice.getAttribute('role'), notice.getAttribute('aria-live'), notice.dataset.visible]).toEqual(['status', 'polite', 'true']);
    expect(notice.textContent).toContain('Taza añadido a tu pedido.');
  });
  it('anchors the bubble under the cart button', () => {
    const notice = addOne('bubble', { cart: rect(900, 16, 96, 40) });
    expect([notice.style.getPropertyValue('--added-top'), notice.style.getPropertyValue('--added-right')]).toEqual(['66px', '28px']);
  });
  it('hangs the bubble from a cart button on the left, arrow pointing at it', () => {
    const notice = addOne('bubble', { cart: rect(60, 8, 90, 30), notice: rect(60, 48, 300, 70) });
    expect([notice.style.getPropertyValue('--added-left'), notice.style.getPropertyValue('--added-right'), notice.style.getPropertyValue('--added-arrow')]).toEqual(['60px', '', '39px']);
  });
  it('anchors the inline confirmation under the pressed add button', () => {
    const notice = addOne('inline', { add: rect(300, 500, 44, 44) });
    expect([notice.style.getPropertyValue('--added-top'), notice.style.getPropertyValue('--added-left')]).toEqual(['552px', '300px']);
  });
  it('moves off a cart button it would cover, on a phone', () => {
    expect(addOne('ribbon', { cart: rect(300, 8, 80, 40), notice: rect(0, 0, 390, 60) }).dataset.flip).toBe('bottom');
    expect(addOne('toast', { cart: rect(300, 700, 80, 40), notice: rect(12, 690, 366, 60) }).dataset.flip).toBe('top');
    expect(addOne('toast').dataset.flip).toBeUndefined();
  });
  it.each(['<a href="#carrito">Carrito</a>', '<a href="#pedido">Pedido</a>', '<a href="#cart">Cart</a>', '<a href="/cart">Bolsa <span data-cart-count>0</span></a>'])('moves off any cart control the click handler opens the cart from: %s', control => {
    const { w, doc } = boot({ ...DNA, added: 'toast' }, { items: [ITEM], body: `<header>${control}</header><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>` });
    const add = doc.querySelector('[data-pagosya-catalog] [data-add]'), link = doc.querySelector('header a'), notice = doc.querySelector('.cart-added');
    link.getBoundingClientRect = () => rect(300, 700, 80, 40);
    add.getBoundingClientRect = () => rect(300, 400, 44, 44);
    notice.getBoundingClientRect = () => rect(12, 690, 366, 60);
    w.innerWidth = 390; w.innerHeight = 768;
    add.click();
    expect(notice.dataset.flip).toBe('top');
  });
  it('writes nothing extra without DNA', () => {
    const notice = addOne(null, { cart: rect(0, 0, 400, 800) });
    expect([notice.getAttribute('style'), notice.dataset.flip]).toEqual([null, undefined]);
  });
  it('has a rule for every placement', () => {
    const css = dnaCss(boot(DNA).doc);
    for (const added of DNA_VALUES.added) expect(css).toContain(`:root[data-dna-added=${added}] .cart-added{`);
    expect(css).toContain('.cart-added[data-flip=bottom]');
  });
});

describe('checkout review layout', () => {
  const review = (value: string | null) => boot(value ? { ...DNA, review: value } : undefined, {
    body: '<main><div data-pagosya-checkout-page></div></main><p data-pagosya-status></p>',
    items: [{ id: 'taza', name: 'Taza', amount: 12000, currency: 'BOB', stock: 5, imageUrls: [] }], cart: [{ id: 'taza', quantity: 2 }],
  }).doc.querySelector('.checkout-review');
  it('keeps the same fields, order and actions in every layout', () => {
    const plain = review(null);
    expect(plain?.querySelector('.checkout-review__summary .order-total')).not.toBeNull();
    for (const value of DNA_VALUES.review) expect({ value, html: review(value)?.innerHTML }).toEqual({ value, html: plain.innerHTML });
  });
  it('the DNA density sets the review column width, proportions and spacing', () => {
    const css = dnaCss(boot(DNA).doc);
    for (const density of DNA_VALUES.density) expect(css).toMatch(new RegExp(`:root\\[data-dna-density=${density}\\]\\{--kit-review-max:[^;]+;--kit-summary-fr:[^;]+;--kit-gap:[^;]+;--kit-pad:`));
    for (const review of ['split', 'ticket', 'notebook']) expect(rules(css).find(rule => rule.selector === `:root[data-dna-review=${review}] .checkout-review`)?.body).toContain('var(--kit-summary-fr');
    expect(rules(css).find(rule => rule.selector === ':root[data-dna-review=stacked] .checkout-review')?.body).toContain('max-width:var(--kit-review-max');
  });
  it('has a layout for every review value, the ticket summary in the second column, and one column on phones', () => {
    const css = dnaCss(boot(DNA).doc);
    for (const value of DNA_VALUES.review) expect(css).toContain(`:root[data-dna-review=${value}] .checkout-review{`);
    expect(rules(css).find(rule => rule.selector === ':root[data-dna-review=ticket] .checkout-review__summary')?.body).toContain('grid-column:2');
    expect(css).toMatch(/@media\(max-width:700px\)\{:root\[data-dna-review\] \.checkout-review\{grid-template-columns:minmax\(0,1fr\)/);
    expect(css).toMatch(/@container\(max-width:700px\)\{:root\[data-dna-review\] \.checkout-review\{grid-template-columns:minmax\(0,1fr\)/);
  });
});

describe('product card preview', () => {
  const TWO = { id: 'taza', name: 'Taza', amount: 12000, currency: 'BOB', stock: 5, imageUrls: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'] };
  const ONE = { ...TWO, id: 'vaso', name: 'Vaso', imageUrls: ['https://cdn.test/c.jpg'] };
  const COLORS = { id: 'polo', name: 'Polo', amount: 9000, currency: 'BOB', stock: 9, imageUrls: ['https://cdn.test/p.jpg'], variants: ['Rojo', 'Azul', 'Negro', 'Blanco', 'Verde'].map((value, i) => ({ id: `v${i}`, name: value, amount: 9000, stock: 3, imageUrl: `https://cdn.test/${value}.jpg`, options: [{ name: 'Color', value }] })) };
  const TEMPLATE = '<template data-pagosya-product-template><article class="card"><a data-product-link data-product-media><img data-product-field="image" alt=""></a><h3><a data-product-link><span data-product-field="name"></span></a></h3><p data-product-field="price"></p><button data-product-add>Añadir</button></article></template>';
  const catalog = (card: string | null, items: unknown[], template = false) => boot(card ? { ...DNA, card } : undefined, {
    items, body: `${template ? TEMPLATE : ''}<header><button data-cart-open>Pedido</button></header><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>`,
  });

  it.each([false, true])('second-photo adds the second image only when there is one (template: %s)', template => {
    const { doc } = catalog('second-photo', [TWO, ONE], template);
    const alts = Array.from(doc.querySelectorAll('.menu-item__image-alt') as ArrayLike<any>);
    expect(alts.map(img => [img.getAttribute('data-src'), img.getAttribute('alt'), img.getAttribute('aria-hidden')])).toEqual([['https://cdn.test/b.jpg', '', 'true']]);
    expect(doc.querySelectorAll('.menu-item')).toHaveLength(2);
  });
  const upload = (n: number) => `https://api.test/v1/uploads/0000000${n}-0000-4000-8000-000000000000.jpg`;
  it.each(['pointerover', 'focusin', 'touchstart'])('downloads the second photo only when the shopper reaches the card (%s), responsively', type => {
    const { w, doc } = catalog('second-photo', [{ ...TWO, imageUrls: [upload(1), upload(2)] }]);
    const card = doc.querySelector('.menu-item'), alt = card.querySelector('.menu-item__image-alt');
    expect([alt.hasAttribute('src'), alt.hasAttribute('srcset')]).toEqual([false, false]);
    card.querySelector('.menu-item__image').dispatchEvent(new w.Event(type, { bubbles: true }));
    expect(alt.getAttribute('src')).toBe(upload(2));
    expect(alt.getAttribute('srcset')).toContain(`${upload(2)}?w=`);
    expect(alt.getAttribute('sizes')).toBeTruthy();
  });
  it('swatch thumbnails ask for the smallest rendition, and a swapped photo stays responsive', () => {
    const variants = COLORS.variants.slice(0, 2).map((v, i) => ({ ...v, options: [], imageUrl: upload(i + 3) }));
    const { doc } = catalog('swatch-swap', [{ ...COLORS, imageUrls: [upload(1)], variants }]);
    const thumbs = Array.from(doc.querySelectorAll('.menu-item__swatches img') as ArrayLike<any>);
    expect(thumbs.map(img => [img.getAttribute('sizes'), img.getAttribute('srcset')?.includes(`${upload(3)}?w=`) || img.getAttribute('srcset')?.includes(`${upload(4)}?w=`)])).toEqual([['22px', true], ['22px', true]]);
    doc.querySelectorAll('[data-card-swatch]')[1].click();
    const photo = doc.querySelector('.menu-item__image');
    expect([photo.getAttribute('src'), photo.getAttribute('srcset')?.includes(`${upload(4)}?w=`)]).toEqual([upload(4), true]);
  });
  it('adds no preview markup without DNA or for a still card', () => {
    for (const handle of [catalog(null, [TWO, COLORS]), catalog('still', [TWO, COLORS])]) {
      expect(handle.doc.querySelectorAll('.menu-item__image-alt, .menu-item__swatches, .menu-item__quick-look')).toHaveLength(0);
    }
  });
  it.each([false, true])('swatch-swap shows up to four variant photos that swap the card photo (template: %s)', template => {
    const { doc } = catalog('swatch-swap', [COLORS, TWO], template);
    const swatches = Array.from(doc.querySelectorAll('.menu-item__swatches button[data-card-swatch]') as ArrayLike<any>);
    expect(swatches.map(b => b.getAttribute('aria-label'))).toEqual(['Ver Rojo', 'Ver Azul', 'Ver Negro', 'Ver Blanco']);
    swatches[1].click();
    const card = swatches[1].closest('.menu-item'), photo = card.querySelector('.menu-item__image');
    expect(photo.getAttribute('src')).toBe('https://cdn.test/Azul.jpg');
    expect(swatches.map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false']);
    expect(doc.querySelectorAll('.menu-item__swatches')).toHaveLength(1); // a product without variant photos stays still
  });
  it('quick-look shows a chip that opens the product', () => {
    const { w, doc } = catalog('quick-look', [TWO]);
    const chip = doc.querySelector('.menu-item button.menu-item__quick-look');
    expect(chip?.textContent).toBe('Vista rápida');
    chip.click();
    expect(w.__modal).toContain(doc.querySelector('dialog[data-pagosya-product]'));
  });
  it('anchors the quick-look chip to the photo, not the card: a row template keeps its price clear', () => {
    const ROW = '<template data-pagosya-product-template><article class="row"><a data-product-link data-product-media><img data-product-field="image" alt=""></a><div><h3><a data-product-link><span data-product-field="name"></span></a></h3></div><p data-product-field="price"></p><button data-product-add>Añadir</button></article></template>';
    const { w, doc } = boot({ ...DNA, card: 'quick-look' }, { items: [TWO], body: `${ROW}<section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>` });
    const card = doc.querySelector('.menu-item'), photo = card.querySelector('.menu-item__image'), chip = card.querySelector('.menu-item__quick-look');
    // The chip is never nested in the photo's link, and sits right after it (the photo's box, not the card's corner).
    expect(chip.closest('a,button:not(.menu-item__quick-look)')).toBeNull();
    expect(chip.previousElementSibling?.contains(photo)).toBe(true);
    // A row: photo on the left (120px), price at the top right of the card.
    card.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 120, width: 600, height: 120, x: 0, y: 0, toJSON() {} });
    photo.getBoundingClientRect = () => ({ left: 0, top: 0, right: 120, bottom: 120, width: 120, height: 120, x: 0, y: 0, toJSON() {} });
    card.dispatchEvent(new w.Event('pointerover', { bubbles: true }));
    expect([chip.style.getPropertyValue('--look-top'), chip.style.getPropertyValue('--look-left')]).toEqual(['0px', '120px']);
    const rule = rules(dnaCss(doc)).find(r => r.selector === ':root[data-dna-card=quick-look] .menu-item__quick-look');
    expect(rule?.body).toMatch(/top:calc\(var\(--look-top,0px\) \+ 10px\)/);
    expect(rule?.body).toMatch(/left:calc\(var\(--look-left,100%\) - 10px\)/);
  });
  it('a long press previews the second photo on touch, and lifting the finger ends it', () => {
    jest.useFakeTimers();
    try {
      const { w, doc } = catalog('second-photo', [TWO]);
      const card = doc.querySelector('.menu-item'), photo = card.querySelector('.menu-item__image');
      photo.dispatchEvent(new w.Event('touchstart', { bubbles: true }));
      jest.advanceTimersByTime(500);
      expect(card.hasAttribute('data-previewing')).toBe(true);
      photo.dispatchEvent(new w.Event('touchend', { bubbles: true }));
      expect(card.hasAttribute('data-previewing')).toBe(false);
    } finally { jest.useRealTimers(); }
  });
  it('a slow tap (500ms) on the add button still adds: only a press on the photo previews', () => {
    jest.useFakeTimers();
    try {
      const { w, doc } = catalog('second-photo', [TWO]);
      const card = doc.querySelector('.menu-item'), add = card.querySelector('[data-add]');
      add.dispatchEvent(new w.Event('touchstart', { bubbles: true }));
      jest.advanceTimersByTime(500);
      expect(card.hasAttribute('data-previewing')).toBe(false);
      add.dispatchEvent(new w.Event('touchend', { bubbles: true }));
      add.click();
      expect(doc.querySelector('.cart-added').dataset.visible).toBe('true');
    } finally { jest.useRealTimers(); }
  });
  it('a long press on the photo area of the details overlay previews, a press elsewhere on the card does not', () => {
    jest.useFakeTimers();
    try {
      const { w, doc } = catalog('second-photo', [TWO]);
      const card = doc.querySelector('.menu-item'), photo = card.querySelector('.menu-item__image'), overlay = card.querySelector('.menu-item__details');
      photo.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 250, width: 200, height: 250, x: 0, y: 0, toJSON() {} });
      const press = (x: number, y: number) => { const event = new w.Event('touchstart', { bubbles: true }); Object.defineProperty(event, 'touches', { value: [{ clientX: x, clientY: y }] }); overlay.dispatchEvent(event); jest.advanceTimersByTime(500); };
      press(180, 300); // below the photo: the name and price
      expect(card.hasAttribute('data-previewing')).toBe(false);
      overlay.dispatchEvent(new w.Event('touchend', { bubbles: true }));
      press(100, 120);
      expect(card.hasAttribute('data-previewing')).toBe(true);
    } finally { jest.useRealTimers(); }
  });
  it('has CSS for every card value and frames the card photos', () => {
    const css = dnaCss(boot(DNA).doc);
    for (const card of DNA_VALUES.card.filter(card => card !== 'still')) expect(css).toContain(`:root[data-dna-card=${card}]`);
    expect(rules(css).find(rule => rule.selector.includes('.menu-item__image') && rule.body.includes('var(--kit-photo-radius)'))).toBeDefined();
    expect(css).toMatch(/prefers-reduced-motion:reduce\)\{[^@]*\.menu-item/);
  });
});

describe('contact, privacy and sticky buy bar', () => {
  const privacy = readFileSync(kitPath('privacy.js'), 'utf8');
  function privacyPanel(dna: boolean) {
    const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
    const w = dom.window;
    if (dna) w.document.documentElement.setAttribute('data-dna-button', 'pill');
    w.eval(privacy);
    w.PAGOSYA_PRIVACY.mount('marca', { analyticsAvailable: true });
    const root = w.document.querySelector('[data-pagosya-privacy]');
    const result = { html: root.outerHTML, css: w.document.querySelector('#pagosya-privacy-style').textContent };
    w.close();
    return result;
  }
  it('the contact launcher and panel take the store tokens and DNA shape, inside the contact layer', () => {
    const contact = Array.from(boot(DNA).doc.querySelectorAll('style') as ArrayLike<any>).map(s => s.textContent).find(text => text.includes('@layer pagosya-contact-base')) ?? '';
    const launcher = rules(contact).find(rule => rule.selector.startsWith(':root[data-dna-button] [data-pagosya-contact] .pagosya-contact-launcher'));
    expect(launcher?.body).toMatch(/border-radius:var\(--kit-radius-panel\)/);
    expect(launcher?.body).toMatch(/background:var\(--kit-accent\)!important/);
    expect(rules(contact).find(rule => rule.selector.startsWith(':root[data-dna-button] [data-pagosya-contact] .pagosya-contact-panel'))?.body).toContain('var(--kit-paper)');
  });
  it('the privacy dialog reads the store tokens and DNA shape and keeps its wording, choices and order', () => {
    const [plain, styled] = [privacyPanel(false), privacyPanel(true)];
    expect(styled.html).toBe(plain.html);
    expect(styled.css).toMatch(/:root\[data-dna-button\] \[data-pagosya-privacy\] button\{[^}]*border-radius:var\(--kit-radius/);
    expect(styled.css).toMatch(/:root\[data-dna-button\] \[data-privacy-panel\]:not\(\[hidden\]\)\{[^}]*var\(--store-background/);
  });
  it('the mobile sticky buy bar takes the button form', () => {
    expect(dnaCss(boot(DNA).doc)).toContain('.product-detail__sticky button');
  });
});

describe('component mode reads the same DNA', () => {
  const ui = readFileSync(kitPath('ui.tsx'), 'utf8');
  it('card and cart buttons read the button tokens, uncapped by the theme radius', () => {
    expect(ui).toMatch(/\.ui-card__add\{[^}]*border-radius:var\(--kit-btn-radius,var\(--ui-radius-control\)\)/);
    expect(ui).toMatch(/\.ui-cart\{[^}]*border-radius:var\(--kit-btn-radius,999px\)/);
  });
  const uiCss = ui.match(/const UI_CSS = `([\s\S]*?)\n`;/)![1];
  /** Declarations that reach `target` in a document with these root attributes (pseudo-classes dropped: jsdom has no hover). */
  function reaching(markup: string, target: string, root: Record<string, string> = {}) {
    const dom = new JSDOM(`<html><body>${markup}</body></html>`, { virtualConsole: new VirtualConsole() });
    for (const [name, value] of Object.entries(root)) dom.window.document.documentElement.setAttribute(name, value);
    const el = dom.window.document.querySelector(target);
    const out = rules(uiCss).filter(rule => rule.selector.split(',').some(part => {
      try { return el.matches(part.replace(/:hover(:not\(:disabled\))?/g, '')); } catch { return false; }
    })).map(rule => rule.body).join(';');
    dom.window.close();
    return out;
  }
  it('the cart button keeps its inherited case and tracking without DNA; only the DNA sets them', () => {
    const cart = '<header><button class="ui-cart">Pedido</button></header>';
    expect(reaching(cart, '.ui-cart')).not.toMatch(/text-transform|letter-spacing/);
    const styled = reaching(cart, '.ui-cart', { 'data-dna-button': 'block' });
    expect(styled).toContain('text-transform:var(--kit-btn-case');
    expect(styled).toContain('letter-spacing:var(--kit-btn-tracking');
  });
  it('the author\'s card fx (zoom, lift) survives a DNA store; only the DNA preview that drives the same property replaces it', () => {
    const card = '<div data-fx="zoom lift"><article class="ui-card menu-item"><a class="ui-card__media"><img></a></article></div>';
    for (const mode of [null, 'still', 'second-photo', 'swatch-swap', 'quick-look', 'tilt']) {
      const root: Record<string, string> = mode ? { 'data-dna-card': mode } : {};
      expect({ mode, zoom: reaching(card, '.ui-card__media img', root) }).toEqual({ mode, zoom: expect.stringContaining('transform:scale(1.06)') });
    }
    for (const mode of [null, 'still', 'second-photo', 'zoom']) {
      const root: Record<string, string> = mode ? { 'data-dna-card': mode } : {};
      expect({ mode, lift: reaching(card, '.ui-card', root) }).toEqual({ mode, lift: expect.stringContaining('transform:translateY(-6px)') });
    }
    expect(reaching(card, '.ui-card', { 'data-dna-card': 'tilt' })).not.toContain('translateY(-6px)');
    expect(reaching(card, '.ui-card__media img', { 'data-dna-card': 'zoom' })).not.toContain('scale(1.06)');
  });
});
