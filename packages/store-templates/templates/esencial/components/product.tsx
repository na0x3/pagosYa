import { useEffect } from 'react';
import Shell, { variant } from './Shell';
import { features, productLayout, sections } from './store-data';
import { LibraryHome, type LibraryBlock } from './library';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  // Owner 2026-11-13 (Clyro's product page): «duo» — the photo on its own ground in one rounded panel, the purchase in another, two
  // more products to complete the order, how the store takes payment, and the buy bar that follows on every width.
  const duo = variant('pdp', 'gallery-left') === 'duo';
  return <Shell>
    {duo ? <DuoGround /> : null}
    <ProductPageTemplate>
      <article className="es-pdp" data-es-pdp={variant('pdp', 'gallery-left')} data-es-pdp-order={variant('pdpOrder', 'story-first')}>
        <KitSlot kind="product" name="breadcrumb" className="es-pdp__crumbs" />
        <div className="es-pdp__grid">
          <KitSlot kind="product" name="gallery" className="es-pdp__gallery" />
          <div className="es-pdp__info">
            <KitSlot kind="product" name="title" className="es-pdp__title" />
            {variant('pdp', 'gallery-left') === 'fashion' ? <KitSlot kind="product" name="category" className="es-pdp__category" /> : null}
            <KitSlot kind="product" name="rating" className="es-pdp__rating" />
            <KitSlot kind="product" name="pricing" className="es-pdp__price" />
            <KitSlot kind="product" name="description" className="es-pdp__desc" />
            {variant('pdp', 'gallery-left') === 'fashion' && sections.some(section => section.id === 'sizes') ? <a className="es-pdp__guide" href="index.html#sizes">Guía de tallas</a> : null}
            <KitSlot kind="product" name="buy" className="es-pdp__buy" />
            {duo ? <KitSlot kind="product" name="payments" className="es-pdp__payments" /> : null}
            {duo ? <KitSlot kind="product" name="pairs" className="es-pdp__pairs" /> : null}
            <KitSlot kind="product" name="highlights" className="es-pdp__highlights" />
            <KitSlot kind="product" name="delivery" className="es-pdp__delivery" />
            <KitSlot kind="product" name="info" className="es-pdp__more" />
          </div>
        </div>
        {/* The template's own sections under the buy box (owner 2026-10-31: use cases, how to use, comparison…), filled by YAPI. */}
        {(productLayout as LibraryBlock[]).length ? <div className="es-pdp__sections" data-lb-product><LibraryHome layout={productLayout as LibraryBlock[]} /></div> : null}
        <div className="es-pdp__below">
          <KitSlot kind="product" name="reviews" className="es-pdp__reviews" />
          <KitSlot kind="product" name="related" className="es-pdp__related" />
        </div>
        {duo ? <KitSlot kind="product" name="sticky" className="es-pdp__sticky-mark" /> : null}
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="es-page" data-pagosya-product-page />
  </Shell>;
}

/** The gallery panel takes the colour around the product's first photo (its edge's median), so the photo sits on its own ground
 *  whole, never cropped: read by pagosYa when the store was built (`features.productGrounds`, by upload path), else from the photo
 *  itself when the browser may read it. Otherwise the template's soft ground stays. */
const GROUNDS = ((features as Record<string, unknown>).productGrounds ?? {}) as Record<string, string>;
function DuoGround() {
  useEffect(() => {
    const seen = new WeakSet<HTMLImageElement>();
    const paint = (img: HTMLImageElement) => {
      const panel = img.closest<HTMLElement>('.es-pdp__gallery');
      if (!panel || seen.has(img)) return;
      let path = '';
      try { path = new URL(img.currentSrc || img.src, location.href).pathname; } catch { /* no address */ }
      const saved = GROUNDS[path];
      if (saved) {
        seen.add(img);
        const [r, g, b] = [1, 3, 5].map(at => parseInt(saved.slice(at, at + 2), 16));
        panel.style.setProperty('--pdp-ground', saved);
        panel.dataset.groundTone = 0.2126 * r + 0.7152 * g + 0.0722 * b < 120 ? 'dark' : 'light';
        return;
      }
      if (!img.naturalWidth) return;
      seen.add(img);
      try {
        const size = 24, canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        context.drawImage(img, 0, 0, size, size);
        const { data } = context.getImageData(0, 0, size, size), channels: number[][] = [[], [], []];
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          if (x > 1 && x < size - 2 && y > 1 && y < size - 2) continue;
          const at = (y * size + x) * 4;
          if (data[at + 3] < 200) continue;
          for (const c of [0, 1, 2]) channels[c].push(data[at + c]);
        }
        if (!channels[0].length) return;
        // The median edge colour: a product resting on an edge must not darken the backdrop.
        const [r, g, b] = channels.map(values => values.sort((x, y) => x - y)[values.length >> 1]);
        panel.style.setProperty('--pdp-ground', `rgb(${r} ${g} ${b})`);
        panel.dataset.groundTone = 0.2126 * r + 0.7152 * g + 0.0722 * b < 120 ? 'dark' : 'light';
      } catch { /* a photo from another origin cannot be read */ }
    };
    const first = () => document.querySelector<HTMLImageElement>('.es-pdp__gallery .product-detail__stage img');
    const check = () => { const img = first(); if (img?.complete) paint(img); };
    const loaded = (event: Event) => { const img = event.target as HTMLImageElement; if (img === first()) paint(img); };
    document.addEventListener('load', loaded, true);
    const watch = new MutationObserver(check);
    watch.observe(document.body, { childList: true, subtree: true });
    check();
    return () => { document.removeEventListener('load', loaded, true); watch.disconnect(); };
  }, []);
  return null;
}
