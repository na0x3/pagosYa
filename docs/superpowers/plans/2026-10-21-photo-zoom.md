# Photo Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every pagosYa store lets shoppers open product photos full-screen and zoom them (product page + catalog cards), with a hover magnifier on desktop product pages.

**Architecture:** One new kit runtime part `commerce-src/product/photo-viewer.js` (concatenated into `kit/commerce.js` by `tools/build-commerce.mjs`) owns a single modal `<dialog>` viewer, its stylesheet, the delegated click handling for product-page photos and card zoom buttons, and the magnifier. `catalog/cards.js` adds the card buttons after each catalog render; `product/page.js` marks gallery photos as openers.

**Tech Stack:** Plain browser JS inside the kit IIFE (no modules), jsdom + Jest specs in `apps/api/src/storefront-source/`, Node test for the build.

**Spec:** `docs/superpowers/specs/2026-10-21-photo-zoom-design.md`

## Global Constraints

- Never edit `packages/storefront-kit/kit/commerce.js` by hand: edit `commerce-src/…`, then run `node packages/storefront-kit/tools/build-commerce.mjs`.
- Parts share one IIFE scope; a new part goes into `PARTS` where its code must run (`product/photo-viewer.js` right before `product/page.js`).
- Photos only: URLs matching `/\.(mp4|webm|mov|m4v)(\?|#|$)/i` are skipped; no photos → the viewer never opens.
- Modal `<dialog>`, `aria-label="Fotos de <producto>"`, focus moves in and returns to the opener; the page scroll lock is always given back as found.
- `prefers-reduced-motion: reduce` → no transitions; everything still works.
- Copy: «Ampliar foto de <producto>», «Cerrar», «Foto anterior», «Foto siguiente», «Ver foto N», counter «2 / 5».
- Saving any file under `apps/api/src` (specs too) restarts the API and interrupts a running YAPI job: before creating/saving a spec there, check no YAPI job is RUNNING (ask the owner or query the dev DB) and batch spec edits.
- Never run the whole API jest suite with default workers; run single spec files.
- After the kit change, `npm run build:studio` in `apps/merchant-dashboard` so the Studio's «Ver en navegador» embeds the new kit.

## Review Focus

- A click meant for the Studio's in-place editor must not open the viewer → handlers return when `event.defaultPrevented` (Task 3 test «a click an editor already handled»).
- The product dialog (non-full product page) is itself a modal `<dialog>` holding the scroll lock: opening and closing the viewer over it must leave the lock as the dialog set it (`hidden`) → Task 1 test «restores the overflow it found».
- A gallery that starts with a video: the viewer must open on the tapped photo, not shift by one → Task 1 test «maps the tapped photo past a video».
- Template cards whose photo sits inside the card link (`a[data-product-link] > img`, Esencial): the zoom button must not be nested in the link (clicking would navigate) → Task 3 test «never inside the card link».
- Repeated catalog renders (filters, refresh) must not stack several zoom buttons on one card → Task 3 test «one button after two renders».

---

### Task 1: The viewer part

**Files:**
- Create: `packages/storefront-kit/commerce-src/product/photo-viewer.js`
- Modify: `packages/storefront-kit/tools/build-commerce.mjs` (PARTS: insert `'product/photo-viewer.js',` immediately before `'product/page.js',`)
- Rebuild: `packages/storefront-kit/kit/commerce.js`
- Test: `apps/api/src/storefront-source/source-commerce-photo-viewer.spec.ts`

