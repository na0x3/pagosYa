import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

/** Product card DNA (theme plan, Task 2): the product page's swatches, gallery layout, block frames, dividers and
 * entrance follow the store's DNA. jsdom has no layout, so these tests pin markup, attributes and CSS text. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const GOLDEN = join(__dirname, 'fixtures/product-page-plain.html');

const variant = (id: string, color: string, size: string, extra: Record<string, unknown> = {}) => ({
  id, name: `${color} / ${size}`, amount: 2500, stock: 3, options: [{ name: 'Color', value: color }, { name: 'Talla', value: size }], ...extra,
});
const RED = ['https://shop.test/red-1.jpg', 'https://shop.test/red-2.jpg', 'https://shop.test/red-3.jpg'];
const BLUE = ['https://shop.test/blue-1.jpg', 'https://shop.test/blue-2.jpg'];
const product = (extra: Record<string, unknown> = {}) => ({
  id: 'chair', name: 'Silla', amount: 2000, currency: 'BOB', stock: null, imageUrls: ['https://shop.test/base.jpg'],
  variants: [variant('red-s', 'Rojo', 'S', { imageUrls: RED, imageUrl: RED[0] }), variant('red-m', 'Rojo', 'M', { imageUrls: RED, imageUrl: RED[0] }), variant('blue-m', 'Azul', 'M', { imageUrls: BLUE, imageUrl: BLUE[0] })],
  contentBlocks: [{ id: 'blk_aaaaaaaaaaaa', type: 'media', imageUrl: 'https://shop.test/angle.jpg', alt: 'Respaldo', caption: '35°' }],
  ...extra,
});

const windows: any[] = [];
const errors: Error[] = [];
async function open(dna: Record<string, unknown> | undefined, items: any[] = [product()]) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!error.message.includes('Could not parse CSS stylesheet')) errors.push(error); });
  const dom = new JSDOM('<html><head></head><body><button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog></section><section data-pagosya-cart></section></body></html>', { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  const data = { storeName: 'Marca', items };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, ...(dna ? { dna: { version: 1, ...dna } } : {}) };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  const query = (selector: string) => w.document.querySelector(selector);
  query('.menu-add').click();
  return { w, query, html: () => w.document.documentElement, detail: () => query('[data-pagosya-product]') };
}
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

/** The pre-theme markup: data-part hooks and the empty decor slots are the only allowed additions. */
const stripAdditions = (html: string) => html.replace(/<span class="product-detail__decor"[^>]*><\/span>/g, '').replace(/ data-part="[^"]*"/g, '').replace(/ data-part-type="[^"]*"/g, '');

