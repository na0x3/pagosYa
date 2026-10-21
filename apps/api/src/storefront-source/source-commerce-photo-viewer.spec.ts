import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { kitPath } from '@pagosya/storefront-kit';

/** Photo zoom (spec 2026-10-21): the full-screen viewer, product-page openers, card buttons and the magnifier. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const product = (over: Record<string, unknown> = {}) => ({
  id: 'abrigo', name: 'Abrigo de lana', amount: 120000, currency: 'BOB', stock: null,
  imageUrls: ['https://shop.test/a1.jpg', 'https://shop.test/a2.jpg', 'https://shop.test/a3.jpg'], variants: [], extras: [], highlights: [], ...over,
});

const windows: any[] = [];
const errors: Error[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

async function open({ items = [product()] as any[], fullPage = false, template = '', gallery }: { items?: any[]; fullPage?: boolean; template?: string; gallery?: string } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!/Could not parse CSS stylesheet|getComputedStyle\(elt, pseudoElt\)/.test(error.message)) errors.push(error); });
  const url = fullPage ? `https://shop.test/product.html?id=${items[0]?.id}` : 'https://shop.test/';
  const dom = new JSDOM(`<html><head></head><body>${template}<button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog data-catalog-full></section><section data-pagosya-cart></section>${fullPage ? '<main data-pagosya-product-page></main>' : ''}<p data-pagosya-status></p></body></html>`,
    { url, runScripts: 'outside-only', virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_CART = [];
  const data = { storeName: 'Noa', items };
  w.PAGOSYA_CONFIG = { slug: 'noa', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data };
  const quote = { subtotal: 0, discountAmount: 0, amount: 0, currency: 'BOB', shippingOptions: [] };
  w.fetch = jest.fn(async (target: string) => ({ ok: true, json: async () => String(target).endsWith('/store') ? data : quote }));
  if (gallery) w.document.documentElement.setAttribute('data-dna-gallery', gallery);
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  const q = (selector: string) => w.document.querySelector(selector) as any;
  const all = (selector: string) => [...w.document.querySelectorAll(selector)] as any[];
  const key = (target: any, name: string) => target.dispatchEvent(new w.KeyboardEvent('keydown', { key: name, bubbles: true }));
  return { w, q, all, key };
}

describe('photo viewer', () => {
  it('opens on the photo asked for, moves with the arrows and keys, and wraps', async () => {
    const { w, q, all, key } = await open();
    expect(w.eval(`pagosyaPhotos.open(${JSON.stringify(product().imageUrls)}, 1, { title: 'Abrigo de lana' })`)).toBe(true);
    const viewer = q('[data-pagosya-viewer]');
    expect(viewer.open).toBe(true);
    expect(viewer.getAttribute('aria-label')).toBe('Fotos de Abrigo de lana');
    expect(q('[data-viewer-photo]').getAttribute('src')).toBe('https://shop.test/a2.jpg');
    expect(q('[data-viewer-count]').textContent).toBe('2 / 3');
    q('[data-viewer-next]').click();
    expect(viewer.dataset.index).toBe('2');
    key(viewer, 'ArrowRight');
    expect(viewer.dataset.index).toBe('0');
    key(viewer, 'ArrowLeft');
    expect(viewer.dataset.index).toBe('2');
    all('[data-viewer-thumb]')[0].click();
    expect(q('[data-viewer-photo]').getAttribute('src')).toBe('https://shop.test/a1.jpg');
    expect(all('[data-viewer-thumb]')[0].getAttribute('aria-current')).toBe('true');
  });

  it('closes on Escape and ×, gives focus back and restores the overflow it found', async () => {
    const { w, q, key } = await open();
    const opener = q('[data-cart-open]');
    w.document.documentElement.style.overflow = 'hidden';
    w.eval(`pagosyaPhotos.open(['https://shop.test/a1.jpg'], 0, { title: 'Abrigo', opener: document.querySelector('[data-cart-open]') })`);
    const viewer = q('[data-pagosya-viewer]');
    expect(w.document.activeElement).toBe(q('[data-viewer-close]'));
    key(viewer, 'Escape');
    expect(viewer.open).toBe(false);
    expect(w.document.documentElement.style.overflow).toBe('hidden');
    expect(w.document.activeElement).toBe(opener);
    w.document.documentElement.style.overflow = '';
    w.eval(`pagosyaPhotos.open(['https://shop.test/a1.jpg'], 0, { title: 'Abrigo' })`);
    expect(w.document.documentElement.style.overflow).toBe('hidden');
    q('[data-viewer-close]').click();
    expect(viewer.open).toBe(false);
    expect(w.document.documentElement.style.overflow).toBe('');
  });

  it('skips videos, maps the tapped photo past a video, and never opens without a photo', async () => {
    const { w, q, all } = await open();
    expect(w.eval(`pagosyaPhotos.open(['https://shop.test/v.mp4'], 0, { title: 'X' })`)).toBe(false);
    expect(q('[data-pagosya-viewer]')?.open ?? false).toBe(false);
    w.eval(`pagosyaPhotos.open(['https://shop.test/v.mp4?x=1', 'https://shop.test/a1.jpg', 'https://shop.test/a2.jpg'], 2, { title: 'X' })`);
    expect(q('[data-viewer-photo]').getAttribute('src')).toBe('https://shop.test/a2.jpg');
    expect(all('[data-viewer-thumb]')).toHaveLength(2);
  });

  it('a single photo has no arrows or thumbnails', async () => {
    const { w, q, all } = await open();
    w.eval(`pagosyaPhotos.open(['https://shop.test/a1.jpg'], 0, { title: 'X' })`);
    expect(q('[data-viewer-prev]').hidden).toBe(true);
    expect(q('[data-viewer-next]').hidden).toBe(true);
    expect(all('[data-viewer-thumb]')).toHaveLength(0);
    expect(q('[data-pagosya-viewer]').hasAttribute('data-single')).toBe(true);
  });

  it('double-click zooms in and out, and a new photo starts unzoomed', async () => {
    const { w, q } = await open();
    w.eval(`pagosyaPhotos.open(['https://shop.test/a1.jpg', 'https://shop.test/a2.jpg'], 0, { title: 'X' })`);
    const viewer = q('[data-pagosya-viewer]'), stage = q('[data-viewer-stage]');
    stage.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, clientX: 10, clientY: 10 }));
    expect(viewer.dataset.zoom).toBe('2.5');
    expect(viewer.hasAttribute('data-zoomed')).toBe(true);
    stage.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, clientX: 10, clientY: 10 }));
    expect(viewer.dataset.zoom).toBe('1');
    stage.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
    q('[data-viewer-next]').click();
    expect(viewer.dataset.zoom).toBe('1');
    expect(q('[data-viewer-photo]').style.transform).toBe('translate(0px, 0px) scale(1)');
  });

  it('a click on the empty backdrop closes it only when not zoomed', async () => {
    const { w, q } = await open();
    w.eval(`pagosyaPhotos.open(['https://shop.test/a1.jpg'], 0, { title: 'X' })`);
    const viewer = q('[data-pagosya-viewer]'), stage = q('[data-viewer-stage]');
    stage.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
    stage.click();
    expect(viewer.open).toBe(true);
    stage.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
    stage.click();
    expect(viewer.open).toBe(false);
  });

  it('a press that starts on the photo never closes it, even when the browser sends the click to the stage (pointer capture)', async () => {
    const { w, q } = await open();
    w.eval(`pagosyaPhotos.open(['https://shop.test/a1.jpg'], 0, { title: 'X' })`);
    const viewer = q('[data-pagosya-viewer]'), stage = q('[data-viewer-stage]'), photo = q('[data-viewer-photo]');
    const down = new w.MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 });
    Object.defineProperty(down, 'pointerId', { value: 1 });
    photo.dispatchEvent(down);
    stage.click();
    expect(viewer.open).toBe(true);
    stage.click();
    expect(viewer.open).toBe(false);
  });

  it('a swipe moves to the next photo even when pointer capture is refused', async () => {
    const { w, q } = await open();
    w.eval(`pagosyaPhotos.open(['https://shop.test/a1.jpg', 'https://shop.test/a2.jpg'], 0, { title: 'X' })`);
    const viewer = q('[data-pagosya-viewer]'), stage = q('[data-viewer-stage]'), photo = q('[data-viewer-photo]');
    stage.setPointerCapture = () => { throw new w.DOMException('No active pointer', 'NotFoundError'); };
    const pointer = (type: string, target: any, x: number) => { const event = new w.MouseEvent(type, { bubbles: true, clientX: x, clientY: 100 }); Object.defineProperties(event, { pointerId: { value: 3 }, pointerType: { value: 'touch' } }); target.dispatchEvent(event); };
    pointer('pointerdown', photo, 300);
    pointer('pointermove', photo, 180);
    pointer('pointerup', stage, 180);
    stage.click();
    expect(viewer.dataset.index).toBe('1');
    expect(viewer.open).toBe(true);
  });

  it('escapes photo URLs and titles', async () => {
    const { w, q } = await open();
    w.eval(`pagosyaPhotos.open(['https://shop.test/a"1.jpg', 'https://shop.test/a2.jpg'], 0, { title: '<b>X</b>' })`);
    expect(q('[data-pagosya-viewer]').getAttribute('aria-label')).toBe('Fotos de <b>X</b>');
    expect(q('[data-viewer-thumbs] b')).toBeNull();
    expect(q('[data-viewer-thumb] img').getAttribute('src')).toBe('https://shop.test/a"1.jpg');
  });

  it('the product page photo opens the viewer on the photo shown, by click or Enter', async () => {
    const { w, q } = await open({ fullPage: true });
    const photo = q('[data-pagosya-product] .product-detail__photo');
    expect(photo.getAttribute('data-photo-zoom')).toBe('');
    expect(photo.getAttribute('role')).toBe('button');
    expect(photo.getAttribute('tabindex')).toBe('0');
    expect(photo.getAttribute('aria-label')).toBe('Ampliar foto de Abrigo de lana');
    q('[data-product-next]').click();
    q('[data-pagosya-product] .product-detail__photo').click();
    const viewer = q('[data-pagosya-viewer]');
    expect(viewer.open).toBe(true);
    expect(viewer.dataset.index).toBe('1');
    q('[data-viewer-close]').click();
    q('[data-pagosya-product] .product-detail__photo').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(viewer.open).toBe(true);
  });

  it('a stacked gallery opens on the photo tapped', async () => {
    const { q, all } = await open({ fullPage: true, gallery: 'stack' });
    const stacked = all('[data-pagosya-product] .product-detail__stack img[data-photo-zoom]');
    expect(stacked).toHaveLength(3);
    stacked[2].click();
    expect(q('[data-pagosya-viewer]').dataset.index).toBe('2');
  });

  it('a fine mouse over the stage photo magnifies it at the cursor; leaving resets it; touch never does', async () => {
    const { w, q } = await open({ fullPage: true });
    const stage = q('[data-pagosya-product] .product-detail__stage'), photo = q('[data-pagosya-product] .product-detail__photo');
    const move = (pointerType: string) => { const event = new w.MouseEvent('pointermove', { bubbles: true, clientX: 0, clientY: 0 }); Object.defineProperty(event, 'pointerType', { value: pointerType }); photo.dispatchEvent(event); };
    move('mouse');
    expect(stage.hasAttribute('data-magnify')).toBe(true);
    expect(photo.style.transformOrigin).toMatch(/%/);
    stage.dispatchEvent(new w.MouseEvent('pointerleave'));
    expect(stage.hasAttribute('data-magnify')).toBe(false);
    move('touch');
    expect(stage.hasAttribute('data-magnify')).toBe(false);
  });

  it('the viewer stylesheet is a kit sheet, so the product-page style release leaves its magnifier rules alone', async () => {
    // releaseProductPageStyles (product/setup.js) skips sheets whose owner carries data-pagosya-kit. jsdom runs that release on
    // load before its sheets expose ownerNode, so the rules themselves are checked in the browser (live check 2026-10-21).
    const { q } = await open();
    const style = q('style[data-pagosya-photo-viewer]');
    expect(style).not.toBeNull();
    expect(style.hasAttribute('data-pagosya-kit')).toBe(true);
    expect(style.textContent).toContain('.product-detail__stage[data-magnify] .product-detail__photo');
  });

  const esCard = '<template data-pagosya-product-template><article class="es-card"><a class="es-card__media" data-product-link href="product.html"><img data-product-field="image" alt="" /></a><h3 data-product-field="name">P</h3><p data-product-field="price"></p><button type="button" data-product-add>+</button></article></template>';

  it('kit cards with a photo get one zoom button that opens the viewer without opening the product', async () => {
    const { w, q, all } = await open({ items: [product(), product({ id: 'sin', name: 'Sin foto', imageUrls: [] })] });
    const card = q('.menu-item[data-product-id="abrigo"]');
    const button = card.querySelector('[data-product-zoom]');
    expect(button.getAttribute('aria-label')).toBe('Ampliar foto de Abrigo de lana');
    expect(q('.menu-item[data-product-id="sin"] [data-product-zoom]')).toBeNull();
    button.click();
    expect(q('[data-pagosya-viewer]').open).toBe(true);
    expect(q('[data-viewer-photo]').getAttribute('src')).toBe('https://shop.test/a1.jpg');
    expect(all('dialog[data-pagosya-product][open]')).toHaveLength(0);
    expect(w.document.activeElement).toBe(q('[data-viewer-close]'));
  });

  it('template cards: the button sits in the card, never inside the card link', async () => {
    const { q } = await open({ template: esCard });
    const card = q('[data-custom-product][data-product-id="abrigo"]');
    const button = card.querySelector('[data-product-zoom]');
    expect(button).not.toBeNull();
    expect(button.closest('a')).toBeNull();
    expect(button.parentElement).toBe(card);
  });

  it('a button outside the photo holder is placed over the photo\'s top-right corner', async () => {
    const { w, q } = await open({ template: esCard });
    const card = q('[data-custom-product][data-product-id="abrigo"]'), photo = card.querySelector('img');
    // Photo on the left of a horizontal card: 20px from the card's top-left, 120 wide.
    card.getBoundingClientRect = () => ({ top: 100, left: 50, right: 450, bottom: 300, width: 400, height: 200 });
    photo.getBoundingClientRect = () => ({ top: 120, left: 70, right: 190, bottom: 270, width: 120, height: 150 });
    w.eval(`pagosyaPhotos.place(document)`);
    const button = card.querySelector('[data-product-zoom]');
    expect(button.style.top).toBe('30px');
    expect(button.style.left).toBe('94px');
    expect(button.style.right).toBe('auto');
  });

  it('a template that draws its own zoom button keeps it and gets no second one', async () => {
    const own = esCard.replace('<h3', '<button type="button" data-product-zoom aria-label="Zoom">Z</button><h3');
    const { all } = await open({ template: own });
    expect(all('[data-product-id="abrigo"] [data-product-zoom]')).toHaveLength(1);
  });

  it('one button after two renders', async () => {
    const { w, all } = await open();
    w.eval(`pagosyaPhotos.decorate(document)`);
    w.eval(`pagosyaPhotos.decorate(document)`);
    expect(all('.menu-item[data-product-id="abrigo"] [data-product-zoom]')).toHaveLength(1);
  });

  it('a click an editor already handled does not open the viewer', async () => {
    const { w, q } = await open();
    w.document.addEventListener('click', (event: any) => event.preventDefault(), { capture: true });
    q('[data-product-zoom]').click();
    expect(q('[data-pagosya-viewer]')?.open ?? false).toBe(false);
  });
});