**Interfaces:**
- Consumes: `escape(text)` (kit helper, already in scope).
- Produces (shared IIFE scope, used by Tasks 2–3):
  - `openPhotoViewer(images: string[], index: number, options: { title: string; opener?: Element | null }): boolean` — false when no photo.
  - `closePhotoViewer(): void`
  - `ensurePhotoViewerStyle(): void` — injects `<style data-pagosya-photo-viewer>` once.
  - `viewerPhotos(list): string[]`, `ZOOM_ICON: string`
  - DOM: `dialog.pagosya-viewer[data-pagosya-viewer]` with `data-index`, `data-zoom` (scale as string: `"1"`, `"2.5"`), `data-zoomed`, `data-single`, `[data-viewer-stage]`, `[data-viewer-photo]`, `[data-viewer-prev]`, `[data-viewer-next]`, `[data-viewer-close]`, `[data-viewer-thumb="N"]`, `[data-viewer-count]`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/storefront-source/source-commerce-photo-viewer.spec.ts` (check for RUNNING YAPI jobs first — Global Constraints):

```ts
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
    expect(w.eval(`openPhotoViewer(${JSON.stringify(product().imageUrls)}, 1, { title: 'Abrigo de lana' })`)).toBe(true);
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
    w.eval(`openPhotoViewer(['https://shop.test/a1.jpg'], 0, { title: 'Abrigo', opener: document.querySelector('[data-cart-open]') })`);
    const viewer = q('[data-pagosya-viewer]');
    expect(w.document.activeElement).toBe(q('[data-viewer-close]'));
    key(viewer, 'Escape');
    expect(viewer.open).toBe(false);
    expect(w.document.documentElement.style.overflow).toBe('hidden');
    expect(w.document.activeElement).toBe(opener);
    w.document.documentElement.style.overflow = '';
    w.eval(`openPhotoViewer(['https://shop.test/a1.jpg'], 0, { title: 'Abrigo' })`);
    expect(w.document.documentElement.style.overflow).toBe('hidden');
    q('[data-viewer-close]').click();
    expect(viewer.open).toBe(false);
    expect(w.document.documentElement.style.overflow).toBe('');
  });

  it('skips videos, maps the tapped photo past a video, and never opens without a photo', async () => {
    const { w, q, all } = await open();
    expect(w.eval(`openPhotoViewer(['https://shop.test/v.mp4'], 0, { title: 'X' })`)).toBe(false);
    expect(q('[data-pagosya-viewer]')?.open ?? false).toBe(false);
    w.eval(`openPhotoViewer(['https://shop.test/v.mp4?x=1', 'https://shop.test/a1.jpg', 'https://shop.test/a2.jpg'], 2, { title: 'X' })`);
    expect(q('[data-viewer-photo]').getAttribute('src')).toBe('https://shop.test/a2.jpg');
    expect(all('[data-viewer-thumb]')).toHaveLength(2);
  });

  it('a single photo has no arrows or thumbnails', async () => {
    const { w, q, all } = await open();
    w.eval(`openPhotoViewer(['https://shop.test/a1.jpg'], 0, { title: 'X' })`);
    expect(q('[data-viewer-prev]').hidden).toBe(true);
    expect(q('[data-viewer-next]').hidden).toBe(true);
    expect(all('[data-viewer-thumb]')).toHaveLength(0);
    expect(q('[data-pagosya-viewer]').hasAttribute('data-single')).toBe(true);
  });

  it('double-click zooms in and out, and a new photo starts unzoomed', async () => {
    const { w, q } = await open();
    w.eval(`openPhotoViewer(['https://shop.test/a1.jpg', 'https://shop.test/a2.jpg'], 0, { title: 'X' })`);
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
    w.eval(`openPhotoViewer(['https://shop.test/a1.jpg'], 0, { title: 'X' })`);
    const viewer = q('[data-pagosya-viewer]'), stage = q('[data-viewer-stage]');
    stage.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
    stage.click();
    expect(viewer.open).toBe(true);
    stage.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
    stage.click();
    expect(viewer.open).toBe(false);
  });

  it('escapes photo URLs and titles', async () => {
    const { w, q } = await open();
    w.eval(`openPhotoViewer(['https://shop.test/a"1.jpg', 'https://shop.test/a2.jpg'], 0, { title: '<b>X</b>' })`);
    expect(q('[data-pagosya-viewer]').getAttribute('aria-label')).toBe('Fotos de <b>X</b>');
    expect(q('[data-viewer-thumbs] b')).toBeNull();
    expect(q('[data-viewer-thumb] img').getAttribute('src')).toBe('https://shop.test/a"1.jpg');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-photo-viewer.spec.ts`
Expected: FAIL — `openPhotoViewer is not defined`.

- [ ] **Step 3: Write the part**

Create `packages/storefront-kit/commerce-src/product/photo-viewer.js` (two-space indent like every part — it is a run of lines inside the IIFE):

```js
  // ---- Photo viewer (spec 2026-10-21 photo zoom) ----
  // One full-screen modal <dialog> for a product's photos: ‹ ›, ←/→ or a swipe move between them; double-click, double-tap,
  // pinch or the wheel zoom (1×–4×) at the point asked; a zoomed photo is dragged to look around. A modal dialog so it rises
  // above the product dialog (top layer). The page scroll lock it sets is always given back as it found it.
  const VIEWER_VIDEO = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
  const VIEWER_MAX = 4, VIEWER_STEP = 2.5;
  const ZOOM_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/></svg>';
  const PHOTO_VIEWER_CSS = `
    :where(.pagosya-viewer){position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:color-mix(in srgb,var(--store-background,#fff) 97%,transparent);color:var(--store-foreground,#111);overflow:hidden}
    .pagosya-viewer::backdrop{background:transparent}
    .pagosya-viewer:not([open]){display:none}
    .pagosya-viewer__stage{position:absolute;inset:0 0 88px;display:grid;place-items:center;overflow:hidden;touch-action:none;cursor:zoom-in}
    .pagosya-viewer[data-single] .pagosya-viewer__stage{bottom:0}
    .pagosya-viewer[data-zoomed] .pagosya-viewer__stage{cursor:grab}
    .pagosya-viewer[data-dragging] .pagosya-viewer__stage{cursor:grabbing}
    .pagosya-viewer__photo{max-width:100%;max-height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;transition:transform .25s cubic-bezier(.2,.7,.2,1);will-change:transform}
    .pagosya-viewer[data-dragging] .pagosya-viewer__photo{transition:none}
    :where(.pagosya-viewer) button{font:inherit;color:inherit;background:var(--store-background,#fff);border:1px solid color-mix(in srgb,currentColor 18%,transparent);cursor:pointer}
    :where(.pagosya-viewer__close,.pagosya-viewer__nav){position:absolute;z-index:2;display:grid;place-items:center;width:44px;height:44px;padding:0;border-radius:999px;font-size:26px;line-height:1}
    .pagosya-viewer__close{top:16px;right:16px}
    .pagosya-viewer__nav{top:calc(50% - 66px)}
    .pagosya-viewer__nav--prev{left:16px}.pagosya-viewer__nav--next{right:16px}
    .pagosya-viewer__nav[hidden]{display:none}
    .pagosya-viewer__count{position:absolute;top:28px;left:20px;margin:0;font-size:13px;letter-spacing:.06em}
    .pagosya-viewer__thumbs{position:absolute;left:0;right:0;bottom:16px;display:flex;justify-content:center;gap:8px;padding:0 16px;overflow-x:auto}
    :where(.pagosya-viewer__thumbs) button{flex:0 0 56px;width:56px;height:56px;padding:0;border-radius:4px;overflow:hidden;opacity:.6}
    .pagosya-viewer__thumbs button[aria-current=true]{opacity:1;outline:1.5px solid currentColor;outline-offset:2px}
    .pagosya-viewer__thumbs img{display:block;width:100%;height:100%;object-fit:cover}
    @media(max-width:640px){.pagosya-viewer__nav{display:none}}
    :where([data-product-zoom]){position:absolute;top:10px;right:10px;z-index:3;display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:999px;background:color-mix(in srgb,var(--store-background,#fff) 88%,transparent);color:var(--store-foreground,#111);cursor:zoom-in;box-shadow:0 1px 3px rgba(0,0,0,.12)}
    [data-product-zoom] svg{width:18px;height:18px}
    :where(:has(>[data-product-zoom])){position:relative}
    @media(hover:hover){:where([data-product-zoom]){opacity:0;transition:opacity .2s}:where(.menu-item:hover,.menu-item:focus-within) [data-product-zoom]{opacity:1}}
    @media(hover:none){:where([data-product-zoom]){width:30px;height:30px}}
    :where([data-photo-zoom]){cursor:zoom-in}
    :where(.product-detail__stage[data-magnify]){overflow:hidden}
    .product-detail__stage[data-magnify] .product-detail__photo{scale:2;transition:scale .2s ease}
    @media(prefers-reduced-motion:reduce){.pagosya-viewer__photo,.product-detail__stage[data-magnify] .product-detail__photo,:where([data-product-zoom]){transition:none}}
  `;
  let photoViewer = null;
  const viewerState = { images: [], index: 0, scale: 1, x: 0, y: 0, title: '', opener: null, lockedFrom: null, moved: false, lastTap: 0 };
  const viewerPhotos = list => (Array.isArray(list) ? list : []).filter(url => typeof url === 'string' && url && !VIEWER_VIDEO.test(url));
  function ensurePhotoViewerStyle() {
    if (document.querySelector('style[data-pagosya-photo-viewer]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-pagosya-photo-viewer', '');
    style.textContent = PHOTO_VIEWER_CSS;
    document.head.append(style);
  }
  function photoViewerElement() {
    if (photoViewer?.isConnected) return photoViewer;
    ensurePhotoViewerStyle();
    photoViewer = document.createElement('dialog');
    photoViewer.className = 'pagosya-viewer';
    photoViewer.setAttribute('data-pagosya-viewer', '');
    photoViewer.innerHTML = '<div class="pagosya-viewer__stage" data-viewer-stage><img class="pagosya-viewer__photo" data-viewer-photo alt="" draggable="false" /></div>'
      + '<p class="pagosya-viewer__count" data-viewer-count aria-live="polite"></p>'
      + '<button type="button" class="pagosya-viewer__close" data-viewer-close aria-label="Cerrar">×</button>'
      + '<button type="button" class="pagosya-viewer__nav pagosya-viewer__nav--prev" data-viewer-prev aria-label="Foto anterior">‹</button>'
      + '<button type="button" class="pagosya-viewer__nav pagosya-viewer__nav--next" data-viewer-next aria-label="Foto siguiente">›</button>'
      + '<div class="pagosya-viewer__thumbs" data-viewer-thumbs></div>';
    document.body.append(photoViewer);
    wirePhotoViewer(photoViewer);
    return photoViewer;
  }
  function viewerApply() {
    const el = photoViewer, photo = el.querySelector('[data-viewer-photo]'), stage = el.querySelector('[data-viewer-stage]');
    const s = viewerState.scale;
    // Pan stops where the photo's edge meets the stage's: never a gap on a side the photo is wider than.
    const maxX = Math.max(0, (photo.offsetWidth * s - stage.clientWidth) / 2), maxY = Math.max(0, (photo.offsetHeight * s - stage.clientHeight) / 2);
    viewerState.x = s === 1 ? 0 : Math.max(-maxX, Math.min(maxX, viewerState.x));
    viewerState.y = s === 1 ? 0 : Math.max(-maxY, Math.min(maxY, viewerState.y));
    photo.style.transform = `translate(${Math.round(viewerState.x)}px, ${Math.round(viewerState.y)}px) scale(${s})`;
    el.dataset.zoom = String(Math.round(s * 100) / 100);
    el.toggleAttribute('data-zoomed', s > 1);
  }
  // Zoom to `next` keeping the point (px, py), measured from the stage centre, under the finger or cursor.
  function viewerZoomTo(next, px = 0, py = 0) {
    const from = viewerState.scale, to = Math.max(1, Math.min(VIEWER_MAX, next));
    viewerState.x = px - (px - viewerState.x) * (to / from);
    viewerState.y = py - (py - viewerState.y) * (to / from);
    viewerState.scale = to;
    viewerApply();
  }
  function viewerPoint(event) {
    const rect = photoViewer.querySelector('[data-viewer-stage]').getBoundingClientRect();
    return [(event.clientX || 0) - (rect.left + rect.width / 2), (event.clientY || 0) - (rect.top + rect.height / 2)];
  }
  function viewerToggleZoom(event) {
    const [px, py] = viewerPoint(event);
    viewerZoomTo(viewerState.scale > 1 ? 1 : VIEWER_STEP, px, py);
  }
  function viewerShow(index) {
    const el = photoViewer, count = viewerState.images.length;
    viewerState.index = ((index % count) + count) % count;
    viewerState.scale = 1; viewerState.x = 0; viewerState.y = 0;
    const photo = el.querySelector('[data-viewer-photo]');
    photo.src = viewerState.images[viewerState.index];
    photo.alt = count > 1 ? `${viewerState.title} · foto ${viewerState.index + 1} de ${count}` : viewerState.title;
    el.querySelector('[data-viewer-count]').textContent = count > 1 ? `${viewerState.index + 1} / ${count}` : '';
    el.querySelectorAll('[data-viewer-thumb]').forEach(button => button.setAttribute('aria-current', String(Number(button.dataset.viewerThumb) === viewerState.index)));
    el.dataset.index = String(viewerState.index);
    viewerApply();
  }
  const viewerGo = step => { if (viewerState.images.length > 1) viewerShow(viewerState.index + step); };
  function openPhotoViewer(images, index, options = {}) {
    const list = viewerPhotos(images);
    if (!list.length) return false;
    const el = photoViewerElement();
    const asked = Array.isArray(images) ? images[index] : undefined;
    viewerState.images = list;
    viewerState.title = String(options.title || '');
    viewerState.opener = options.opener || document.activeElement;
    el.setAttribute('aria-label', `Fotos de ${viewerState.title}`);
    el.toggleAttribute('data-single', list.length === 1);
    el.querySelector('[data-viewer-prev]').hidden = list.length === 1;
    el.querySelector('[data-viewer-next]').hidden = list.length === 1;
    el.querySelector('[data-viewer-thumbs]').innerHTML = list.length > 1
      ? list.map((url, i) => `<button type="button" data-viewer-thumb="${i}" aria-label="Ver foto ${i + 1}"><img src="${escape(url)}" alt="" loading="lazy" /></button>`).join('') : '';
    viewerShow(Math.max(0, list.indexOf(asked)));
    if (!el.open) {
      viewerState.lockedFrom = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      if (typeof el.showModal === 'function') el.showModal(); else el.setAttribute('open', '');
    }
    el.querySelector('[data-viewer-close]').focus({ preventScroll: true });
    return true;
  }
  function closePhotoViewer() {
    const el = photoViewer;
    if (!el || !el.open) return;
    if (typeof el.close === 'function') el.close(); else el.removeAttribute('open');
    document.documentElement.style.overflow = viewerState.lockedFrom || '';
    viewerState.lockedFrom = null;
    const opener = viewerState.opener;
    viewerState.opener = null;
    if (opener?.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
  }
  function wirePhotoViewer(el) {
    const stage = el.querySelector('[data-viewer-stage]');
    const pointers = new Map();
    let pinchFrom = 0, pinchScale = 1, start = null;
    el.addEventListener('cancel', event => { event.preventDefault(); closePhotoViewer(); });
    el.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); viewerGo(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); viewerGo(1); }
      else if (event.key === 'Escape') { event.preventDefault(); closePhotoViewer(); }
    });
    el.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button?.hasAttribute('data-viewer-close')) return closePhotoViewer();
      if (button?.hasAttribute('data-viewer-prev')) return viewerGo(-1);
      if (button?.hasAttribute('data-viewer-next')) return viewerGo(1);
      if (button?.hasAttribute('data-viewer-thumb')) return viewerShow(Number(button.dataset.viewerThumb));
      if (event.target === stage && viewerState.scale === 1 && !viewerState.moved) closePhotoViewer();
    });
    stage.addEventListener('dblclick', event => { event.preventDefault(); viewerToggleZoom(event); });
    stage.addEventListener('wheel', event => {
      event.preventDefault();
      const [px, py] = viewerPoint(event);
      viewerZoomTo(viewerState.scale * Math.exp(-event.deltaY * 0.002), px, py);
    }, { passive: false });
    stage.addEventListener('pointerdown', event => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      stage.setPointerCapture?.(event.pointerId);
      viewerState.moved = false;
      start = { x: event.clientX, y: event.clientY, panX: viewerState.x, panY: viewerState.y };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchFrom = Math.hypot(a.x - b.x, a.y - b.y) || 1; pinchScale = viewerState.scale;
      }
    });
    stage.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId) || !start) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) viewerState.moved = true;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const [px, py] = viewerPoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        viewerZoomTo(pinchScale * (Math.hypot(a.x - b.x, a.y - b.y) / pinchFrom), px, py);
      } else if (viewerState.scale > 1) {
        el.setAttribute('data-dragging', '');
        viewerState.x = start.panX + (event.clientX - start.x);
        viewerState.y = start.panY + (event.clientY - start.y);
        viewerApply();
      }
    });
    const release = event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      el.removeAttribute('data-dragging');
      if (pointers.size || !start) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      // A swipe at 1× moves between photos; a quick second tap on touch toggles zoom (mobile Safari sends no dblclick).
      if (viewerState.scale === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) viewerGo(dx < 0 ? 1 : -1);
      else if (event.pointerType === 'touch' && !viewerState.moved) {
        const now = Date.now();
        if (now - viewerState.lastTap < 300) { viewerToggleZoom(event); viewerState.lastTap = 0; viewerState.moved = true; } else viewerState.lastTap = now;
      }
      start = null;
    };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
  }