describe('product card DNA in the kit', () => {
  it('a store without productCard DNA renders the product page exactly as before (golden)', async () => {
    const { detail } = await open(undefined);
    const html = stripAdditions(detail().innerHTML);
    if (!existsSync(GOLDEN) || process.env.WRITE_GOLDEN) writeFileSync(GOLDEN, html);
    expect(html).toBe(readFileSync(GOLDEN, 'utf8'));
  });

  it('writes the five product card values onto <html>, and ignores unknown ones', async () => {
    const { html } = await open({ swatch: 'square', gallery: 'stack', blocks: 'ticket', divider: 'dashed', enter: 'fade-up' });
    const root = html();
    for (const [name, value] of Object.entries({ swatch: 'square', gallery: 'stack', blocks: 'ticket', divider: 'dashed', enter: 'fade-up' })) expect(root.getAttribute(`data-dna-${name}`)).toBe(value);
    const other = await open({ swatch: 'hexagon', gallery: 'rail' });
    expect(other.html().hasAttribute('data-dna-swatch')).toBe(false);
    expect(other.html().getAttribute('data-dna-gallery')).toBe('rail');
  });

  it('exposes the part hooks and empty decorative slots', async () => {
    const { detail } = await open({ swatch: 'pill' });
    const d = detail();
    for (const part of ['gallery', 'stage', 'thumbs', 'thumb', 'swatch', 'title', 'eyebrow', 'decor-a', 'decor-b']) expect(d.querySelector(`[data-part="${part}"]`)).not.toBeNull();
    for (const decor of d.querySelectorAll('[data-part^="decor-"]')) { expect(decor.getAttribute('aria-hidden')).toBe('true'); expect(decor.textContent).toBe(''); }
  });

  it('swatch photo shows each option\'s first photo and falls back without one', async () => {
    const items = [product({ variants: [variant('red-s', 'Rojo', 'S', { imageUrls: RED, imageUrl: RED[0] }), variant('red-m', 'Rojo', 'M', { imageUrls: RED, imageUrl: RED[0] }), variant('blue-m', 'Azul', 'M')] })];
    const { detail } = await open({ swatch: 'photo' }, items);
    const buttons = [...detail().querySelectorAll('[data-product-option="0"]')] as any[];
    const rojo = buttons.find(b => b.textContent.includes('Rojo')), azul = buttons.find(b => b.textContent.includes('Azul'));
    expect(rojo.querySelector('img').getAttribute('src')).toBe(RED[0]);
    expect(azul.querySelector('img')).toBeNull();
    for (const button of buttons) for (const attr of ['data-product-option', 'data-option-value', 'aria-pressed']) expect(button.hasAttribute(attr)).toBe(true);
  });

  it('gallery stack renders every photo full width without thumbnail buttons, and follows a colour\'s photo set', async () => {
    const { detail } = await open({ gallery: 'stack' });
    const d = detail();
    const stacked = () => [...d.querySelectorAll('.product-detail__stack img')].map((i: any) => i.getAttribute('src'));
    expect(stacked()).toHaveLength(6); // base + 3 red + 2 blue
    expect(d.querySelector('[data-product-image]')).toBeNull();
    [...d.querySelectorAll('[data-product-option="0"]')].find((b: any) => b.textContent.includes('Rojo')).click();
    expect(stacked()).toEqual(RED);
    [...d.querySelectorAll('[data-product-option="0"]')].find((b: any) => b.textContent.includes('Azul')).click();
    expect(stacked()).toEqual(BLUE);
  });

  it('gallery mosaic uses the same stacked photos as its own layout', async () => {
    const { detail } = await open({ gallery: 'mosaic' });
    expect(detail().querySelectorAll('.product-detail__stack img').length).toBe(6);
  });

  describe('guarded product theme CSS', () => {
    const SAFE = '[data-pagosya-product][data-style] [data-part="gallery"]{border:2px solid #111}';
    const themeStyle = (w: any) => w.document.querySelector('style[data-pagosya-kit="product-theme"]');

    it('injects the sanitized CSS after the kit\'s own DNA styles', async () => {
      const { w } = await open({ productCss: SAFE });
      const style = themeStyle(w);
      expect(style.textContent).toBe(SAFE);
      const styles = [...w.document.head.querySelectorAll('style')];
      expect(styles.indexOf(style)).toBeGreaterThan(styles.indexOf(w.document.querySelector('style[data-pagosya-kit="dna"]')));
    });

    it.each([
      ['an import', '@import url(x.css);'], ['a url', '[data-pagosya-product] a{background:url(x)}'], ['an uppercase URL with a space', 'A{BACKGROUND:URL (x)}'],
      ['an expression', 'a{width:expression(1)}'], ['a style breakout', '</style><script>1</script>'], ['an angle bracket', 'a<b{color:red}'],
      ['a backslash escape', 'a{content:"\\41"}'], ['fixed positioning', 'a{position:fixed}'], ['fixed positioning with spaces', 'a{position : fixed}'],
      ['pointer-events', 'a{pointer-events:none}'], ['important', 'a{color:red !important}'], ['important with a space', 'a{color:red ! important}'],
    ])('injects nothing when the CSS contains %s', async (_name, css) => {
      const { w } = await open({ productCss: css });
      expect(themeStyle(w)).toBeNull();
    });

    it('injects nothing when the value is empty, not text, too long or the store has no DNA', async () => {
      for (const productCss of ['', 42, { a: 1 }, 'a{color:red}'.padEnd(3001, ' ')]) expect(themeStyle((await open({ productCss })).w)).toBeNull();
      expect(themeStyle((await open(undefined)).w)).toBeNull();
    });
  });

  it('carries a rule for every non-default value, and the entrance only under no-preference motion', async () => {
    const { w } = await open({ swatch: 'circle', gallery: 'strip', blocks: 'tape', divider: 'hairline', enter: 'slide' });
    const css = [...w.document.querySelectorAll('style')].map((s: any) => s.textContent).join('\n');
    for (const value of ['swatch=circle', 'swatch=square', 'swatch=label', 'swatch=photo', 'gallery=strip', 'gallery=stack', 'gallery=mosaic', 'blocks=card', 'blocks=outline', 'blocks=tape', 'blocks=ticket', 'divider=hairline', 'divider=dashed', 'divider=bold']) expect(css).toContain(`data-dna-${value}`);
    for (const value of ['fade-up', 'slide', 'pop']) {
      const at = css.indexOf(`data-dna-enter=${value}`);
      expect(at).toBeGreaterThan(-1);
      expect(css.lastIndexOf('@media(prefers-reduced-motion:no-preference)', at)).toBeGreaterThan(-1);
    }
    const own = css.split('\n').filter(line => /data-dna-(swatch|gallery|blocks|divider|enter)=/.test(line)).join('\n');
    expect(own.length).toBeGreaterThan(1000);
    expect(own).not.toContain('position:fixed');
  });
});