```

Add to `PARTS` in `packages/storefront-kit/tools/build-commerce.mjs` so the list reads:

```js
  'pages/standard.js',
  'product/photo-viewer.js',
  'product/page.js',
```

Then build: `node packages/storefront-kit/tools/build-commerce.mjs`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-photo-viewer.spec.ts && cd ../.. && node --test packages/storefront-kit/tools/build-commerce.test.mjs`
Expected: PASS (7 viewer tests; build tests green).

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/commerce-src/product/photo-viewer.js packages/storefront-kit/tools/build-commerce.mjs packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-photo-viewer.spec.ts
git commit -m "feat(kit): full-screen photo viewer — swipe, arrows, double-tap/pinch/wheel zoom, drag"
```

---

### Task 2: Product-page openers and the desktop magnifier

**Files:**
- Modify: `packages/storefront-kit/commerce-src/product/page.js` (`plainGalleryMarkup` and the stacked branch of `galleryMarkup`, lines ~108–124)
- Modify: `packages/storefront-kit/commerce-src/product/photo-viewer.js` (append the delegated product-page handlers)
- Rebuild: `packages/storefront-kit/kit/commerce.js`
- Test: `apps/api/src/storefront-source/source-commerce-photo-viewer.spec.ts`

**Interfaces:**
- Consumes: `openPhotoViewer`, `ensurePhotoViewerStyle` (Task 1); `currentGallery()`, `selectedImage`, `selectedProduct` (product/page.js and product/setup.js, read at event time).
- Produces: `.product-detail__photo[data-photo-zoom=""]` (stage photo = the shown one) and `.product-detail__stack img[data-photo-zoom="N"]`; `.product-detail__stage[data-magnify]` while a fine mouse hovers.

- [ ] **Step 1: Write the failing tests** (append inside `describe('photo viewer', …)`)

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-photo-viewer.spec.ts -t "product page|stacked|magnifies"`
Expected: FAIL — `data-photo-zoom` is null.

- [ ] **Step 3: Implement**

In `product/page.js`, `plainGalleryMarkup`: change the stage photo from

```js
<img class="product-detail__photo" src="${escape(images[0])}"${responsiveAttrs(images[0], "(max-width: 820px) 100vw, 55vw")} alt="${escape(p.name)}" />
```

to

```js
<img class="product-detail__photo" src="${escape(images[0])}"${responsiveAttrs(images[0], "(max-width: 820px) 100vw, 55vw")} alt="${escape(p.name)}" data-photo-zoom="" role="button" tabindex="0" aria-label="${escape(`Ampliar foto de ${p.name}`)}" />
```

In `galleryMarkup`'s stacked branch, change `<img data-part="thumb" src=` to `<img data-part="thumb" data-photo-zoom="${index}" src=` inside the `images.map((url, index) => …)` template.

Append to `product/photo-viewer.js`:

```js
  // Product page: the shown photo (data-photo-zoom="") or a stacked one (its index) opens the viewer. A click an editor already
  // handled (defaultPrevented) is left alone.
  function openProductPhoto(target) {
    const own = target.getAttribute('data-photo-zoom');
    const index = own === '' ? selectedImage : Number(own);
    return openPhotoViewer(currentGallery(), Number.isFinite(index) ? index : 0, { title: selectedProduct?.name || '', opener: target });
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented) return;
    const target = event.target.closest?.('[data-pagosya-product] [data-photo-zoom]');
    if (target && openProductPhoto(target)) event.preventDefault();
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || (event.key !== 'Enter' && event.key !== ' ')) return;
    const target = event.target.closest?.('[data-pagosya-product] [data-photo-zoom]');
    if (target && openProductPhoto(target)) event.preventDefault();
  });
  // Desktop magnifier: a fine mouse over the stage photo zooms it 2× around the cursor; leaving the stage resets it.
  document.addEventListener('pointermove', event => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    const photo = event.target.closest?.('[data-pagosya-product] .product-detail__stage .product-detail__photo');
    if (!photo || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    ensurePhotoViewerStyle();
    const stage = photo.closest('.product-detail__stage'), rect = photo.getBoundingClientRect();
    const x = rect.width ? ((event.clientX - rect.left) / rect.width) * 100 : 50, y = rect.height ? ((event.clientY - rect.top) / rect.height) * 100 : 50;
    photo.style.transformOrigin = `${Math.max(0, Math.min(100, x)).toFixed(1)}% ${Math.max(0, Math.min(100, y)).toFixed(1)}%`;
    if (!stage.hasAttribute('data-magnify')) {
      stage.setAttribute('data-magnify', '');
      stage.addEventListener('pointerleave', () => stage.removeAttribute('data-magnify'), { once: true });
    }
  });
```

(`transform-origin` steers the `scale` property set by Task 1's CSS; the stage photo's existing `transform` rules stay untouched because `scale` is a separate property.) If `selectedImage`/`selectedProduct`/`currentGallery` turn out to be named differently, read `product/page.js` lines 85–110 and `product/setup.js` and use the real names (they are what `showImage` uses).

Rebuild: `node packages/storefront-kit/tools/build-commerce.mjs`

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-photo-viewer.spec.ts src/storefront-source/source-commerce-atelier.spec.ts src/storefront-source/source-commerce-long-page.spec.ts`
Expected: PASS (atelier/long-page guard the gallery markup).

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/commerce-src packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-photo-viewer.spec.ts
git commit -m "feat(kit): product-page photos open the viewer; desktop hover magnifier"
```

---

### Task 3: Card zoom buttons

**Files:**
- Modify: `packages/storefront-kit/commerce-src/catalog/cards.js` (`structureCatalog`, ~line 198)
- Modify: `packages/storefront-kit/commerce-src/product/photo-viewer.js` (append `decorateZoomButtons` + delegated click)
- Rebuild: `packages/storefront-kit/kit/commerce.js`
- Test: `apps/api/src/storefront-source/source-commerce-photo-viewer.spec.ts`

**Interfaces:**
- Consumes: `openPhotoViewer`, `ensurePhotoViewerStyle`, `viewerPhotos`, `ZOOM_ICON` (Task 1); `products()` (shared/state.js); `galleryImages(p)` (kit, in scope).
- Produces: `decorateZoomButtons(root: Element | Document): void`; `button[data-product-zoom][aria-label="Ampliar foto de <name>"]` in each card that shows a photo.

- [ ] **Step 1: Write the failing tests** (append inside the describe)

```ts
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

  it('a template that draws its own zoom button keeps it and gets no second one', async () => {
    const own = esCard.replace('<h3', '<button type="button" data-product-zoom aria-label="Zoom">Z</button><h3');
    const { all } = await open({ template: own });
    expect(all('[data-product-id="abrigo"] [data-product-zoom]')).toHaveLength(1);
  });

  it('one button after two renders', async () => {
    const { w, all } = await open();
    w.eval(`decorateZoomButtons(document)`);
    w.eval(`decorateZoomButtons(document)`);
    expect(all('.menu-item[data-product-id="abrigo"] [data-product-zoom]')).toHaveLength(1);
  });

  it('a click an editor already handled does not open the viewer', async () => {
    const { w, q } = await open();
    w.document.addEventListener('click', (event: any) => event.preventDefault(), { capture: true });
    q('[data-product-zoom]').click();
    expect(q('[data-pagosya-viewer]')?.open ?? false).toBe(false);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-photo-viewer.spec.ts -t "cards|template|renders|editor"`
Expected: FAIL — no `[data-product-zoom]`.

- [ ] **Step 3: Implement**

Append to `product/photo-viewer.js`:

```js
  // Cards: a small «Ampliar foto» button on every card that shows a photo. It goes in the photo's holder, or in the card itself
  // when the holder is the card's link or button (a button inside a link would follow the link). A template's own button stays.
  function decorateZoomButtons(root) {
    const cards = root?.querySelectorAll?.('.menu-item[data-product-id]');
    if (!cards?.length) return;
    let added = false;
    cards.forEach(card => {
      if (card.querySelector('[data-product-zoom]')) return;
      const photo = card.querySelector('img.menu-item__image[src]');
      const p = products().find(item => item.id === card.dataset.productId);
      if (!photo || photo.hidden || !p || !viewerPhotos(galleryImages(p)).length) return;
      const holder = photo.parentElement && photo.parentElement !== card && !photo.parentElement.closest('a,button') ? photo.parentElement : card;
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-product-zoom', '');
      button.setAttribute('aria-label', `Ampliar foto de ${p.name}`);
      button.innerHTML = ZOOM_ICON;
      holder.append(button);
      added = true;
    });
    if (added) ensurePhotoViewerStyle();
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented) return;
    const button = event.target.closest?.('[data-product-zoom]');
    if (!button) return;
    const card = button.closest('[data-product-id]');
    const p = card && products().find(item => item.id === card.dataset.productId);
    if (!p) return;
    event.preventDefault();
    event.stopPropagation();
    openPhotoViewer(galleryImages(p), 0, { title: p.name, opener: button });
  });
```

This part runs before `shared/click-actions.js` in `PARTS`, so its document listener is registered first and `stopPropagation` keeps later document click handlers from also acting. Check `shared/click-actions.js` and `catalog/*.js` for capturing (`true` / `{ capture: true }`) click listeners on `data-product`; if one exists, add `if (event.target.closest?.('[data-product-zoom]')) return;` as its first line.

In `catalog/cards.js` `structureCatalog(el)`, before `readableText(el);`:

```js
    // Photo zoom (spec 2026-10-21): every card with a photo gets its «Ampliar foto» button.
    decorateZoomButtons(el);
```

Rebuild: `node packages/storefront-kit/tools/build-commerce.mjs`

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-photo-viewer.spec.ts src/storefront-source/source-commerce-card-insides.spec.ts src/storefront-source/source-commerce-product-card.spec.ts src/storefront-source/source-commerce-templates.spec.ts`
Expected: viewer spec PASS; the others keep their state from before this task (record the pass/fail counts before Step 3 with the same command; the 14 known jsdom failures in product-card/conversion are pre-existing).

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/commerce-src packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-photo-viewer.spec.ts
git commit -m "feat(kit): «Ampliar foto» button on every catalog card opens the photo viewer"
```

---

### Task 4: Studio rebuild and browser check

**Files:**
- Rebuild: `apps/merchant-dashboard` Studio bundle

- [ ] **Step 1: Kit checks**

Run: `cd packages/storefront-kit && npm test`
Expected: PASS (build test, runtime check, typecheck).

- [ ] **Step 2: Rebuild the Studio bundle**

Run: `cd apps/merchant-dashboard && npm run build:studio`
Expected: build succeeds.

- [ ] **Step 3: Browser check (desktop 1440 and phone 390)**

With the owner's stack running (`pnpm dev:chatgpt`; never `pkill server.mjs`), open the NOA VARGAS store (Esencial) and one YAPI-coded store (e.g. baek). On each:
1. Catalog: hover a card → «Ampliar foto» appears; click it → viewer opens on photo 1; the product does not open.
2. Viewer: ‹ › and ←/→ move; double-click zooms; drag moves the zoomed photo; wheel zooms; Esc closes and focus returns to the button.
3. Product page: hover the main photo → magnifies at the cursor; click → viewer opens on the shown photo.
4. 390 px: the button is visible on cards; swipe moves photos; double-tap zooms; × closes; the page scrolls normally afterwards.
Screenshot each step. A failing step gets a reproducing jsdom test where possible, a fix in the part, a rebuild and a recheck.

- [ ] **Step 4: Commit the Studio bundle if it is tracked**

```bash
git status --short apps/merchant-dashboard
# only if the bundle shows as modified:
git add apps/merchant-dashboard && git commit -m "build(studio): embed the kit with the photo viewer"
```
